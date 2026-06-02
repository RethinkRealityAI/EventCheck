import { Attendee, Form, FormField } from '../types';

/** True when the stored name is an unclaimed placeholder, not a real person. */
export function isPlaceholderGuestName(name: string | undefined): boolean {
  if (!name?.trim()) return true;
  return /Guest Ticket #/i.test(name);
}

/**
 * Resolve a display name from form field answers (split first/last, single name
 * field, etc.). Mirrors checkout logic in PublicRegistration.
 */
export function resolveNameFromFormFields(
  fields: FormField[] | undefined,
  answers: Record<string, unknown> | undefined,
): string {
  if (!fields?.length || !answers) return '';

  const firstF = fields.find(f => f.type === 'text' && /first\s*name|given\s*name/i.test(f.label));
  const lastF = fields.find(f => f.type === 'text' && /last\s*name|surname|family\s*name/i.test(f.label));
  if (firstF || lastF) {
    const parts = [
      firstF ? String(answers[firstF.id] ?? '').trim() : '',
      lastF ? String(answers[lastF.id] ?? '').trim() : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  const nameF = fields.find(f => f.type === 'text' || /\bname\b/i.test(f.label));
  if (nameF) {
    const v = String(answers[nameF.id] ?? '').trim();
    if (v) return v;
  }

  return '';
}

function guestMetaName(answers: Record<string, unknown>): string {
  const direct = answers._guest_name;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  const nested = (answers._purchaser_filled as Record<string, unknown> | undefined)?._guest_name;
  if (nested != null && String(nested).trim()) return String(nested).trim();

  return '';
}

/**
 * Best-effort ticket/display name for PDFs and emails. Prefers live form
 * answers (including purchaser-entered guest metadata), then the top-level
 * attendee.name column. Does not mutate the attendee row.
 */
export function resolveAttendeeDisplayName(attendee: Attendee, form?: Form): string {
  const answers = (attendee.answers ?? {}) as Record<string, unknown>;

  const fromFields = resolveNameFromFormFields(form?.fields, answers);
  if (fromFields && !isPlaceholderGuestName(fromFields)) return fromFields;

  const fromMeta = guestMetaName(answers);
  if (fromMeta && !isPlaceholderGuestName(fromMeta)) return fromMeta;

  const top = (attendee.name || '').trim();
  if (top && !isPlaceholderGuestName(top)) return top;

  if (fromFields) return fromFields;
  if (fromMeta) return fromMeta;
  return top || 'Attendee';
}
