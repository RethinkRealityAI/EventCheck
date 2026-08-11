import { describe, it, expect } from 'vitest';
import {
  normalizeAttendeeRows,
  escapeLikePattern,
  ATTENDEE_DEFAULTED_NOT_NULL_COLUMNS,
} from '../supabase/functions/_shared/attendeeRows';

const NOW = '2026-08-11T00:00:00.000Z';

describe('normalizeAttendeeRows — the group-registration NOT NULL failure', () => {
  it('fills every defaulted NOT NULL column on a row that has none', () => {
    const [row] = normalizeAttendeeRows([{ id: 'a', email: 'x@y.co' }], NOW);
    for (const col of ATTENDEE_DEFAULTED_NOT_NULL_COLUMNS) {
      expect(row[col], `${col} must not be missing`).not.toBeUndefined();
      expect(row[col], `${col} must not be null`).not.toBeNull();
    }
  });

  it('reproduces the real failure shape: row 0 has the flags, rows 1-4 do not', () => {
    // This is exactly what broke — a batch where only the purchaser carried
    // is_test, so PostgREST NULL-filled it for the four guests.
    const rows = normalizeAttendeeRows([
      { id: 'p', email: 'buyer@x.co', is_test: false, is_primary: true, donation_amount: 0, registered_at: NOW },
      { id: 'g1', email: 'g1@x.co' },
      { id: 'g2', email: 'g2@x.co' },
      { id: 'g3', email: 'g3@x.co' },
      { id: 'g4', email: 'g4@x.co' },
    ], NOW);
    expect(rows).toHaveLength(5);
    // Every row must carry an identical key set, or PostgREST NULL-fills again.
    const keySets = rows.map(r => Object.keys(r).sort().join(','));
    expect(new Set(keySets).size).toBe(1);
    for (const r of rows) expect(r.is_test).toBe(false);
  });

  it('never overrides an explicit value — a real test row stays is_test:true', () => {
    const [row] = normalizeAttendeeRows([{ id: 'a', is_test: true, donation_amount: 250 }], NOW);
    expect(row.is_test).toBe(true);
    expect(row.donation_amount).toBe(250);
  });

  it('honours an explicit is_primary:false (guests) but defaults to true', () => {
    const [guest] = normalizeAttendeeRows([{ id: 'g', is_primary: false }], NOW);
    expect(guest.is_primary).toBe(false);
    const [solo] = normalizeAttendeeRows([{ id: 's' } as Record<string, any>], NOW);
    expect(solo.is_primary).toBe(true);
  });

  it('coerces null to the default rather than passing it through', () => {
    // null is the actual killer — NOT NULL rejects it even though a DEFAULT exists.
    const [row] = normalizeAttendeeRows([
      { id: 'a', is_test: null, donation_amount: null, registered_at: null } as any,
    ], NOW);
    expect(row.is_test).toBe(false);
    expect(row.donation_amount).toBe(0);
    expect(row.registered_at).toBe(NOW);
  });

  it('does not treat a truthy non-boolean as a set flag', () => {
    const [row] = normalizeAttendeeRows([{ id: 'a', is_test: 'false' as any }], NOW);
    expect(row.is_test).toBe('false'); // explicit value preserved, not coerced
    const [row2] = normalizeAttendeeRows([{ id: 'b', is_bogo_claim: undefined }], NOW);
    expect(row2.is_bogo_claim).toBe(false);
  });

  it('leaves unrelated fields untouched and handles an empty batch', () => {
    const [row] = normalizeAttendeeRows([{ id: 'a', name: 'Jane', answers: { x: 1 } }], NOW);
    expect(row.name).toBe('Jane');
    expect(row.answers).toEqual({ x: 1 });
    expect(normalizeAttendeeRows([], NOW)).toEqual([]);
  });
});

describe('escapeLikePattern — promo-usage counting', () => {
  it('escapes the wildcards that would over-count usage', () => {
    // `TSCS_2026` unescaped would also match `TSCSX2026`.
    expect(escapeLikePattern('TSCS_2026')).toBe('TSCS\\_2026');
    expect(escapeLikePattern('50%OFF')).toBe('50\\%OFF');
    expect(escapeLikePattern('A*B')).toBe('A\\*B');
  });

  it('escapes backslash first so other markers are not double-escaped', () => {
    expect(escapeLikePattern('a\\_b')).toBe('a\\\\\\_b');
  });

  it('leaves the real GANSID codes unchanged', () => {
    for (const code of ['TSCSB-GC-2026-5', 'GC26-SPEAKER!', 'HF-GCS@2026!', 'GC26-TSCS-HCP']) {
      expect(escapeLikePattern(code)).toBe(code);
    }
  });

  it('handles nullish input', () => {
    expect(escapeLikePattern(undefined as any)).toBe('');
    expect(escapeLikePattern(null as any)).toBe('');
  });
});
