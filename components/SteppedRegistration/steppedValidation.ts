import type { FormField, FormStep } from '../../types';

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

const NON_ANSWER_FIELD_TYPES: ReadonlySet<string> = new Set([
  'ticket',
  'registration-mode-selector',
]);

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

export function validateRequired(
  fields: FormField[],
  answers: Record<string, any>,
  isVisible: (f: FormField) => boolean,
): ValidateResult {
  for (const field of fields) {
    if (!isVisible(field)) continue;
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
