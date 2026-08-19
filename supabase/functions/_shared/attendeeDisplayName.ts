// Ticket/email display-name resolution.
//
// Moved here from utils/ so BOTH the browser and the Deno edge runtime can use
// it — the edge bundler only uploads files under supabase/functions, so
// anything the server-side ticket PDF needs has to live in _shared.
// `utils/resolveAttendeeDisplayName.ts` re-exports this file, exactly like
// `utils/emailShell.ts` re-exports `_shared/emailShell.ts`.
//
// Types are structural rather than imported from ../../../types for the same
// reason. They document the actual data contract of a ticket: the real
// `Attendee`/`Form` interfaces are supersets and satisfy these by shape.

export interface NameFormField {
  id: string;
  type: string;
  label: string;
}

export interface NameForm {
  fields?: NameFormField[];
}

export interface NameAttendee {
  name?: string;
  answers?: Record<string, unknown> | null;
}

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
  fields: NameFormField[] | undefined,
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
export function resolveAttendeeDisplayName(attendee: NameAttendee, form?: NameForm): string {
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
