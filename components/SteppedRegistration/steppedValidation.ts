import type { FormField, FormStep } from '../../types';

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

const NON_ANSWER_FIELD_TYPES: ReadonlySet<string> = new Set([
  'ticket',
  'registration-mode-selector',
]);

// Fields hidden for a STAFF claim — someone an exhibitor/sponsor already
// registered on their organisation's allocation.
//
// The org told us who they are and which access tier they hold, and the org is
// invoiced externally, so re-asking these is noise at best and misleading at
// worst. Two groups:
//   - f_org / f_role: affiliation is the organisation that registered them; we
//     stamp it from the org record instead of making them retype it. f_org is
//     REQUIRED on the GANSID form, which is exactly why hiding it must also
//     exempt it from validation (see fieldRenderableForClaim's use as an
//     isVisible filter) — hiding a required field WITHOUT that exemption is how
//     the 2026-07-29 BOGO claim link stranded guests behind an invisible
//     blocker.
//   - f_present / f_emerg_*: booth staff are not presenting, and emergency
//     contacts are collected by the org.
//
// Single source of truth: FormRenderer renders through this, SteppedFormShell
// filters steps through it, and PublicRegistration folds it into `isVisible` so
// validation agrees. All three MUST use it or a step renders zero fields / a
// hidden required field blocks submit.
export const STAFF_CLAIM_HIDDEN_FIELD_IDS: ReadonlySet<string> = new Set([
  'f_org',
  'f_role',
  'f_present',
  'f_emerg_name',
  'f_emerg_phone',
  'f_emerg_rel',
]);

/** @deprecated Use STAFF_CLAIM_HIDDEN_FIELD_IDS. Kept so any stale import fails
 *  loudly at the type level rather than silently reintroducing the old set. */
export const EXHIBITOR_STAFF_HIDDEN_FIELD_IDS = STAFF_CLAIM_HIDDEN_FIELD_IDS;

export interface ClaimFieldOptions {
  /**
   * True for BOTH staff claim types: `staff-pending` (combined sponsor+exhibitor
   * form) and `exhibitor-staff-pending` (legacy exhibitor form).
   *
   * This used to be `isExhibitorStaffPending`, which only ever matched the
   * LEGACY type — so staff invited through the combined form were asked for
   * their affiliation, role, presentation plans and emergency contacts despite
   * the set existing to hide exactly those (reported 2026-08-19).
   */
  isStaffClaim?: boolean;
}

/** Claim guests never see the ticket field or the registration-mode selector
 *  (their registration is already paid); staff additionally skip the set above. */
export function fieldRenderableForClaim(
  field: FormField,
  opts: ClaimFieldOptions = {},
): boolean {
  if (field.type === 'ticket' || field.type === 'registration-mode-selector') return false;
  if (opts.isStaffClaim && STAFF_CLAIM_HIDDEN_FIELD_IDS.has(field.id)) return false;
  return true;
}

/** Drops steps that would render ZERO fields for a pending-claim guest —
 *  e.g. a "Registration Type" step holding only the mode selector. Without
 *  this, claim links on stepped forms land on an empty step and the hidden
 *  required selector strands the guest behind validation (GANSID BOGO
 *  claim-link incident, 2026-07-29). */
export function filterStepsForClaim(
  steps: FormStep[],
  fieldsByStep: Record<string, FormField[]>,
  opts: ClaimFieldOptions = {},
): FormStep[] {
  return steps.filter(step =>
    (fieldsByStep[step.id] ?? []).some(f => fieldRenderableForClaim(f, opts)),
  );
}

/**
 * Step label with the payment wording dropped when the step's payment field is
 * hidden.
 *
 * GANSID's `consent` step is labelled "Consent & Payment" and genuinely holds
 * the ticket field — for a PURCHASER. A claim guest has already been paid for,
 * so the ticket field is hidden and only consents render, leaving a heading
 * that promises a payment step that never comes. Staff reported this as "it's
 * asking me for payment" even though no payment control was rendered.
 *
 * Only rewrites when the step actually had a payment field that is now hidden;
 * an unrelated step whose label happens to end in "Payment" is left alone.
 */
export function stepTitleForClaim(
  label: string,
  stepFields: FormField[],
  opts: ClaimFieldOptions & { isClaim?: boolean } = {},
): string {
  const original = label ?? '';
  if (!opts.isClaim) return original;
  const hidesPayment = stepFields.some(
    f => f.type === 'ticket' && !fieldRenderableForClaim(f, opts),
  );
  if (!hidesPayment) return original;
  const stripped = original
    .replace(/\s*(&|\+|and)\s*payments?\s*$/i, '')
    .replace(/^\s*payments?\s*(&|\+|and)\s*/i, '')
    .trim();
  return stripped || original;
}

