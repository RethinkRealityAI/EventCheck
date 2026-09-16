// utils/adminEmailCompose.ts
//
// The admin "compose an email" model, shared by the one-recipient modal
// (Signups → Email) and the bulk sender (Signups → Email all, Dashboard →
// Email). One set of templates, one placeholder vocabulary, one renderer —
// so a subject line previewed for one person is byte-identical to what the
// same template sends to two hundred.
//
// Everything here is pure apart from reading `import.meta.env` for the
// tracking endpoint (via utils/emailTracking), which keeps it unit-testable.

import { renderEmailShell, mergePlaceholders, plainTextToHtml } from './emailShell';
import { buildOpenPixelUrl, wrapClickUrl } from './emailTracking';
import { CURRENT_SITE } from '../config/sites';
import { classifyPortalUser } from './portalUserStatus';
import { isValidEmail } from './csv';
import type { PortalUser } from '../services/storageService';
import type { Attendee, Form } from '../types';

// ── Templates ─────────────────────────────────────────────────────────────

export type AdminEmailTemplateKey = 'reminder' | 'invitation' | 'announcement' | 'blank';

export interface EmailFields {
  heading: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}

export const EMPTY_FIELDS: EmailFields = {
  heading: '',
  message: '',
  ctaLabel: '',
  ctaUrl: '',
  footerNote: '',
};

export const ADMIN_EMAIL_TEMPLATES: Record<AdminEmailTemplateKey, { subject: string; fields: EmailFields }> = {
  reminder: {
    subject: 'Complete your registration for {{event}}',
    fields: {
      heading: 'Pick up where you left off',
      message:
        "Hi {{name}},\n\n" +
        "You started registering for {{event}} but didn't quite finish. Your progress " +
        "(step {{step}} of {{total_steps}}) is saved and waiting for you.",
      ctaLabel: 'Resume registration',
      ctaUrl: '{{resume_url}}',
      footerNote:
        'If you registered from another device, signing in with the same email will also resume your draft.',
    },
  },
  invitation: {
    subject: "You're invited to {{event}}",
    fields: {
      heading: 'Join us at {{event}}',
      message:
        "Hi {{name}},\n\n" +
        "We'd love to have you at {{event}}. Click below to sign up and reserve your spot — " +
        "it only takes a minute.",
      ctaLabel: 'Sign up now',
      ctaUrl: '{{signup_url}}',
      footerNote:
        "Questions? Reply to this email and we'll get back to you shortly.",
    },
  },
  announcement: {
    subject: 'An update about {{event}}',
    fields: {
      heading: 'An update about {{event}}',
      message:
        "Hi {{name}},\n\n" +
        "We have news to share about {{event}}. Here is what you need to know:\n\n" +
        "(Write your update here.)",
      ctaLabel: '',
      ctaUrl: '',
      footerNote:
        "You're receiving this because you registered for {{event}}. Reply to this email with any questions.",
    },
  },
  blank: {
    subject: '',
    fields: { ...EMPTY_FIELDS },
  },
};

export interface AdminEmailTemplateOption {
  key: AdminEmailTemplateKey;
  label: string;
  description: string;
}

export const ADMIN_EMAIL_TEMPLATE_OPTIONS: ReadonlyArray<AdminEmailTemplateOption> = [
  { key: 'reminder', label: 'Registration Reminder', description: 'Nudge someone who started but did not finish' },
  { key: 'invitation', label: 'Invitation / Marketing', description: 'Invite someone who has not signed up yet' },
  { key: 'announcement', label: 'Announcement / Update', description: 'News for people who are already registered' },
  { key: 'blank', label: 'Blank / Custom', description: 'Start from scratch' },
];

/** Long labels for history / analytics rows, including legacy keys. */
export const ADMIN_EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  reminder: 'Registration Reminder',
  invitation: 'Invitation / Marketing',
  announcement: 'Announcement / Update',
  blank: 'Blank / Custom',
  custom: 'Custom',
  bulk: 'Campaign',
  'contact-invite': 'Contact invite',
};

/** Which audience a bulk send is drawn from. Drives the template list and
 *  which placeholders exist. */
export type AdminEmailAudience = 'signups' | 'attendees';

/** Reminder / invitation only make sense for portal accounts (they resume
 *  or start a registration); registered attendees get announcement + blank. */
export function templateOptionsFor(audience: AdminEmailAudience): AdminEmailTemplateOption[] {
  if (audience === 'attendees') {
    return ADMIN_EMAIL_TEMPLATE_OPTIONS.filter(o => o.key === 'announcement' || o.key === 'blank');
  }
  return [...ADMIN_EMAIL_TEMPLATE_OPTIONS];
}

