// "Which days is this person coming?" — the dimension the registration desk,
// catering and room planning all slice by.
//
// The congress form stores it as a checkbox answer (`f_days`, an array of
// option labels like "October 23, 2026"). Other doors write the same day
// differently — the TSCS India ingest writes "Oct 23, 2026" — so every label
// is reduced to a calendar-day KEY ("2026-10-23") before it is compared,
// counted or filtered on. Without that, the filter listed each day twice and
// picking one silently dropped everyone written the other way.
//
// Older rows, other forms and imports may hold a single string or nothing at
// all; "no answer" is its own bucket, never "all days".
//
// Pure + data-only so it is unit-tested.

/** Answer key the GANSID congress forms use for the days question. */
export const DAYS_FIELD_ID = 'f_days';

/** Filter value meaning "answered nothing for days". */
export const DAYS_NOT_SPECIFIED = '__none__';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DaysAttendingSource {
  answers?: Record<string, unknown> | null;
}

/**
 * Canonical key for one day label: "YYYY-MM-DD" when it reads as a date,
 * otherwise the trimmed label itself (e.g. "Gala night").
 */
export function dayKey(label: string): string {
  const s = label.trim();
  if (ISO_DAY.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  // Date.parse reads "Oct 23, 2026" as LOCAL midnight, so read the parts back
  // with local getters — UTC ones would shift the day east of Greenwich.
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The days this attendee selected, as canonical keys, de-duplicated, in answer order. */
export function daysAttendingOf(a: DaysAttendingSource): string[] {
  const raw = a.answers?.[DAYS_FIELD_ID];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\s*[;|]\s*/) : [];
  const out: string[] = [];
  for (const v of list) {
    const key = typeof v === 'string' && v.trim() ? dayKey(v) : '';
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Every distinct day present across `rows`, earliest first (non-date labels last, A–Z). */
export function distinctDays(rows: DaysAttendingSource[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const d of daysAttendingOf(r)) set.add(d);
  const isDate = (k: string) => ISO_DAY.test(k);
  return [...set].sort((x, y) =>
    isDate(x) === isDate(y) ? x.localeCompare(y) : isDate(x) ? -1 : 1);
}

/** Compact pill text for a day key: "2026-10-23" → "Oct 23". Other labels pass through. */
export function shortDayLabel(key: string): string {
  const m = ISO_DAY.exec(key);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : key;
}

/** `filter` is 'all', DAYS_NOT_SPECIFIED, or one day key. */
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
