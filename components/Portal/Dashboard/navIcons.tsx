import type { ReactElement, SVGProps } from 'react';

/**
 * Minimal, stroke-based line icons for the premium mobile floating nav
 * (PortalQuickNav) + menu sheet. Hand-drawn so they read crisp and uniform
 * at 22–24px, `stroke="currentColor"` so the nav can paint them white (or
 * dim them when a route is inactive). No fills, no emoji, no gradient chips —
 * this is the "custom white minimal SVG" language the portal asked for.
 *
 * All share the same 24×24 viewBox, 1.75 stroke, round caps/joins.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 10.5 12 3.75l8.5 6.75" />
      <path d="M5.25 9.25V19a1 1 0 0 0 1 1H9.5v-4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20h3.25a1 1 0 0 0 1-1V9.25" />
    </svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.25a1.75 1.75 0 0 0 0 3.5v1.25A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.25a1.75 1.75 0 0 0 0-3.5Z" />
      <path d="M14 7v10" strokeDasharray="1.5 2.25" />
    </svg>
  );
}

export function AgendaIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2.25" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
      <path d="M7.75 13h.01M12 13h.01M16.25 13h.01M7.75 16.5h.01M12 16.5h.01" strokeWidth={2.1} />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M3.75 12h16.5M12 3.75c2.2 2.2 3.3 5.1 3.3 8.25S14.2 18.05 12 20.25c-2.2-2.2-3.3-5.1-3.3-8.25S9.8 5.95 12 3.75Z" />
    </svg>
  );
}

export function MaterialsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7.25A1.75 1.75 0 0 1 5.75 5.5H10l1.75 2h6.5A1.75 1.75 0 0 1 20 9.25v7.5A1.75 1.75 0 0 1 18.25 18.5H5.75A1.75 1.75 0 0 1 4 16.75Z" />
    </svg>
  );
}

export function VenueIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21c4-4 6.5-7.1 6.5-10.25a6.5 6.5 0 1 0-13 0C5.5 13.9 8 17 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M13 7.25l.9-.9a3.6 3.6 0 1 1 5.1 5.1l-2 2a3.6 3.6 0 0 1-5.1 0" />
      <path d="M11 16.75l-.9.9a3.6 3.6 0 1 1-5.1-5.1l2-2a3.6 3.6 0 0 1 5.1 0" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5.5 6v5c0 4 2.7 7.4 6.5 9 3.8-1.6 6.5-5 6.5-9V6Z" />
      <path d="m9.25 12 1.9 1.9 3.6-3.8" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.5 8.25V6.5a1.5 1.5 0 0 0-1.5-1.5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H13a1.5 1.5 0 0 0 1.5-1.5v-1.75" />
      <path d="M10 12h9.5m0 0-2.75-2.75M19.5 12l-2.75 2.75" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75V12l2.75 1.75" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Maps a SidebarLink to a themed line icon. Falls back to a generic link glyph.
 * Keyed first on the well-known default `id`s (congress-home, program,
 * congress-materials, venue-info), then loosely on label/emoji keywords so
 * CMS-authored links still get a sensible icon instead of the fallback.
 */
export function iconForSidebarLink(link: {
  id?: string;
  label?: string;
  icon?: string;
}): (props: IconProps) => ReactElement {
  const id = (link.id || '').toLowerCase();
  const hay = `${link.label || ''} ${link.icon || ''}`.toLowerCase();

  if (id.includes('home') || hay.includes('home') || link.icon === '🌐' || hay.includes('congress home')) return GlobeIcon;
  if (id.includes('itiner') || id.includes('agenda') || id.includes('schedule') || id.includes('program') || hay.includes('itiner') || hay.includes('agenda') || hay.includes('schedule') || hay.includes('program') || link.icon === '📅') return AgendaIcon;
  if (id.includes('material') || id.includes('resource') || id.includes('doc') || hay.includes('material') || hay.includes('resource') || link.icon === '📁' || link.icon === '📄') return MaterialsIcon;
  if (id.includes('venue') || id.includes('map') || id.includes('location') || hay.includes('venue') || hay.includes('map') || link.icon === '📍') return VenueIcon;
  if (id.includes('ticket') || hay.includes('ticket') || link.icon === '🎟️' || link.icon === '🎫') return TicketIcon;
  return LinkIcon;
}