/** Registered means paid OR free — a comped registrant must not be offered
 *  the "come and register" invitation. */
export function defaultTemplateForPortalUser(user: Pick<PortalUser, 'draft' | 'ticketCount' | 'hasPendingPayment'>): AdminEmailTemplateKey {
  if (user.draft) return 'reminder';
  return classifyPortalUser(user) === 'registered' ? 'blank' : 'invitation';
}

// ── Placeholders ──────────────────────────────────────────────────────────

export const PLACEHOLDER_LABELS: Record<string, string> = {
  name: 'Recipient name',
  first_name: 'Recipient first name',
  email: 'Recipient email',
  event: 'Event name',
  org_name: 'Organization (sponsor / exhibitor)',
  resume_url: 'Resume URL',
  signup_url: 'Signup URL',
  portal_url: 'Portal URL',
  step: 'Current step',
  total_steps: 'Total steps',
  link: 'Generic link',
};

/** Order the one-recipient modal lists overridable placeholders in. */
export const PLACEHOLDER_ORDER = ['name', 'email', 'event', 'resume_url', 'signup_url', 'step', 'total_steps', 'link'];

export function firstNameOf(name: string, email: string): string {
  const trimmed = (name || '').trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return (email || '').split('@')[0];
}

function siteOrigin(origin?: string): string {
  if (origin) return origin;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Placeholder values for a portal account. Mirrors the one-recipient modal
 * exactly — the reminder's "step 2 of 5" and resume link are computed from
 * the same draft + form settings.
 */
export function buildPortalUserVars(
  user: PortalUser,
  forms: Form[],
  eventFormId?: string,
  origin?: string,
): Record<string, string> {
  const base = siteOrigin(origin);
  const eventForm = forms.find(f => f.id === eventFormId) || forms[0];
  const steps = (eventForm?.settings as any)?.steps;
  const totalSteps = Array.isArray(steps) ? steps.length : 0;

  const resumeFormId = user.draft?.formId || eventForm?.id;
  const resumeUrl = resumeFormId ? `${base}/#/form/${resumeFormId}` : `${base}/#/portal`;

  const name = user.fullName || user.email.split('@')[0];
  return {
    name,
    first_name: firstNameOf(user.fullName, user.email),
    email: user.email,
    event: eventForm?.title || 'the event',
    org_name: '',
    resume_url: resumeUrl,
    signup_url: `${base}/#/`,
    portal_url: `${base}/#/portal`,
    step: user.draft ? String(user.draft.currentIndex + 1) : '1',
    total_steps: totalSteps > 0 ? String(totalSteps) : '5',
    link: resumeUrl,
  };
}

/**
 * Placeholder values for an attendee row. There is no draft to resume, so
 * `link` points at the portal (where their ticket lives) on portal sites and
 * the site root elsewhere.
 */
export function buildAttendeeVars(
  attendee: Pick<Attendee, 'name' | 'email' | 'formId' | 'formTitle'>,
  forms: Form[],
  opts: { orgName?: string | null; origin?: string } = {},
): Record<string, string> {
  const base = siteOrigin(opts.origin);
  const form = forms.find(f => f.id === attendee.formId);
  const portalUrl = CURRENT_SITE.portalEnabled ? `${base}/#/portal` : `${base}/#/`;
  const name = (attendee.name || '').trim() || attendee.email.split('@')[0];
  return {
    name,
    first_name: firstNameOf(attendee.name, attendee.email),
    email: attendee.email,
    event: form?.title || attendee.formTitle || 'the event',
    org_name: opts.orgName || '',
    resume_url: portalUrl,
    signup_url: `${base}/#/`,
    portal_url: portalUrl,
    step: '',
    total_steps: '',
    link: portalUrl,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────

export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function composeBodyContent(
  fields: EmailFields,
  vars: Record<string, string>,
  opts: { trackingId?: string; previewMode?: boolean } = {},
): string {
  const { trackingId = '', previewMode = false } = opts;
  const heading = escapeHtmlAttr(mergePlaceholders(fields.heading || '', vars));
  const bodyHtml = plainTextToHtml(mergePlaceholders(fields.message || '', vars));
  const ctaLabel = escapeHtmlAttr(mergePlaceholders(fields.ctaLabel || '', vars));
  const rawCtaUrl = mergePlaceholders(fields.ctaUrl || '', vars);
  const ctaUrl = !previewMode && trackingId ? wrapClickUrl(trackingId, rawCtaUrl) : rawCtaUrl;
  const footerNote = escapeHtmlAttr(mergePlaceholders(fields.footerNote || '', vars));

  const ctaBlock = ctaLabel && rawCtaUrl
    ? `<p style="text-align: center;"><a href="${escapeHtmlAttr(ctaUrl)}" class="button">${ctaLabel}</a></p>`
    : '';
  const footerNoteBlock = footerNote
    ? `<p style="font-size: 13px; opacity: 0.6;">${footerNote}</p>`
    : '';
  const headingBlock = heading ? `<h2>${heading}</h2>` : '';

  return `${headingBlock}
${bodyHtml}
${ctaBlock}
${footerNoteBlock}`;
}

/** Full branded document for one recipient. Preview mode skips tracking. */
export function renderAdminEmailHtml(
  fields: EmailFields,
  vars: Record<string, string>,
  opts: { previewMode?: boolean; trackingId?: string } = {},
): string {
  const { previewMode = false, trackingId = '' } = opts;
  const trackingPixelUrl = !previewMode && trackingId ? buildOpenPixelUrl(trackingId) : undefined;
  return renderEmailShell({
    content: composeBodyContent(fields, vars, { trackingId, previewMode }),
    site: CURRENT_SITE.key,
    previewMode,
    trackingPixelUrl,
  });
}

// ── Bulk recipients ───────────────────────────────────────────────────────

export interface BulkRecipient {
  /** Stable key for React + status tracking (user id or attendee id). */
  key: string;
  email: string;
  name: string;
  userId?: string | null;
  attendeeId?: string | null;
  /** Per-recipient placeholder values. */
  vars: Record<string, string>;
  /** Short context line shown in the recipient list ("In progress — step 2 of 5", "Delegate · Pfizer"). */
  subtitle?: string;
}

export interface DedupeResult {
  /** One entry per distinct address, first occurrence wins. */
  recipients: BulkRecipient[];
  /** Later rows whose address was already in the list (partners sharing an inbox, a purchaser listed twice). */
  duplicates: BulkRecipient[];
  /** Rows with no usable address — placeholder seats, imports without email. */
  invalid: BulkRecipient[];
}

/**
 * One email per inbox. Two attendee rows can share an address (a purchaser
 * and the guest they typed their own email for; partners); sending both
 * copies reads as spam and doubles the provider bill. Case-insensitive, and
 * whitespace-tolerant because addresses arrive from forms and CSVs.
 */
export function dedupeRecipients(list: readonly BulkRecipient[]): DedupeResult {
  const seen = new Set<string>();
  const recipients: BulkRecipient[] = [];
  const duplicates: BulkRecipient[] = [];
  const invalid: BulkRecipient[] = [];
  for (const r of list) {
    const email = (r.email || '').trim();
    if (!email || !isValidEmail(email)) { invalid.push(r); continue; }
    const key = email.toLowerCase();
    if (seen.has(key)) { duplicates.push(r); continue; }
    seen.add(key);
    recipients.push({ ...r, email });
  }
  return { recipients, duplicates, invalid };
}

// ── Repeat-send guard ─────────────────────────────────────────────────────

/** The one prior send we compare against — the most recent one for an inbox. */
export interface PriorSend {
  subject: string;
  sentAt: string;
}

/** A recipient paired with the subject line THEY would receive (placeholders
 *  already merged, so `Hi {{name}}` is compared as the text that went out). */
export interface SubjectedRecipient {
  key: string;
  email: string;
  subject: string;
}

function normalizeSubject(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Which of these recipients has ALREADY received an email with this exact
 * subject.
 *
 * `dedupeRecipients` stops one run mailing the same inbox twice; this stops
 * TWO runs doing it. A bulk send that is cancelled part-way — manually, or by
 * the quota abort — leaves the admin with a half-finished job, and the obvious
 * next move is to reopen the modal and send again. Nothing in a fresh modal
 * instance remembers the first run, so without this the people who were
 * already emailed get a second copy: wasted quota against a daily cap the
 * provider enforces silently (CLAUDE.md §18), and spam from the recipient's
 * side.
 *
 * Advisory, not a block: it reads the most recent send per inbox, so it can
 * miss someone whose latest send is a LATER, different email, and it only
 * covers the sends that were successfully logged. It never hides a recipient —
 * it marks them and lets the admin decide.
 */
export function findAlreadySentKeys(
  entries: readonly SubjectedRecipient[],
  priorSends: ReadonlyMap<string, PriorSend> | null | undefined,
): Set<string> {
  const hit = new Set<string>();
  if (!priorSends || priorSends.size === 0) return hit;
  for (const e of entries) {
    const prior = priorSends.get((e.email || '').trim().toLowerCase());
    if (!prior) continue;
    if (normalizeSubject(prior.subject || '') === normalizeSubject(e.subject || '')) hit.add(e.key);
  }
  return hit;
}