// Fields the per-guest "full details" accordion excludes because they're already
// captured at the top of each row or aren't a per-guest concern. Must stay in
// sync with GuestFullDetailsInline's filter so inline-mode required validation
// and inline-mode rendering agree on the same field set.
const GUEST_INLINE_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  'ticket',
  'registration-mode-selector',
  'country',
]);
const GUEST_INLINE_EXCLUDED_IDS: ReadonlySet<string> = new Set([
  'f_fname', 'f_lname', 'f_email', 'f_country',
]);
const GUEST_INLINE_EXCLUDED_ID_SUFFIX = /_fname$|_lname$|_email$|_country$/;

// Deliberately the same shape PayPal's Orders API enforces on
// `payer.email_address` and the server enforces on staff/guest emails: a
// dotted domain is required. `<input type="email">` alone is NOT enough —
// the HTML spec happily accepts `ade@yahoo`, which PayPal then rejects,
// killing checkout with an unexplained "Something went wrong", and which
// bounces the ticket email even when payment succeeds.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Is this plausibly a real phone number?
 *
 * The `phone` field renders a plain text input, so "n/a", "ask my assistant"
 * and similar all sail through today — and a staff member's ticket-delivery
 * problems start with an unreachable contact. Deliberately permissive about
 * FORMAT (spaces, dashes, parens, dots, a leading +) and strict only about
 * substance: digits, and a count inside E.164's 7–15 range.
 *
 * Not a carrier-level validation and not trying to be — it rejects text, not
 * wrong numbers.
 */
export function isLikelyPhoneNumber(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  const cleaned = s.replace(/[\s().-]/g, '');
  const withoutPlus = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(withoutPlus)) return false;
  return withoutPlus.length >= 7 && withoutPlus.length <= 15;
}

