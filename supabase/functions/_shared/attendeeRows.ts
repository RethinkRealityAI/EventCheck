// Row-shaping rules for writes to `attendees`, extracted so they can be
// unit-tested (CLAUDE.md §16 rule #14). Both helpers here fix bugs that were
// invisible in code review and only showed up against real data.

/**
 * Make every row in a multi-row attendee insert column-consistent.
 *
 * THE BUG THIS FIXES
 * PostgREST normalises columns across a batch: if ANY row omits a key, every
 * other row is sent NULL for it. `attendees` has seven NOT NULL columns that
 * carry a DEFAULT — safe to omit on a single-row insert, fatal on a batch where
 * only some rows have them. Every group registration failed with
 *   `null value in column "is_test" of relation "attendees" violates not-null constraint`
 * while identical solo registrations succeeded, because a group is the only
 * multi-row path a normal registrant hits.
 *
 * Pinning one column just moves the failure to the next, so all seven are
 * filled. Only MISSING values are filled — an explicit value always wins, so a
 * genuine test row stays `is_test: true`.
 */
export const ATTENDEE_DEFAULTED_NOT_NULL_COLUMNS = [
  'is_test',
  'is_primary',
  'is_bogo_claim',
  'is_donated_seat_claim',
  'is_paid_extra',
  'donation_amount',
  'registered_at',
] as const;

export function normalizeAttendeeRows<T extends Record<string, any>>(rows: T[], nowIso?: string): T[] {
  const now = nowIso ?? new Date().toISOString();
  const fills: Record<string, (r: any) => unknown> = {
    // `=== true` (not truthy) so a stray string like "false" can't flip a flag.
    is_test: (r) => r.is_test === true,
    // is_primary defaults TRUE in the schema; only an explicit false demotes.
    is_primary: (r) => r.is_primary !== false,
    is_bogo_claim: (r) => r.is_bogo_claim === true,
    is_donated_seat_claim: (r) => r.is_donated_seat_claim === true,
    is_paid_extra: (r) => r.is_paid_extra === true,
    donation_amount: (r) => (typeof r.donation_amount === 'number' ? r.donation_amount : 0),
    registered_at: (r) => r.registered_at ?? now,
  };
  return rows.map((row) => {
    const out: Record<string, any> = { ...row };
    for (const col of ATTENDEE_DEFAULTED_NOT_NULL_COLUMNS) {
      if (out[col] === undefined || out[col] === null) out[col] = fills[col](row);
    }
    return out as T;
  });
}

/**
 * Escape LIKE/ILIKE wildcards so a value matches literally.
 *
 * Promo-usage counting uses `.ilike('applied_promo_code', code)` to stay
 * case-insensitive — correct, but ILIKE treats `%` and `_` as pattern syntax
 * and PostgREST additionally accepts `*` as an alias for `%`. An admin-created
 * code like `TSCS_2026` would therefore also count `TSCSX2026`, over-counting
 * usage and wrongly blocking a valid registration at the limit.
 *
 * Backslash first — escaping it later would double-escape the other markers.
 */
export function escapeLikePattern(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*');
}
