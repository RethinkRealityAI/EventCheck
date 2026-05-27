// utils/attendeeCategories.ts
//
// Single source of truth for the attendee role/category tags. Every surface
// that surfaces a pill (AttendeeList, AttendeeModal, GuestSidebar, the 3D
// seating scene) reads from here so colors/labels/icons stay consistent.
//
// Speaker is GANSID-only in admin UI (gated by CURRENT_SITE.portalEnabled);
// it is included in the metadata so historical `guest_type='speaker'` rows
// still pill-render correctly on either tenant.

export type AttendeeCategory =
  | 'speaker'
  | 'dignitary'
  | 'awardee'
  | 'scholarship'
  | 'performer'
  | 'volunteer';

export interface CategoryMeta {
  id: AttendeeCategory;
  label: string;           // long form (admin UIs, dropdowns)
  shortLabel: string;      // pill text — kept tight to fit narrow columns
  icon: string;            // emoji for visual distinction
  /** Tailwind class triples for the pill: bg / text / border.
   *  Picked so each category is reliably distinguishable at a glance even
   *  with several pills next to each other. */
  pillBg: string;
  pillText: string;
  pillBorder: string;
  /** Dark-theme variant — used by the seating configurator (GuestSidebar +
   *  3D scene) which has a near-black background. Same hue family as the
   *  light variant so admins recognise the category instantly. */
  pillBgDark: string;
  pillTextDark: string;
  pillBorderDark: string;
  /** Hex color used by the 3D scene seat label (no Tailwind there). */
  hex: string;
  /** True when the category is only available on portal-enabled tenants
   *  (GANSID today). Used to gate the option in admin dropdowns. */
  portalOnly?: boolean;
}

/** Authoritative list. Order here drives the dropdown order in admin tools. */
export const ATTENDEE_CATEGORIES: readonly CategoryMeta[] = [
  {
    id: 'speaker',
    label: 'Speaker',
    shortLabel: 'SPEAKER',
    icon: '🎤',
    pillBg: 'bg-amber-100',
    pillText: 'text-amber-800',
    pillBorder: 'border-amber-200',
    pillBgDark: 'bg-amber-500/20',
    pillTextDark: 'text-amber-300',
    pillBorderDark: 'border-amber-500/30',
    hex: '#f59e0b',
    portalOnly: true,
  },
  {
    id: 'dignitary',
    label: 'Dignitary / Presenter',
    shortLabel: 'DIGNITARY',
    icon: '🎩',
    pillBg: 'bg-violet-100',
    pillText: 'text-violet-800',
    pillBorder: 'border-violet-200',
    pillBgDark: 'bg-violet-500/20',
    pillTextDark: 'text-violet-300',
    pillBorderDark: 'border-violet-500/30',
    hex: '#8b5cf6',
  },
  {
    id: 'awardee',
    label: 'Awardee',
    shortLabel: 'AWARDEE',
    icon: '🏆',
    pillBg: 'bg-yellow-100',
    pillText: 'text-yellow-800',
    pillBorder: 'border-yellow-300',
    pillBgDark: 'bg-yellow-500/20',
    pillTextDark: 'text-yellow-300',
    pillBorderDark: 'border-yellow-500/30',
    hex: '#eab308',
  },
  {
    id: 'scholarship',
    label: 'Scholarship Recipient',
    shortLabel: 'SCHOLARSHIP',
    icon: '🎓',
    pillBg: 'bg-emerald-100',
    pillText: 'text-emerald-800',
    pillBorder: 'border-emerald-200',
    pillBgDark: 'bg-emerald-500/20',
    pillTextDark: 'text-emerald-300',
    pillBorderDark: 'border-emerald-500/30',
    hex: '#10b981',
  },
  {
    id: 'performer',
    label: 'Performer',
    shortLabel: 'PERFORMER',
    icon: '🎭',
    pillBg: 'bg-rose-100',
    pillText: 'text-rose-800',
    pillBorder: 'border-rose-200',
    pillBgDark: 'bg-rose-500/20',
    pillTextDark: 'text-rose-300',
    pillBorderDark: 'border-rose-500/30',
    hex: '#f43f5e',
  },
  {
    id: 'volunteer',
    label: 'Volunteer',
    shortLabel: 'VOLUNTEER',
    icon: '🤝',
    pillBg: 'bg-sky-100',
    pillText: 'text-sky-800',
    pillBorder: 'border-sky-200',
    pillBgDark: 'bg-sky-500/20',
    pillTextDark: 'text-sky-300',
    pillBorderDark: 'border-sky-500/30',
    hex: '#0ea5e9',
  },
];

/** Map id → meta for O(1) lookup. */
export const CATEGORY_META: Readonly<Record<AttendeeCategory, CategoryMeta>> =
  Object.fromEntries(ATTENDEE_CATEGORIES.map(c => [c.id, c])) as any;

/** Resolve an attendee's effective category. Checks the new
 *  `attendeeCategory` column first, then falls back to the legacy
 *  `guestType='speaker'` value so historical speaker rows keep their pill
 *  without needing a backfill migration. */
export function resolveAttendeeCategory(a: {
  attendeeCategory?: string | null;
  guestType?: string | null | undefined;
}): AttendeeCategory | null {
  const raw = (a.attendeeCategory ?? '').trim();
  if (raw && (CATEGORY_META as any)[raw]) return raw as AttendeeCategory;
  if (a.guestType === 'speaker') return 'speaker';
  return null;
}

/** Dropdown options for admin tools. Filters out portalOnly categories on
 *  non-portal tenants so SCAGO admins don't see Speaker. */
export function getCategoryOptionsForSite(
  portalEnabled: boolean,
): readonly CategoryMeta[] {
  return ATTENDEE_CATEGORIES.filter(c => !c.portalOnly || portalEnabled);
}
