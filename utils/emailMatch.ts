// Case-insensitive email matching for PostgREST queries.
//
// Email addresses are case-insensitive in every practical sense, but a plain
// `.eq('email', …)` is a byte comparison: a row stored as `Sikha.Singh@aphl.org`
// does NOT match a query for `sikha.singh@aphl.org`. That silently hid a
// claimed ticket from its owner's portal, because Supabase normalises auth
// emails to lowercase while the attendee row keeps whatever the person typed
// into the form.
//
// `.ilike()` fixes the casing — but ILIKE also treats `%`, `_` and `\` as
// pattern syntax, and `_` is common in real addresses (`first_last@x.com`).
// Unescaped, `first_last@x.com` would also match `firstXlast@x.com`. Every
// ilike-on-email call must therefore escape its argument first.

/**
 * Escape LIKE/ILIKE wildcards so the value matches literally.
 *
 * Backslash first — escaping it after the others would double-escape their
 * markers. `*` is included because PostgREST accepts it as an alias for `%`
 * in like/ilike filters and rewrites it before the SQL is built; it is not
 * legal in an email address, so escaping it is free insurance.
 */
export function escapeLikePattern(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*');
}

/**
 * Build the ILIKE pattern for an exact, case-insensitive email match.
 * Trims surrounding whitespace — form inputs routinely carry a trailing space.
 */
export function emailIlikePattern(email: string): string {
  return escapeLikePattern(String(email ?? '').trim());
}

/** Case-insensitive equality for two email addresses. */
export function emailsMatch(a: unknown, b: unknown): boolean {
  const na = String(a ?? '').trim().toLowerCase();
  const nb = String(b ?? '').trim().toLowerCase();
  return na.length > 0 && na === nb;
}
