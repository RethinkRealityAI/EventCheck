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

// ── Trusted origins ──────────────────────────────────────────────────────────
// Rule 2 above ("a caller-supplied origin wins") is only safe for links that
// carry nothing. send-ticket-email is gateway-open, and most of its links
// carry a signed token (ticket download, pay, complete, account): build one on
// `body.origin: 'https://evil.example'` and the token is delivered to the
// attendee's inbox pointing at a host that reads it off the URL the moment
// they click. So a caller's origin is used only when it is one of the app's
// own sites; anything else falls back to PUBLIC_SITE_URL.

/** The production sites. PUBLIC_SITE_URL and ALLOWED_LINK_ORIGINS add to these. */
export const APP_SITE_ORIGINS: readonly string[] = [
  'https://gansid.netlify.app',
  'https://qreventcheck.netlify.app',
];

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Comma/whitespace-separated list (an env var) → normalized origins. */
export function parseOriginList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(/[\s,]+/).map(normalizeOrigin).filter(Boolean);
}

/**
 * True when `candidate` is one of the app's own origins: a production site,
 * one of `extra` (PUBLIC_SITE_URL, ALLOWED_LINK_ORIGINS), or a loopback dev
 * server. A loopback link can only ever reach the recipient's own machine.
 */
export function isTrustedOrigin(candidate: unknown, extra: readonly unknown[] = []): boolean {
  const origin = normalizeOrigin(candidate);
  if (!origin) return false;
  if (APP_SITE_ORIGINS.includes(origin)) return true;
  if (extra.some((e) => normalizeOrigin(e) === origin)) return true;
  return LOCAL_DEV_HOSTS.has(new URL(origin).hostname);
}

export interface TrustedOriginConfig {
  /** The project's PUBLIC_SITE_URL secret — trusted by definition, and the fallback. */
  publicSiteUrl?: unknown;
  /** The project's ALLOWED_LINK_ORIGINS secret (optional extra sites). */
  allowedOrigins?: unknown;
}

/**
 * The first caller candidate that is a trusted origin, else PUBLIC_SITE_URL,
 * else ''. Never returns an origin the caller made up.
 */
export function resolveTrustedOrigin(callerCandidates: readonly unknown[], cfg: TrustedOriginConfig): string {
  const extra = [cfg.publicSiteUrl, ...parseOriginList(cfg.allowedOrigins)];
  for (const candidate of callerCandidates) {
    if (isTrustedOrigin(candidate, extra)) return normalizeOrigin(candidate);
  }
  return normalizeOrigin(cfg.publicSiteUrl);
}

/**
 * A caller-supplied app link, kept only on a trusted origin. A link on any
 * other host is re-based onto the trusted origin (same path, query and hash —
 * the app routes on the hash), or '' when there is none. A click-tracking
 * wrapper (`trackingEndpoint`, our own track-email function) is accepted when
 * the link it redirects to passes the same test.
 */
export function trustedLinkUrl(url: unknown, cfg: TrustedOriginConfig & { trackingEndpoint?: string }): string {
  if (!isAbsoluteHttpUrl(url)) return '';
  const raw = String(url).trim();
  const endpoint = cfg.trackingEndpoint ?? '';
  if (endpoint && raw.startsWith(`${endpoint}?`)) {
    const params = new URL(raw).searchParams;
    const inner = trustedLinkUrl(params.get('to'), { ...cfg, trackingEndpoint: undefined });
    if (!inner) return '';
    params.set('to', inner);
    return `${endpoint}?${params.toString()}`;
  }
  const parsed = new URL(raw);
  const origin = resolveTrustedOrigin([parsed.origin], cfg);
  if (!origin) return '';
  return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
