#!/usr/bin/env node
/**
 * Catch out-of-scope identifier references in edge functions.
 *
 * WHY THIS EXISTS
 * `send-ticket-email/index.ts` is one giant handler of sibling `if (body.mode
 * === '...')` blocks, each declaring its own `const tpl = resolveEmailTemplate(…)`.
 * Because the blocks look identical, it is very easy to copy a line referencing
 * `tpl` into a mode that has no `tpl` — the file carries `// @ts-nocheck`, so
 * tsc cannot see it, the repo's `tsc --noEmit` excludes supabase/functions, and
 * CI deploys edge functions with no type or lint step at all.
 *
 * That is exactly what happened on 2026-08-19: a `headerImageUrl: tpl.headerImageUrl`
 * was added to the `contact-register-invite` mode, which receives pre-composed
 * html and has no `tpl`. Every free-registration invite threw a ReferenceError
 * and returned 500 — on BOTH tenants — until it was found by audit rather than
 * by any automated check.
 *
 * SCOPE OF THIS CHECK (deliberately narrow, so it has ~zero false positives):
 * within each `if (body.mode === 'x') { … }` block, any reference to a
 * template-ish or attachment-ish local (`tpl`, `notifyTpl`, `*Tpl`, `*Pdf`)
 * must be declared inside that same block. It is NOT a general scope analyser
 * and makes no attempt to be one — it targets the one shape that has actually
 * bitten production.
 *
 * Usage: node scripts/check-edge-scope.mjs [--json]
 * Exit 1 on any finding.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const FUNCTIONS_DIR = 'supabase/functions';

/** Locals worth policing: the ones that repeat identically across mode blocks. */
const SUSPECT = /^(tpl|notifyTpl|[A-Za-z_$][\w$]*(?:Tpl|Pdf))$/;

/** Names that are legitimately module-scope or parameters, not per-block locals. */
const ALLOWED_GLOBALS = new Set([
  'buildTicketPdfAttachment', 'resolveEmailTemplate', 'attachmentNoteFor',
  'ensureTicketBlocks', 'prependReissueNotice',
]);

function declaredNames(line) {
  const out = [];
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  // Destructuring: const { a, b } = ...
  const d = line.match(/(?:const|let|var)\s*\{([^}]*)\}/);
  if (d) {
    for (const part of d[1].split(',')) {
      const name = part.split(':').pop().trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
    }
  }
  return out;
}

export function findOutOfScopeRefs(source) {
  const lines = source.split(/\r?\n/);
  const findings = [];
  let mode = null;
  let declared = new Set();

  lines.forEach((line, i) => {
    const start = line.match(/if \(\s*body\.mode\s*===\s*['"]([\w-]+)['"]\s*\)/);
    if (start) {
      mode = start[1];
      declared = new Set();
      return;
    }
    for (const name of declaredNames(line)) declared.add(name);
    if (!mode) return;

    // Only inspect identifier *uses* on the right of a colon or in an
    // expression — good enough for the property-access shape that bit us.
    const uses = line.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?:\.\w+|\?)/g);
    for (const u of uses) {
      const name = u[1];
      if (!SUSPECT.test(name)) continue;
      if (ALLOWED_GLOBALS.has(name)) continue;
      if (declared.has(name)) continue;
      findings.push({ mode, line: i + 1, name, text: line.trim().slice(0, 120) });
    }
  });
  return findings;
}

function main() {
  if (!existsSync(FUNCTIONS_DIR)) {
    console.error(`check-edge-scope: ${FUNCTIONS_DIR} not found`);
    process.exit(1);
  }
  const fns = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => join(FUNCTIONS_DIR, d.name, 'index.ts'))
    .filter(existsSync);

  let total = 0;
  for (const file of fns) {
    const findings = findOutOfScopeRefs(readFileSync(file, 'utf8'));
    if (!findings.length) continue;
    total += findings.length;
    console.error(`\n${file}`);
    for (const f of findings) {
      console.error(`  line ${f.line}  mode '${f.mode}'  uses '${f.name}' which is not declared in that block`);
      console.error(`    ${f.text}`);
    }
  }

  if (total > 0) {
    console.error(`\n✗ check-edge-scope: ${total} out-of-scope reference(s).`);
    console.error('  These throw ReferenceError at runtime and return 500 — tsc cannot see them (@ts-nocheck).');
    process.exit(1);
  }
  console.log(`✓ check-edge-scope: ${fns.length} edge function(s), no out-of-scope references`);
}

// `file://${path}` does not round-trip on Windows (import.meta.url uses
// file:///C:/... with three slashes), so the hand-rolled comparison silently
// never matched and running this script printed NOTHING — indistinguishable
// from a pass. pathToFileURL is the platform-correct comparison.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
