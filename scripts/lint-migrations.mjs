#!/usr/bin/env node
// scripts/lint-migrations.mjs
//
// Static lint for supabase/migrations/*.sql. Catches the foot-guns that
// pass `apply_migration` without erroring but break the data plane at
// runtime. Runs via `npm run lint:migrations`.
//
// Checks (each can be silenced per-statement with `-- @lint-ignore: <rule>`):
//
//   rls-recursion           A CREATE POLICY whose USING clause selects from
//                           the same table being protected. Postgres rejects
//                           every SELECT against the table with error 42P17.
//                           Shipped once (2026-05-26 BOGO migration) and
//                           blanked every dashboard.
//
//   missing-if-not-exists   ADD COLUMN / CREATE INDEX / CREATE POLICY without
//                           `IF NOT EXISTS`. Migration re-runs blow up;
//                           branch-cherry-picks blow up.
//
//   destructive-op          DROP TABLE, DROP COLUMN, TRUNCATE, DROP CONSTRAINT,
//                           DELETE without WHERE. Permitted only when the
//                           PREVIOUS non-blank line is `-- @destructive: confirmed`.
//
//   check-constraint-rewrite ALTER TABLE ... DROP CONSTRAINT ... + ADD
//                           CONSTRAINT CHECK in the same migration. Per
//                           CLAUDE.md §16 rule 3, requires the author to
//                           probe distinct values on production first.
//                           Permitted with `-- @check-constraint: probed`.
//
// Exit 1 on any violation. Run as part of `npm run predeploy`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations');

// Migrations whose timestamp prefix is < this baseline are grandfathered —
// they shipped before this linter existed and would noisily trip on legacy
// CREATE POLICY without DROP-first etc. Bump this date AFTER fixing any
// violation in a newer file. Format: YYYYMMDDHHMMSS.
const LINT_BASELINE = '20260527000000';

const RULES = {
  'rls-recursion': 'RLS policy USING clause references its own table — Postgres rejects every SELECT (42P17). Reformulate via SECURITY DEFINER helper or join through a non-recursive relation.',
  'missing-if-not-exists': 'Additive DDL without IF NOT EXISTS — re-runs and branch cherry-picks will fail. Add the clause.',
  'destructive-op': 'Destructive operation without explicit confirmation. If intentional, prepend `-- @destructive: confirmed` immediately above the statement.',
  'check-constraint-rewrite': 'CHECK constraint rewrite — probe distinct values on production first (CLAUDE.md §16 rule 3) and add `-- @check-constraint: probed`.',
};

const FILES_GLOB = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  // Skip grandfathered legacy files. Migration filenames start with a
  // YYYYMMDDHHMMSS timestamp prefix.
  .filter(f => {
    const ts = (f.match(/^(\d{14})/) ?? [])[1];
    return ts ? ts >= LINT_BASELINE : true;
  })
  .map(f => path.join(MIGRATIONS_DIR, f));

/** All findings across all files: { file, line, rule, snippet, msg } */
const findings = [];

function reportLine(file, lineIdx, rule, snippet) {
  findings.push({
    file: path.relative(process.cwd(), file),
    line: lineIdx + 1,
    rule,
    snippet: snippet.slice(0, 140),
  });
}

function isIgnored(lines, lineIdx, rule) {
  // Inline ignore on the same line.
  if (lines[lineIdx].includes(`@lint-ignore: ${rule}`)) return true;
  // Or on the previous non-blank line.
  for (let j = lineIdx - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith('--')) {
      return t.includes(`@lint-ignore: ${rule}`);
    }
    return false;
  }
  return false;
}

function previousNonBlankIsComment(lines, lineIdx, marker) {
  for (let j = lineIdx - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (!t) continue;
    return t.startsWith('--') && t.includes(marker);
  }
  return false;
}

function stripComments(src) {
  // Strip single-line `-- comment` to avoid false positives inside comments,
  // but preserve newlines + line indices for accurate reporting.
  return src.split('\n').map(line => {
    const idx = line.indexOf('--');
    return idx >= 0 ? line.slice(0, idx) : line;
  });
}

function lintFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rawLines = src.split('\n');
  const codeLines = stripComments(src);
  const codeJoined = codeLines.join('\n');

  // ── rls-recursion ─────────────────────────────────────────────────
  // Match CREATE POLICY "name" ON <table> ... USING (... <body> ...);
  // and verify the body doesn't `FROM <table>` (the same table).
  const policyRe = /create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+(?:public\.)?(\w+)\s+([\s\S]*?);\s*$/gim;
  let m;
  while ((m = policyRe.exec(codeJoined)) !== null) {
    const table = m[1];
    const body = m[2];
    // Find USING (...) or WITH CHECK (...)
    const clauseRe = /(?:using|with\s+check)\s*\(([\s\S]*?)\)\s*(?:;|with\s+check|using)/gi;
    let c;
    while ((c = clauseRe.exec(body + ';')) !== null) {
      const clause = c[1];
      // Look for FROM <same table> (with or without `public.`)
      const recursionRe = new RegExp(`from\\s+(?:public\\.)?${table}\\b`, 'i');
      if (recursionRe.test(clause)) {
        // Locate the original line index for reporting.
        const offset = m.index + body.indexOf(clause);
        const lineIdx = codeJoined.slice(0, offset).split('\n').length - 1;
        if (!isIgnored(rawLines, lineIdx, 'rls-recursion')) {
          reportLine(file, lineIdx, 'rls-recursion',
            `CREATE POLICY on "${table}" references "${table}" inside USING/WITH CHECK clause`);
        }
      }
    }
  }

  // ── missing-if-not-exists ─────────────────────────────────────────
  // ADD COLUMN, CREATE INDEX, CREATE POLICY without IF NOT EXISTS.
  // Note: CREATE POLICY doesn't support IF NOT EXISTS — for policies we
  // accept either a preceding DROP POLICY IF EXISTS or the OR REPLACE
  // variant. Postgres 15+ has CREATE POLICY ... IF NOT EXISTS but it's
  // safer to use DROP+CREATE for idempotency.
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const codeLine = codeLines[i];

    // ADD COLUMN without IF NOT EXISTS
    if (/\badd\s+column\s+(?!if\s+not\s+exists)/i.test(codeLine)) {
      if (!isIgnored(rawLines, i, 'missing-if-not-exists')) {
        reportLine(file, i, 'missing-if-not-exists', line.trim());
      }
    }
    // CREATE INDEX without IF NOT EXISTS (skip CREATE UNIQUE INDEX which is also covered)
    if (/\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/i.test(codeLine)) {
      if (!isIgnored(rawLines, i, 'missing-if-not-exists')) {
        reportLine(file, i, 'missing-if-not-exists', line.trim());
      }
    }
    // CREATE POLICY without preceding DROP POLICY IF EXISTS — look 5 lines back
    if (/\bcreate\s+policy\b/i.test(codeLine)) {
      let droppedRecently = false;
      for (let j = Math.max(0, i - 6); j < i; j++) {
        if (/\bdrop\s+policy\s+if\s+exists\b/i.test(codeLines[j] ?? '')) {
          droppedRecently = true;
          break;
        }
      }
      if (!droppedRecently && !isIgnored(rawLines, i, 'missing-if-not-exists')) {
        reportLine(file, i, 'missing-if-not-exists',
          `CREATE POLICY without preceding "DROP POLICY IF EXISTS" — re-runs will fail`);
      }
    }
  }

  // ── destructive-op ────────────────────────────────────────────────
  for (let i = 0; i < codeLines.length; i++) {
    const c = codeLines[i];
    const destructiveRes = [
      [/\bdrop\s+table\b/i, 'DROP TABLE'],
      [/\bdrop\s+column\b/i, 'DROP COLUMN'],
      [/\btruncate\b/i, 'TRUNCATE'],
      [/\balter\s+\w+\s+drop\s+constraint\b/i, 'DROP CONSTRAINT'],
      [/^\s*delete\s+from\s+\w+\s*;/i, 'DELETE without WHERE'],
    ];
    for (const [re, label] of destructiveRes) {
      if (re.test(c)) {
        if (previousNonBlankIsComment(rawLines, i, '@destructive: confirmed')) continue;
        if (isIgnored(rawLines, i, 'destructive-op')) continue;
        reportLine(file, i, 'destructive-op', `${label}: ${rawLines[i].trim()}`);
      }
    }
  }

  // ── check-constraint-rewrite ──────────────────────────────────────
  // A migration that BOTH drops a constraint AND adds a CHECK in the same file.
  // Per CLAUDE.md §16 rule 3, this needs `-- @check-constraint: probed` somewhere
  // in the file (a top-of-file comment is fine — author confirms they probed).
  const hasDropConstraint = /\bdrop\s+constraint\b/i.test(codeJoined);
  const hasAddCheck = /\badd\s+constraint\s+\w+\s+check\b/i.test(codeJoined);
  if (hasDropConstraint && hasAddCheck) {
    if (!src.includes('@check-constraint: probed')) {
      reportLine(file, 0, 'check-constraint-rewrite',
        'Migration drops + re-adds a CHECK constraint. Add "-- @check-constraint: probed" near the top after verifying production distinct values.');
    }
  }
}

for (const f of FILES_GLOB) {
  lintFile(f);
}

if (findings.length === 0) {
  console.log(`✓ lint-migrations: ${FILES_GLOB.length} files clean`);
  process.exit(0);
}

console.error(`\n✗ lint-migrations: ${findings.length} violation(s) across ${new Set(findings.map(f => f.file)).size} file(s):\n`);
const byRule = {};
for (const f of findings) {
  (byRule[f.rule] ??= []).push(f);
}
for (const rule of Object.keys(byRule)) {
  console.error(`  ▶ [${rule}] ${RULES[rule]}`);
  for (const f of byRule[rule]) {
    console.error(`      ${f.file}:${f.line}  ${f.snippet}`);
  }
  console.error('');
}
console.error('To silence a single legitimate occurrence, add `-- @lint-ignore: <rule>` on the previous line.');
console.error('To confirm a destructive op, prepend `-- @destructive: confirmed`.');
process.exit(1);
