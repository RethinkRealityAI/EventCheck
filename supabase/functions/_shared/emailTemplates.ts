// Naming-agnostic email template resolution shared by the Deno edge function and
// the Vite client. Callers extract their own global strings (the edge reads
// snake_case app_settings columns; the client reads camelCase AppSettings), so
// this module never depends on either field-naming world. It owns ONLY the
// precedence rule: per-form override → global → hardcoded default.

export type EmailTemplateKey =
  | 'ticket' | 'table-purchaser' | 'guest' | 'guest-claim' | 'guest-confirmed'
  | 'guest-completion-notify' | 'staff-invite' | 'staff-confirmed'
  | 'exhibitor-staff-completion-notify'
  | 'bogo-ticket' | 'bogo-claim-link' | 'bogo-ticket-updated' | 'bogo-ticket-withdrawn'
  | 'group-invite' | 'contact-invite';

/** Templates exposed for per-form override in the FormBuilder UI (spec decision). */
export const CORE_OVERRIDE_TEMPLATE_KEYS = [
  'ticket', 'table-purchaser', 'guest', 'guest-claim', 'guest-confirmed',
] as const satisfies readonly EmailTemplateKey[];

export interface FormTemplateOverride {
  subject?: string;
  body?: string;
}

export interface ResolveEmailTemplateInput {
  /** Per-form override for THIS template (already gated on emailOverrides.enabled). */
  formOverride?: FormTemplateOverride;
  globalSubject?: string | null;
  globalBody?: string | null;
  defaultSubject: string;
  defaultBody: string;
  formHeaderImageUrl?: string | null;
  globalHeaderImageUrl?: string | null;
  globalFooterText?: string | null;
}

export interface ResolvedEmailTemplate {
  subject: string;
  body: string;
  headerImageUrl: string | undefined;
  footerText: string | undefined;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

/**
 * Only http(s) image URLs are usable in real emails. Gmail and Outlook strip
 * `data:` URIs from <img src> (SCAGO's live email_header_logo is a base64
 * data: SVG — it renders in the admin preview iframe but would arrive broken
 * in an inbox), so data:/blob:/anything-else falls through to the next source.
 */
function usableImageUrl(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : undefined;
}

export function resolveEmailTemplate(input: ResolveEmailTemplateInput): ResolvedEmailTemplate {
  const subject = firstNonEmpty(input.formOverride?.subject, input.globalSubject, input.defaultSubject) ?? input.defaultSubject;
  const body = firstNonEmpty(input.formOverride?.body, input.globalBody, input.defaultBody) ?? input.defaultBody;
  const headerImageUrl = usableImageUrl(input.formHeaderImageUrl) ?? usableImageUrl(input.globalHeaderImageUrl);
  const footerText = firstNonEmpty(input.globalFooterText);
  return { subject, body, headerImageUrl, footerText };
}
