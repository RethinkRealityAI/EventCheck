// Which of a registration's questions are still unanswered — and which of
// them may be answered through a "complete your registration" link.
//
// Why this exists: registrations reach the platform through doors that ask
// fewer questions than our own form. TSCS India's page never asks for dietary
// needs, accessibility, an emergency contact, or the three required consents;
// an admin comping a speaker fills in only what they know. Those people are
// registered and ticketed, but the organisers are missing exactly the answers
// that matter on the day, and nobody has agreed to the event terms.
//
// ONE module decides what is missing, for the admin panel, the public
// completion page AND the server that accepts the answers. That is not tidiness:
// this codebase has already stranded registrants twice behind a required field
// the page did not render (the 2026-07-29 BOGO claim link). If what we SHOW and
// what we VALIDATE come from different rules, it happens again. Everything here
// is pure so vitest, the Vite client and the Deno edge runtime share it.

/** The subset of a form field this module reads. Structurally compatible with
 *  types.ts FormField, so client code passes real fields straight in. */
export interface CompletenessField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  usedForPricing?: boolean;
  conditional?: { enabled: boolean; fieldId: string; value: string };
  linkText?: string;
  consentModal?: { title: string; url: string };
}

export type Answers = Record<string, unknown>;

/** Field types that never carry a registrant's answer. */
const NON_ANSWER_TYPES: ReadonlySet<string> = new Set(['ticket', 'registration-mode-selector']);

/** Metadata keys written into `answers` by this flow. */
export const COMPLETED_AT_KEY = '_completed_at';
export const ASKED_FIELDS_KEY = '_asked_fields';

/**
 * Conditional visibility — deliberately a line-for-line copy of the rule in
 * PublicRegistration's `isVisible` (and FormPreview's), so a question the
 * registration form would hide is never demanded here.
 */
export function isFieldVisible(field: CompletenessField, answers: Answers): boolean {
  if (!field.conditional?.enabled || !field.conditional.fieldId) return true;
  const target = answers[field.conditional.fieldId];
  if (target === undefined || target === null) return false;
  if (Array.isArray(target)) return target.includes(field.conditional.value);
  if (typeof target === 'boolean') return String(target) === field.conditional.value;
  return String(target) === field.conditional.value;
}

/**
 * Has this question been answered?
 *
 * A boolean is answered only when it is `true` if it is required — a consent
 * nobody ticked is a consent nobody gave, and `false` must never read as
 * "done". An optional boolean (a toggle) is always considered answered: left
 * off is a legitimate answer, and asking again would nag.
 */
export function isAnswered(field: CompletenessField, value: unknown): boolean {
  if (field.type === 'boolean') return field.required ? value === true : true;
  if (Array.isArray(value)) return value.length > 0;
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * May a completion link collect this question?
 *
 * Three kinds of field are never offered, whatever their state:
 *  - ticket / registration mode — the purchase is already made;
 *  - email — it IS the registration's identity and the portal login. A link
 *    holder who could change it could redirect someone's ticket to their own
 *    inbox;
 *  - anything `usedForPricing` — country and category decided what was paid,
 *    and a changed answer would silently misstate it.
 * They still appear read-only in "what we already have".
 */
export function isAskableOnCompletion(field: CompletenessField): boolean {
  if (NON_ANSWER_TYPES.has(field.type)) return false;
  if (field.type === 'email') return false;
  if (field.usedForPricing) return false;
  return true;
}

export interface CompletenessReport {
  /** Visible, askable, unanswered — everything the page will present. */
  outstanding: CompletenessField[];
  /** The subset of `outstanding` that must be answered before it counts as complete. */
  outstandingRequired: CompletenessField[];
  /** Required consents not yet given — surfaced separately because they carry legal weight. */
  consentsMissing: CompletenessField[];
  /** Optional questions the registrant was shown and chose to leave blank. */
  declined: CompletenessField[];
  /** Visible fields that already hold an answer. */
  answered: CompletenessField[];
  /** No required question outstanding. */
  complete: boolean;
}

/**
 * The whole picture for one registration.
 *
 * `declined` exists so the admin panel can tell "TSCS never asked this" from
 * "we asked and they left it blank" — only the first is worth chasing.
 */
export function assessCompleteness(fields: readonly CompletenessField[], answers: Answers): CompletenessReport {
  const asked = new Set(Array.isArray(answers[ASKED_FIELDS_KEY]) ? (answers[ASKED_FIELDS_KEY] as string[]) : []);
  const outstanding: CompletenessField[] = [];
  const declined: CompletenessField[] = [];
  const answered: CompletenessField[] = [];

  for (const field of fields) {
    if (NON_ANSWER_TYPES.has(field.type)) continue;
    if (!isFieldVisible(field, answers)) continue;
    if (isAnswered(field, answers[field.id])) { answered.push(field); continue; }
    if (!isAskableOnCompletion(field)) continue;
    // Asked before and left blank: a choice, not a gap — unless required, in
    // which case it cannot have been left blank legitimately.
    if (!field.required && asked.has(field.id)) { declined.push(field); continue; }
    outstanding.push(field);
  }

  const outstandingRequired = outstanding.filter(f => f.required);
  return {
    outstanding,
    outstandingRequired,
    consentsMissing: outstandingRequired.filter(f => f.type === 'boolean'),
    declined,
    answered,
    complete: outstandingRequired.length === 0,
  };
}

const MAX_TEXT = 2000;

/**
 * Turn a submitted value into something safe to store — or reject it.
 *
 * The server calls this on every key it accepts, so the public endpoint never
 * stores a type the form would not have produced: options must be options, a
 * consent must be a boolean, text is trimmed and bounded.
 */
export function sanitizeValue(field: CompletenessField, raw: unknown): { ok: true; value: unknown } | { ok: false } {
  switch (field.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false };
    case 'checkbox': {
      if (!Array.isArray(raw)) return { ok: false };
      const values = raw.filter((v): v is string => typeof v === 'string');
      if (field.options?.length && values.some(v => !field.options!.includes(v))) return { ok: false };
      return { ok: true, value: [...new Set(values)] };
    }
    case 'radio':
    case 'select': {
      if (typeof raw !== 'string') return { ok: false };
      const v = raw.trim();
      if (!v) return { ok: true, value: '' };
      if (field.options?.length && !field.options.includes(v)) return { ok: false };
      return { ok: true, value: v };
    }
    case 'country': {
      if (typeof raw !== 'string') return { ok: false };
      const v = raw.trim().toUpperCase();
      if (v && !/^[A-Z]{2}$/.test(v)) return { ok: false };
      return { ok: true, value: v };
    }
    default: {
      if (typeof raw !== 'string') return { ok: false };
      return { ok: true, value: raw.trim().slice(0, MAX_TEXT) };
    }
  }
}

