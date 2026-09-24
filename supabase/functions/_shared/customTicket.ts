// Pure helpers for send-ticket-email mode 'custom-ticket': an admin-written
// email that carries the recipient's REAL ticket (server-built PDF, inline QR,
// download link) plus the tickets of anyone they are responsible for.
//
// One template is sent to many people whose situations differ — some already
// have a portal account, some are a companion rather than the booker, some
// have companions of their own. Rather than N templates, the copy branches on
// a few server-computed flags:
//
//   {{#if has_account}} …shown when true… {{else}} …when false… {{/if}}
//
// Blocks do not nest (a block may follow another, but not contain one), and an
// unknown flag is false. That is all the logic an email needs, and small
// enough to reason about in a template editor.
//
// No I/O — unit-tested in tests/customTicket.test.ts.

/** Flags a template may branch on. Computed server-side per recipient. */
export const CUSTOM_TICKET_FLAGS = ['has_account', 'is_companion', 'has_companions'] as const;
export type CustomTicketFlag = (typeof CUSTOM_TICKET_FLAGS)[number];

const IF_BLOCK = /\{\{\s*#if\s+([\w-]+)\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*\/if\s*\}\}/g;

/** Resolve every `{{#if flag}}…{{else}}…{{/if}}` block against `flags`. */
export function renderConditionals(template: string, flags: Record<string, boolean>): string {
  return String(template ?? '').replace(IF_BLOCK, (_m, key: string, yes: string, no?: string) =>
    flags[key] ? yes : (no ?? ''));
}

/** Tokens left behind by a malformed block — surfaced to the admin in preview. */
export function strayConditionalTokens(rendered: string): string[] {
  const found = rendered.match(/\{\{\s*(#if\b[^}]*|else|\/if)\s*\}\}/g);
  return found ? [...new Set(found)] : [];
}

/**
 * The event as a person reads it. Form titles are named for the form
 * ("GANSID Congress 2026 Registration"), which reads wrong in a sentence
 * ("you're registered for GANSID Congress 2026 Registration").
 */
export function eventDisplayName(formTitle: string | null | undefined): string {
  const t = String(formTitle ?? '').trim().replace(/\s+registration$/i, '').trim();
  return t || 'the event';
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface CompanionTicket {
  name: string;
  ticketType: string | null;
  /** Their ticket is registered under the recipient's own address. */
  sharesRecipientEmail: boolean;
  /** Their own address, when they have one. */
  email: string | null;
  /** Has a portal account of their own already. */
  hasOwnAccount: boolean;
  /** Signed /#/account link for THIS companion's ticket. */
  accountUrl: string;
  /** Their ticket PDF is attached to this email. */
  pdfAttached: boolean;
}

/**
 * The `{{companions}}` block: one line per person the recipient booked for.
 * Copy is fixed here (not in the template) because every clause is a fact
 * about that person's row, and a wrong one — "we've emailed them" to someone
 * with no address — is the class of bug ticketBlock.ts exists to prevent.
 */
export function buildCompanionListHtml(companions: CompanionTicket[], linkStyle: string): string {
  if (!companions.length) return '';
  const items = companions.map(c => {
    const parts: string[] = [];
    parts.push(`<strong>${escapeHtml(c.name)}</strong>${c.ticketType ? `: ${escapeHtml(c.ticketType)}` : ''}.`);
    if (c.pdfAttached) parts.push('Their ticket is attached to this email.');
    if (!c.sharesRecipientEmail && c.email) parts.push(`We have also sent it to them at ${escapeHtml(c.email)}.`);
    if (c.hasOwnAccount) {
      parts.push('They already have their own account.');
    } else if (c.accountUrl) {
      parts.push(c.sharesRecipientEmail
        ? `Their ticket is registered under your email, so it sits in your account alongside yours. If they would like an account of their own, send them <a href="${escapeHtml(c.accountUrl)}" style="${linkStyle}">this link</a>: they sign up with their own email address and their ticket is linked to their new account. It stays in yours as well.`
        : `They can create their own account with <a href="${escapeHtml(c.accountUrl)}" style="${linkStyle}">this link</a>.`);
    }
    return `<li style="margin:0 0 10px;">${parts.join(' ')}</li>`;
  });
  return `<ul style="margin:8px 0 16px;padding-left:20px;">${items.join('')}</ul>`;
}

/** Placeholders the custom-ticket mode fills, for the admin editor's help text. */
export const CUSTOM_TICKET_PLACEHOLDERS = [
  'name', 'first_name', 'email', 'event', 'ticket_type', 'registration_id', 'booking_ref',
  'purchaser', 'account_url', 'portal_url', 'ticket_download_url', 'qr_image_url', 'companions',
] as const;
