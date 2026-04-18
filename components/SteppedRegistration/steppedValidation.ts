import type { FormField, FormStep } from '../../types';

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

const NON_ANSWER_FIELD_TYPES: ReadonlySet<string> = new Set([
  'ticket',
  'registration-mode-selector',
]);

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

export function validateGroupMembers(
  registrationMode: 'individual' | 'group' | null,
  groupMembers: GroupMember[],
  requireCountryAndCategory: boolean,
): ValidateResult {
  if (registrationMode !== 'group') return { ok: true };
  if (groupMembers.length === 0) {
    return { ok: false, error: 'Please add at least one group member.' };
  }
  for (const m of groupMembers) {
    if (!m.name?.trim()) {
      return { ok: false, error: 'Please provide a name for every group member.' };
    }
    if (!m.email?.trim()) {
      return { ok: false, error: 'Please provide an email for every group member.' };
    }
    if (requireCountryAndCategory) {
      if (!m.countryCode) return { ok: false, error: 'Please select a country for every group member.' };
      if (!m.categoryId) return { ok: false, error: 'Please select a category for every group member.' };
    }
  }
  return { ok: true };
}
