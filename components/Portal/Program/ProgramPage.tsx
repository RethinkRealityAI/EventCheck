import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, ChevronRight, Search, AlertTriangle } from 'lucide-react';
import {
  CONGRESS_DAYS,
  SESSION_KIND_LABEL,
  formatTime,
  sessionsForDay,
  type ProgramSession,
  type SessionKind,
} from '../../../config/congressProgram';
import { useMySchedule } from './useMySchedule';
import { RoomPill, SegmentedControl } from '../ui/congressUi';
import { useVirtualSessions } from '../Virtual/VirtualSessionsContext';
import { VirtualBadge } from '../Virtual/VirtualParts';
import { virtualPresenterLine, type VirtualSession } from '../../../utils/virtualSessions';

/**
 * Interactive Congress programme — the in-app, bookmarkable version of the
 * programme PDF. Delegates filter by day, stream type or free text and tap the
 * bookmark to build their own schedule (see MySchedulePage). Tapping a card
 * opens the session detail; `?day=N` opens a given day (the home card uses it).
 *
 * The embedded programme site stays available from the menu; this screen is the
 * one that feeds "My Schedule".
 */

type ProgramFilter = 'all' | 'virtual' | SessionKind;

/** 'virtual' is added at runtime, and only for admins + virtual presenters. */
const FILTERS: { id: ProgramFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'plenary', label: 'Plenary' },
  { id: 'parallel', label: 'Parallel' },
  { id: 'abstracts', label: 'Abstracts' },
  { id: 'patient', label: 'Patient' },
  { id: 'industry', label: 'Industry' },
];

const KIND_PILL: Record<SessionKind, string> = {
  ceremony: 'bg-gansid-primary/10 text-gansid-primary',
  plenary: 'bg-gansid-secondary/10 text-gansid-secondary',
  parallel: 'bg-gansid-secondary/10 text-gansid-secondary',
  abstracts: 'bg-gansid-on-surface/[0.06] text-gansid-on-surface/60',
  industry: 'bg-gansid-on-surface/[0.06] text-gansid-on-surface/60',
  patient: 'bg-gansid-primary/10 text-gansid-primary',
  break: 'bg-gansid-on-surface/[0.05] text-gansid-on-surface/45',
  social: 'bg-gansid-primary/10 text-gansid-primary',
  logistics: 'bg-gansid-on-surface/[0.05] text-gansid-on-surface/45',
};