/** Normalise a value for confirm-field comparison (emails are case-insensitive). */
function confirmValue(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export function validateRequired(
  fields: FormField[],
  answers: Record<string, any>,
  isVisible: (f: FormField) => boolean,
): ValidateResult {
  for (const field of fields) {
    if (!isVisible(field)) continue;
    // Confirmation fields ("re-type your email"). A typo here is how a ticket
    // goes to an address nobody reads, so mismatches block submit even though
    // both fields individually look valid.
    const confirmsId = (field as any).confirmsFieldId as string | undefined;
    if (confirmsId) {
      const source = fields.find(f => f.id === confirmsId);
      const a = confirmValue(answers[confirmsId]);
      const b = confirmValue(answers[field.id]);
      if (a && b && a !== b) {
        return { ok: false, error: `${field.label} does not match ${source?.label ?? 'the address above'}.` };
      }
    }
    if (field.type === 'phone') {
      const raw = answers[field.id];
      if (String(raw ?? '').trim() && !isLikelyPhoneNumber(raw)) {
        return { ok: false, error: `Please enter a valid phone number for ${field.label}.` };
      }
    }
    // Format-check any email field that has a value, required or not — an
    // optional address still ends up on the order and on the ticket.
    if (field.type === 'email') {
      const raw = answers[field.id];
      if (typeof raw === 'string' && raw.trim() && !EMAIL_RE.test(raw.trim())) {
        return { ok: false, error: `Please enter a valid email address for ${field.label}.` };
      }
    }
    if (!field.required) continue;
    if (NON_ANSWER_FIELD_TYPES.has(field.type)) continue;
    if (!answers[field.id]) {
      return { ok: false, error: `Please fill in ${field.label}` };
    }
    if (field.type === 'text' && (field as any).validation === 'int' && answers[field.id]) {
      if (!/^\d+$/.test(answers[field.id])) {
        return { ok: false, error: `${field.label} must be a whole number.` };
      }
    }
  }
  return { ok: true };
}

export function validateRms(
  rmsField: FormField | null,
  registrationMode: 'individual' | 'group' | null,
): ValidateResult {
  if (!rmsField) return { ok: true };
  if (!rmsField.required) return { ok: true };
  if (registrationMode === null) {
    return { ok: false, error: `Please select ${rmsField.label}` };
  }
  return { ok: true };
}

export interface GroupMember {
  name: string;
  email: string;
  countryCode?: string | null;
  categoryId?: string | null;
  fullAnswers?: Record<string, any>;
}

export function groupFieldsBySection(
  fields: FormField[],
  steps: FormStep[],
): Record<string, FormField[]> {
  const byStep: Record<string, FormField[]> = {};
  for (const step of steps) byStep[step.id] = [];

  const firstStepId = steps[0]?.id;
  for (const field of fields) {
    const stepId = field.section && byStep[field.section] ? field.section : firstStepId;
    if (!stepId) continue;
    byStep[stepId].push(field);
  }

  for (const stepId of Object.keys(byStep)) {
    byStep[stepId].sort((a, b) => {
      const ao = (a.sectionOrder ?? (a as any).order ?? 0);
      const bo = (b.sectionOrder ?? (b as any).order ?? 0);
      return ao - bo;
    });
  }

  return byStep;
}

export interface ValidateGroupMembersOptions {
  /** When true, each guest's `fullAnswers` is validated against every required
   *  non-identity field in `formFields`. Required because inline-mode
   *  ("I have each additional person's details on hand") collects those
   *  answers per guest and the purchaser should not be able to skip them. */
  hasAllInfo?: boolean;
  /** The form's field list — mirrors what GuestFullDetailsInline renders. */
  formFields?: FormField[];
}

export function validateGroupMembers(
  registrationMode: 'individual' | 'group' | null,
  groupMembers: GroupMember[],
  requireCountryAndCategory: boolean,
  options?: ValidateGroupMembersOptions,
): ValidateResult {
  if (registrationMode !== 'group') return { ok: true };
  if (groupMembers.length === 0) {
    return { ok: false, error: 'Please add at least one additional registrant.' };
  }
  for (let i = 0; i < groupMembers.length; i++) {
    const m = groupMembers[i];
    if (!m.name?.trim()) {
      return { ok: false, error: 'Please provide a name for every additional registrant.' };
    }
    if (!m.email?.trim()) {
      return { ok: false, error: 'Please provide an email for every additional registrant.' };
    }
    if (!EMAIL_RE.test(m.email.trim())) {
      return { ok: false, error: `"${m.email.trim()}" is not a valid email address. Please correct it for every additional registrant.` };
    }
    if (requireCountryAndCategory) {
      if (!m.countryCode) return { ok: false, error: 'Please select a country for every additional registrant.' };
      if (!m.categoryId) return { ok: false, error: 'Please select a category for every additional registrant.' };
    }
    if (options?.hasAllInfo && options.formFields?.length) {
      const detailsCheck = validateGuestFullAnswers(options.formFields, m.fullAnswers ?? {}, i);
      if (!detailsCheck.ok) return detailsCheck;
    }
  }
  return { ok: true };
}

function validateGuestFullAnswers(
  formFields: FormField[],
  fullAnswers: Record<string, any>,
  memberIndex: number,
): ValidateResult {
  const isVisible = (f: FormField): boolean => {
    const cond = (f as any).conditional;
    if (!cond?.enabled || !cond.fieldId) return true;
    const tv = fullAnswers[cond.fieldId];
    if (tv === undefined || tv === null) return false;
    if (Array.isArray(tv)) return tv.includes(cond.value);
    if (typeof tv === 'boolean') return String(tv) === cond.value;
    return String(tv) === cond.value;
  };

  for (const field of formFields) {
    if (GUEST_INLINE_EXCLUDED_TYPES.has(field.type)) continue;
    if (GUEST_INLINE_EXCLUDED_IDS.has(field.id)) continue;
    if (GUEST_INLINE_EXCLUDED_ID_SUFFIX.test(field.id)) continue;
    if (!field.required) continue;
    if (!isVisible(field)) continue;

    const v = fullAnswers[field.id];
    // Explicit "empty" set: handles required consent booleans (false means
    // "not accepted") while keeping numeric 0 valid for number fields.
    const empty = v === undefined || v === null || v === '' || v === false
      || (Array.isArray(v) && v.length === 0);
    if (empty) {
      return {
        ok: false,
        error: `Please complete "${field.label}" for additional registrant ${memberIndex + 1}.`,
      };
    }
    if (field.type === 'text' && (field as any).validation === 'int' && v) {
      if (!/^\d+$/.test(String(v))) {
        return {
          ok: false,
          error: `"${field.label}" must be a whole number for additional registrant ${memberIndex + 1}.`,
        };
      }
    }
  }
  return { ok: true };
}
