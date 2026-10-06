// "Which days is this person coming?" — the dimension the registration desk,
// catering and room planning all slice by.
//
// The congress form stores it as a checkbox answer (`f_days`, an array of
// option labels like "October 23, 2026"). Older rows, other forms and imports
// may hold a single string or nothing at all, so everything here tolerates any
// shape and treats "no answer" as its own bucket rather than as "all days".
//
// Pure + data-only so it is unit-tested.

/** Answer key the GANSID congress forms use for the days question. */
export const DAYS_FIELD_ID = 'f_days';

/** Filter value meaning "answered nothing for days". */
export const DAYS_NOT_SPECIFIED = '__none__';

export interface DaysAttendingSource {
  answers?: Record<string, unknown> | null;
}

/** The days this attendee selected, trimmed and de-duplicated, in answer order. */
export function daysAttendingOf(a: DaysAttendingSource): string[] {
  const raw = a.answers?.[DAYS_FIELD_ID];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s*[;|]\s*/) : [];
  const out: string[] = [];
  for (const v of list) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Sort key for a day label: its date when it parses, otherwise after every date. */
function dayTime(label: string): number {
  const t = Date.parse(label);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/** Every distinct day present across `rows`, earliest first (unparseable labels last, A–Z). */
export function distinctDays(rows: DaysAttendingSource[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const d of daysAttendingOf(r)) set.add(d);
  return [...set].sort((x, y) => dayTime(x) - dayTime(y) || x.localeCompare(y));
}

/** Compact pill text: "October 23, 2026" → "Oct 23". Unparseable labels pass through. */
export function shortDayLabel(label: string): string {
  const t = Date.parse(label);
  if (Number.isNaN(t)) return label;
  // Date.parse reads "October 23, 2026" as LOCAL midnight, so read the parts
  // back with local getters — UTC ones would shift the day east of Greenwich.
  const d = new Date(t);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

/** `filter` is 'all', DAYS_NOT_SPECIFIED, or one day label. */
export function matchesDaysFilter(a: DaysAttendingSource, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const days = daysAttendingOf(a);
  if (filter === DAYS_NOT_SPECIFIED) return days.length === 0;
  return days.includes(filter);
}

/** Human label for a filter value (used by the active-filter chips). */
export function daysFilterLabel(filter: string): string {
  if (filter === DAYS_NOT_SPECIFIED) return 'Days: not specified';
  return `Attending ${shortDayLabel(filter)}`;
}