function SessionCard({
  session,
  saved,
  clashes,
  onToggle,
  virtual,
}: {
  session: ProgramSession;
  saved: boolean;
  clashes: boolean;
  onToggle: () => void;
  /** Set only for admins + virtual presenters, and only on virtual sessions. */
  virtual?: VirtualSession;
}) {
  const isBreak = session.kind === 'break' || session.kind === 'logistics';

  if (isBreak) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-gansid-surface-container-low px-4 py-3">
        <span className="w-[52px] shrink-0 text-right font-display text-xs font-semibold tabular-nums text-gansid-on-surface/45">
          {formatTime(session.start)}
        </span>
        <span className="font-body text-sm text-gansid-on-surface/55">{session.title}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-[52px] shrink-0 pt-3.5 text-right">
        <div className="font-display text-[13px] font-bold tabular-nums text-gansid-on-surface">
          {formatTime(session.start).replace(' AM', '').replace(' PM', '')}
        </div>
        <div className="mt-0.5 font-body text-[11px] tabular-nums text-gansid-on-surface/40">
          {formatTime(session.end).replace(' AM', '').replace(' PM', '')}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 rounded-gansid-md bg-white/85 p-4 shadow-[0_16px_36px_-26px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.04] backdrop-blur-viscous">
        <Link to={`/portal/program/session/${session.id}`} className="block w-full text-left">
          <span className="flex flex-wrap items-center gap-2 pr-10">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 font-display text-[9.5px] font-bold uppercase tracking-[0.12em] ${KIND_PILL[session.kind]}`}
            >
              {SESSION_KIND_LABEL[session.kind]}
            </span>
            <RoomPill room={session.room} />
            {virtual && <VirtualBadge />}
            {session.sponsor && (
              <span className="font-body text-[11px] text-gansid-on-surface/45">· {session.sponsor}</span>
            )}
          </span>

          <span className="mt-2 block pr-9 font-display text-[15px] font-bold leading-snug tracking-tight text-gansid-on-surface text-pretty">
            {session.title}
          </span>

          {session.speakers?.length ? (
            <span className="mt-1.5 block truncate font-body text-[12.5px] text-gansid-on-surface/55">
              {session.speakers.join(' · ')}
            </span>
          ) : null}

          {virtual && (
            <span className="mt-1.5 block font-body text-[12px] font-semibold text-[#5a3575]">
              Presenting virtually: {virtualPresenterLine(virtual)}
            </span>
          )}

          <span className="mt-2 inline-flex items-center gap-0.5 font-body text-[11.5px] font-medium text-gansid-secondary">
            Session details
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        {session.bookmarkable !== false && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from my schedule' : 'Add to my schedule'}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-gansid-on-surface/[0.04] transition-transform duration-300 ease-viscous active:scale-90"
          >
            {saved ? (
              <BookmarkCheck className="h-[18px] w-[18px] text-gansid-primary" />
            ) : (
              <Bookmark className="h-[18px] w-[18px] text-gansid-on-surface/45" />
            )}
          </button>
        )}

        {saved && clashes && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gansid-primary/[0.07] px-2.5 py-1 font-body text-[11px] font-medium text-gansid-primary">
            <AlertTriangle className="h-3 w-3" /> Overlaps another saved session
          </p>
        )}
      </div>
    </div>
  );
}

function parseDay(v: string | null): 1 | 2 | 3 {
  return v === '2' ? 2 : v === '3' ? 3 : 1;
}

export function ProgramPage() {
  const [params, setParams] = useSearchParams();
  const day = parseDay(params.get('day'));
  const setDay = (d: 1 | 2 | 3) => setParams(d === 1 ? {} : { day: String(d) }, { replace: true });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const { has, toggle, count, clashing } = useMySchedule();
  const { canSee: canSeeVirtual, byId: virtualById } = useVirtualSessions();
  const filters = canSeeVirtual ? [FILTERS[0], { id: 'virtual' as const, label: 'Virtual' }, ...FILTERS.slice(1)] : FILTERS;

  const activeDay = CONGRESS_DAYS.find((d) => d.day === day)!;

  const sessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessionsForDay(day).filter((s) => {
      if (filter === 'virtual') {
        if (!virtualById.has(s.id)) return false;
      } else if (filter !== 'all' && s.kind !== filter) return false;
      if (!q) return true;
      const haystack = [s.title, s.room, s.sponsor, s.moderator, s.chair, ...(s.speakers ?? []), ...(s.talks ?? []), ...(s.abstracts ?? []).map((a) => a.title)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [day, query, filter, virtualById]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Programme</h1>
          <p className="mt-1 font-body text-sm text-gansid-on-surface/60">{activeDay.date}</p>
        </div>
        <Link
          to="/portal/my-schedule"
          className="inline-flex items-center gap-2 rounded-full bg-gansid-primary-gradient px-4 py-2.5 font-display text-sm font-bold text-white shadow-[0_14px_28px_-16px_rgba(186,0,40,0.75)] transition-transform duration-300 ease-viscous hover:scale-[1.02]"
        >
          <BookmarkCheck className="h-4 w-4" />
          My schedule
          {count > 0 && (
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold tabular-nums">{count}</span>
          )}
        </Link>
      </div>

      {/* Day switcher */}
      <SegmentedControl
        label="Congress day"
        options={CONGRESS_DAYS.map((d) => ({ value: d.day, label: d.short }))}
        value={day}
        onChange={setDay}
      />

      {/* Search */}
      <div className="mt-3 flex items-center gap-2.5 rounded-full bg-white/85 px-4 py-3 shadow-[0_12px_28px_-22px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.04] backdrop-blur-viscous">
        <Search className="h-4 w-4 shrink-0 text-gansid-on-surface/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions, speakers, rooms"
          className="min-w-0 flex-1 bg-transparent font-body text-sm text-gansid-on-surface outline-none placeholder:text-gansid-on-surface/40"
        />
      </div>

      {/* Type filters */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={[
              'shrink-0 rounded-full px-4 py-2 font-display text-[13px] font-semibold transition-all duration-300 ease-viscous',
              filter === f.id
                ? 'bg-gansid-primary-gradient text-white shadow-[0_12px_24px_-14px_rgba(186,0,40,0.8)]'
                : 'bg-gansid-on-surface/[0.05] text-gansid-on-surface/70 hover:bg-gansid-on-surface/[0.08]',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sessions */}
      <div className="mt-4 space-y-3">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            saved={has(s.id)}
            clashes={clashing.has(s.id)}
            onToggle={() => toggle(s.id)}
            virtual={canSeeVirtual ? virtualById.get(s.id) : undefined}
          />
        ))}
      </div>

      {sessions.length === 0 && (
        <div className="mt-10 rounded-gansid-lg bg-white/85 p-8 text-center shadow-[0_18px_40px_-26px_rgba(26,28,28,0.4)] ring-1 ring-black/[0.04]">
          <p className="font-display font-semibold text-gansid-on-surface/80">No sessions match that filter</p>
          <p className="mt-1 font-body text-sm text-gansid-on-surface/55">
            Try another day, or clear the search.
          </p>
        </div>
      )}

      <p className="mt-5 text-center font-body text-xs text-gansid-on-surface/45">
        Registration desk open {activeDay.registrationDesk.replace(' – ', '–')} ·{' '}
        <a href={activeDay.evaluationUrl} target="_blank" rel="noreferrer" className="font-semibold text-gansid-secondary underline-offset-2 hover:underline">
          Day {activeDay.day} Congress evaluation
        </a>
      </p>
    </div>
  );
}
