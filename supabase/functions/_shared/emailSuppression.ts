// Registrations that must never be emailed.
//
// The district medical teams (DMHOs) invited through TSCS India hold PHYSICAL
// day tickets handed out at the registration desk. TSCS asked, in writing, that
// nothing be sent to the addresses on their list: most are shared district
// office inboxes (one address covers 50+ doctors), so a single bulk "resend
// tickets" or "send completion links" would land dozens of copies in a
// government office's inbox.
//
// "Don't press send" is not a control, so the rule lives at the one place every
// email leaves the system: send-ticket-email refuses any recipient this module
// says is suppressed, whichever mode, screen or bulk action asked for it. The
// dashboard uses the same rule to keep these rows out of bulk audiences, so an
// admin sees why rather than a wall of refusals.
//
// An ADDRESS is suppressed when at least one live registration with that
// address is in a suppressed category and NO live registration with that
// address is outside one. The second half matters: if a DMHO doctor also
// registers themselves (paid, with their own inbox), their own confirmation
// must still arrive. Test rows never count either way.
//
// Pure + data-only (no Deno/Supabase imports) so the dashboard and the vitest
// suite can import it.

/** Attendee categories whose registrations are never emailed. */
export const EMAIL_SUPPRESSED_CATEGORIES: ReadonlySet<string> = new Set(['dmho']);

/** What the refusal says — shown to admins in bulk-send results and toasts. */
export const EMAIL_SUPPRESSED_MESSAGE =
  'Not sent: DMHO delegates receive physical tickets at the registration desk and are never emailed.';

export interface SuppressionRow {
  email?: string | null;
  attendee_category?: string | null;
  is_test?: boolean | null;
}

export function isSuppressedCategory(category: string | null | undefined): boolean {
  return !!category && EMAIL_SUPPRESSED_CATEGORIES.has(category.trim());
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Split a nodemailer-style `to` (string, comma/semicolon list, or array) into
 * bare lower-cased addresses. "Name <a@b.c>" yields "a@b.c".
 */
export function recipientAddresses(to: unknown): string[] {
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') parts.push(...v.split(/[,;]/));
    else if (v && typeof v === 'object' && typeof (v as any).address === 'string') parts.push((v as any).address);
  };
  if (Array.isArray(to)) to.forEach(push); else push(to);
  const out: string[] = [];
  for (const p of parts) {
    const m = p.match(/<([^>]+)>/);
    const addr = norm(m ? m[1] : p);
    if (addr && !out.includes(addr)) out.push(addr);
  }
  return out;
}

/**
 * The subset of `addresses` that must not be emailed, given every attendee row
 * whose email matches one of them (case-insensitive). Rows for other addresses
 * are ignored, so callers may over-fetch.
 */
export function suppressedAddresses(addresses: string[], rows: SuppressionRow[]): string[] {
  const out: string[] = [];
  for (const addr of addresses.map(norm)) {
    if (!addr) continue;
    const live = rows.filter(r => norm(r.email) === addr && r.is_test !== true);
    if (live.length > 0 && live.every(r => isSuppressedCategory(r.attendee_category))) out.push(addr);
  }
  return out;
}
