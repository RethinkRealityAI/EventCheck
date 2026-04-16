import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression guard for storageService mapper bugs.
 *
 * Bug history:
 *   Bug 1 — mapFormFromDb hardcoded form_type to 'sponsor' | 'event' via ternary,
 *            silently dropping 'exhibitor' (and any future values).
 *            Fix: changed to `(db as any).form_type || 'event'` (pass-through).
 *
 * These tests use a grep-style approach on the source file since mapFormFromDb
 * is not exported. If anyone re-hardcodes the ternary, the test fails.
 */
describe('storageService mapper source guards', () => {
  const SOURCE_PATH = resolve(__dirname, '../services/storageService.ts');
  let source: string;

  try {
    source = readFileSync(SOURCE_PATH, 'utf-8');
  } catch {
    source = '';
  }

  it('mapFormFromDb source should exist', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain('function mapFormFromDb');
  });

  it('mapFormFromDb must NOT contain a hardcoded form_type ternary that gates known values', () => {
    // The banned pattern is something like: form_type === 'sponsor' ? 'sponsor' : 'event'
    // which silently drops any new form_type ('exhibitor', etc.)
    const bannedPattern = /form_type\s*===\s*['"]sponsor['"]\s*\?\s*['"]sponsor['"]\s*:\s*['"]event['"]/;
    expect(
      bannedPattern.test(source),
      'mapFormFromDb has a hardcoded ternary that will silently drop unknown form_type values. ' +
      'Use `(db as any).form_type || "event"` (pass-through) instead.',
    ).toBe(false);
  });

  it('mapFormFromDb uses a pass-through pattern for form_type', () => {
    // Confirm the safe pass-through is present
    expect(source).toMatch(/form_type\s*\|\|\s*['"]event['"]/);
  });

  it('mapFormToDb passes form_type through without hardcoding', () => {
    // mapFormToDb should also use f.formType not a ternary
    expect(source).toMatch(/form_type:\s*f\.formType/);
  });
});

/**
 * Regression guard for seed SQL property name bugs.
 *
 * Bug history:
 *   Bug 2 — seed-gansid-form.sql used "tickets":[] instead of "items":[]
 *            inside ticketConfig JSON, causing a runtime mismatch with the
 *            TicketConfig TypeScript interface (which requires `items`).
 *            Fix: corrected the seed SQL + added fix-ticket-field.sql patch.
 */
describe('seed SQL ticketConfig property guards', () => {
  const SEED_FILES = [
    resolve(__dirname, '../tmp/seed-gansid-form.sql'),
  ];

  for (const filePath of SEED_FILES) {
    const fileName = filePath.split(/[\\/]/).pop()!;
    let sql: string;
    try {
      sql = readFileSync(filePath, 'utf-8');
    } catch {
      // File may not exist in all environments — skip gracefully
      it.skip(`${fileName} not found — skipping seed guard`, () => {});
      continue;
    }

    it(`${fileName} must not use "tickets":[] in ticketConfig JSON (should be "items":[])`, () => {
      // Detect the wrong property name inside a ticketConfig block
      const badPattern = /"ticketConfig"\s*:\s*\{[^}]*"tickets"\s*:/;
      expect(
        badPattern.test(sql),
        `${fileName} contains "tickets" inside ticketConfig — should be "items". ` +
        'This would reintroduce Bug 2 on the next seed re-run.',
      ).toBe(false);
    });

    it(`${fileName} ticketConfig JSON must use "items":[] when a ticket field is present`, () => {
      if (!sql.includes('"ticketConfig"')) return; // no ticket field → nothing to check
      expect(sql).toMatch(/"ticketConfig"\s*:\s*\{[^}]*"items"\s*:/);
    });
  }
});
