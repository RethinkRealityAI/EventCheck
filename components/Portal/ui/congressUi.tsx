import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin } from 'lucide-react';
import { initialsFor } from '../../../utils/congressDirectory';

/**
 * Small shared pieces for the Congress app screens (home cards, speakers,
 * session detail). Kept here rather than in each page so the glass surface and
 * the press feel stay identical everywhere.
 */

/** Frosted card surface from the handoff: white 82%, blur 24 + saturate, soft lift. */
export const GLASS_CARD =
  'bg-gansid-surface-container-lowest/[0.82] backdrop-blur-viscous backdrop-saturate-[1.6] shadow-[0_18px_40px_-24px_rgba(26,28,28,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-black/[0.04]';

/** Press state: scale down on tap, viscous ease. */
export const PRESS = 'transition-transform duration-300 ease-viscous active:scale-[0.98]';

const AVATAR_GRADIENT = 'linear-gradient(140deg,#2260a1 0%,#1a4880 55%,#8b2a5e 130%)';

export function InitialsAvatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display font-bold text-white shadow-[0_10px_20px_-12px_rgba(26,28,28,0.8)]"
      style={{ width: size, height: size, backgroundImage: AVATAR_GRADIENT, fontSize: Math.round(size * 0.32) }}
    >
      {initialsFor(name)}
    </span>
  );
}

/**
 * Back chevron + title row for detail screens. Falls back to `fallback` when
 * the screen was opened directly (no in-app history to go back to).
 */
export function BackHeader({ title, subtitle, fallback }: { title: string; subtitle?: string; fallback: string }) {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={goBack}
        aria-label="Back"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gansid-on-surface/[0.05] text-gansid-on-surface transition-transform duration-300 ease-viscous active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-bold tracking-tight text-gansid-on-surface">{title}</h1>
        {subtitle && <p className="font-body text-xs text-gansid-on-surface/50">{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Segmented control with a sliding white thumb on the #f3f3f3 track — the
 * Programme day tabs and the Speakers day switch share it.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" aria-label={label} className="relative flex rounded-full bg-gansid-surface-container-low p-1">
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-white shadow-[0_8px_18px_-10px_rgba(26,28,28,0.5)] transition-transform duration-500 ease-viscous"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={[
            'relative z-10 flex-1 rounded-full py-2.5 font-display text-sm font-bold transition-colors duration-300 ease-viscous',
            o.value === value ? 'text-gansid-on-surface' : 'text-gansid-on-surface/55 hover:text-gansid-on-surface',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The room a session is in (Hall 1, Room 5, Exhibition…) as a tinted pill with
 * a map pin, so delegates can spot where to go at a glance. `onDark` is the
 * frosted white version for the blue gradient cards and headers.
 */
export function RoomPill({ room, onDark = false, className = '' }: { room: string; onDark?: boolean; className?: string }) {
  if (!room) return null;
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] font-display text-[11.5px] font-bold leading-tight',
        onDark
          ? 'bg-white/20 text-white ring-1 ring-white/30'
          : 'bg-gansid-secondary/10 text-gansid-secondary ring-1 ring-gansid-secondary/20',
        className,
      ].join(' ')}
    >
      <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      {room}
    </span>
  );
}

/** Current time, refreshed every `intervalMs` and whenever the tab regains focus. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}
