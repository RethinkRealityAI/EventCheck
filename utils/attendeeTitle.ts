// The honorific ("Dr.", "Mrs.", "Prof.") an attendee picked, and their name
// with it in front — how the registration desk addresses people.
//
// The congress forms store it as a select answer. Seeded forms use the id
// `f_title`; template-built forms use a generated id (`f_<ts>_title`), so the
// field is found by its "Title" label on the attendee's own form, with
// `f_title` as the fallback for rows whose form isn't loaded.
//
// Pure + data-only so it is unit-tested.

export interface TitleSource {
  name?: string | null;
  answers?: Record<string, unknown> | null;
}

export interface TitleForm {
  fields?: { id: string; label: string }[];
}

export const TITLE_FIELD_ID = 'f_title';

/** The title answer, trimmed, or '' when there is none. */
export function attendeeTitleOf(a: TitleSource, form?: TitleForm | null): string {
  const answers = a.answers ?? {};
  const field = form?.fields?.find(f => /^\s*title\s*$/i.test(f.label));
  const raw = (field ? answers[field.id] : undefined) ?? answers[TITLE_FIELD_ID];
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * "Dr. Jane Doe". Leaves the name alone when there is no title, or when the
 * name already starts with it ("Dr Jane Doe" typed into the name itself), so
 * nobody reads as "Dr. Dr. Jane Doe".
 */
export function nameWithTitle(name: string, title: string): string {
  const n = (name ?? '').trim();
  const t = (title ?? '').trim();
  if (!t || !n) return n;
  const bare = t.replace(/\.$/, '').toLowerCase();
  const lead = n.toLowerCase().match(/^([a-z]+)\.?(\s|$)/);
  if (lead && lead[1] === bare) return n;
  return `${t} ${n}`;
}