export type CompletionResult =
  | { ok: true; answers: Answers; report: CompletenessReport }
  | { ok: false; error: string; fieldId?: string };

/**
 * Apply a submission to stored answers.
 *
 * Accepts ONLY fields that are askable and currently unanswered — a completion
 * link fills gaps; it cannot rewrite what someone already told us, and it
 * cannot inject keys the form does not define. Visibility is re-evaluated on
 * the MERGED answers, so a conditional question revealed by this submission
 * must be answered in the same submission, exactly as on the registration
 * form. Every question presented is recorded as asked, which is what lets a
 * deliberately-blank optional answer stop reading as a gap.
 */
export function applyCompletion(
  fields: readonly CompletenessField[],
  stored: Answers,
  submitted: Record<string, unknown>,
  nowIso: string,
): CompletionResult {
  const byId = new Map(fields.map(f => [f.id, f] as const));
  const merged: Answers = { ...stored };

  for (const [key, raw] of Object.entries(submitted ?? {})) {
    const field = byId.get(key);
    if (!field || !isAskableOnCompletion(field)) continue;
    if (isAnswered(field, stored[key])) continue;
    const clean = sanitizeValue(field, raw);
    if (!clean.ok) return { ok: false, error: `"${field.label}" has an invalid value.`, fieldId: field.id };
    merged[key] = clean.value;
  }

  // Everything that was outstanding before this submission, plus anything the
  // submission itself revealed, has now been put in front of the registrant.
  const before = assessCompleteness(fields, stored);
  const after = assessCompleteness(fields, merged);
  const blocking = after.outstandingRequired[0];
  if (blocking) {
    return {
      ok: false,
      error: blocking.type === 'boolean'
        ? `Please confirm: ${blocking.label}${blocking.linkText ? ` ${blocking.linkText}` : ''}`
        : `"${blocking.label}" is required.`,
      fieldId: blocking.id,
    };
  }

  // "Asked" means put in front of the registrant by THIS flow: what was
  // outstanding when the page loaded, plus optional questions this submission
  // revealed and left blank. Fields answered at original registration were
  // never asked here and must not be recorded as if they were.
  const priorAsked = Array.isArray(stored[ASKED_FIELDS_KEY]) ? (stored[ASKED_FIELDS_KEY] as string[]) : [];
  const nowAsked = [...before.outstanding, ...after.outstanding].map(f => f.id);
  merged[ASKED_FIELDS_KEY] = [...new Set([...priorAsked, ...nowAsked])];
  merged[COMPLETED_AT_KEY] = nowIso;

  return { ok: true, answers: merged, report: assessCompleteness(fields, merged) };
}

/**
 * A readable value for the "what we already have" summary. Never used for a
 * consent's legal record — only to show the registrant what is on file.
 */
export function displayValue(field: CompletenessField, value: unknown): string {
  if (field.type === 'boolean') return value === true ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}
