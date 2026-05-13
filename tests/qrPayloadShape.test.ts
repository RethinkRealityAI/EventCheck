import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Regression guard for the bug that landed in production on 2026-04-21
// and shipped silently for three weeks:
//
//   qr_payload: JSON.stringify({ t: transactionId, i: 0 })
//
// The door scanner does `JSON.parse(data).id`, so any payload without an
// `id` field decodes successfully but resolves to "Invalid Ticket". Nothing
// in the codebase ever reads `parsed.t` / `parsed.i` — the shape was
// unscannable by design.
//
// This test walks the source tree, finds every place we write a QR payload
// via `JSON.stringify({...})`, and asserts each object literal mentions
// `id`. If it doesn't, the test fails with the file + a snippet so the
// next person spots the wrong shape before it ships.

const REPO_ROOT = join(__dirname, '..');
const SCAN_DIRS = ['components', 'supabase/functions', 'services'];
// File patterns we care about. Tests are excluded so this file doesn't
// trigger itself, and `.old.tsx` legacy snapshots are excluded since they
// aren't shipped.
const FILE_RE = /\.(ts|tsx)$/;
const EXCLUDE_RE = /\.(test|spec|old)\.(ts|tsx)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (FILE_RE.test(entry) && !EXCLUDE_RE.test(entry)) {
      yield full;
    }
  }
}

// Matches either `qr_payload: JSON.stringify({...})` (object-property
// form used by edge fns + db inserts) or `qrPayload = JSON.stringify({...})`
// (variable-assignment form used by `AddAttendeeModal.tsx`). The `[^}]*`
// is fine because every real call uses a flat object literal — no nested
// braces.
const WRITE_RE = /(?:qr_payload|qrPayload)\s*[:=]\s*JSON\.stringify\(\s*\{([^}]*)\}\s*\)/g;

describe('QR payload shape', () => {
  const findings: Array<{ file: string; match: string; objectBody: string }> = [];

  for (const dir of SCAN_DIRS) {
    const abs = join(REPO_ROOT, dir);
    for (const file of walk(abs)) {
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(WRITE_RE)) {
        findings.push({
          file: relative(REPO_ROOT, file).replace(/\\/g, '/'),
          match: m[0],
          objectBody: m[1],
        });
      }
    }
  }

  it('finds at least one qr_payload writer (sanity)', () => {
    // If this fails, the regex stopped matching legit code. Investigate
    // before "fixing" the test — the guard below depends on this.
    expect(findings.length).toBeGreaterThan(0);
  });

  it('every qr_payload writer includes an `id` field', () => {
    const broken = findings.filter(f => !/\bid\b/.test(f.objectBody));
    if (broken.length > 0) {
      // Surface every offender at once so a developer sees the full
      // blast radius, not just the first one.
      const message = broken
        .map(b => `  ${b.file}\n    -> ${b.match.trim()}`)
        .join('\n\n');
      throw new Error(
        `QR payloads without an \`id\` field will scan as "Invalid Ticket":\n\n${message}\n`,
      );
    }
  });
});
