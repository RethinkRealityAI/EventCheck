// supabase/functions/_shared/emailLinks.ts
//
// One way to turn "wherever the request came from" into a link that survives
// an inbox. Shared by the edge functions and the Vite client (via
// utils/emailShell's re-export chain) so every email builds URLs identically.
//
// The bug this exists to kill: link building used to be `${body.origin || ''}/#/…`
// in one mode, `PUBLIC_SITE_URL` only in another, and `body.origin ?? header ??
// PUBLIC_SITE_URL` (where an empty-string body.origin beat the env fallback) in
// a third. When the Origin header is missing — privacy extensions and in-app
// webviews strip it — those produce a *relative* URL like `/#/tickets?token=…`,
// which renders as a button that does nothing when clicked from an email
// client. The recipient reports "the email came with no link" and nothing
// anywhere logs a problem.
//
// Rules here:
//   1. Only absolute http(s) origins count. A relative or malformed value is
//      treated as absent, never passed through.
//   2. Candidates are tried in order, so a caller-supplied origin wins and
//      PUBLIC_SITE_URL is always a real backstop.
//   3. When nothing resolves, callers get '' and must decide: omit an optional
//      link, or fail the send loudly for one whose whole purpose is the link.

/** True only for a well-formed absolute http/https URL. */
export function isAbsoluteHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return !!parsed.host;
  } catch {
    return false;
  }
}

/**
 * Reduce a candidate to a bare absolute origin with no trailing slash, or ''
 * when it isn't one. Accepts a full URL and keeps only scheme + host (+ port),
 * so passing a deep link by mistake still yields a usable origin.
 */
export function normalizeOrigin(value: unknown): string {
  if (!isAbsoluteHttpUrl(value)) return '';
  try {
    const parsed = new URL(String(value).trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

/**
 * First candidate that normalizes to a real origin, else ''. Pass them in
 * priority order, e.g. `resolveOrigin(body.origin, req.headers.get('origin'),
 * Deno.env.get('PUBLIC_SITE_URL'))`.
 */
export function resolveOrigin(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) return normalized;
  }
  return '';
}

/**
 * Join an origin and an app path into an absolute URL, or '' when the origin
 * is unusable. Returning '' (rather than a relative path) is deliberate: an
 * empty href is detectable and gets stripped by the email shell, whereas a
 * relative one silently ships a dead button.
 */
export function buildAppUrl(origin: string, path: string): string {
  const base = normalizeOrigin(origin);
  if (!base) return '';
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
