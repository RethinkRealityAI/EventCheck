import { Link, Navigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { SESSION_KIND_LABEL, sessionById, type ProgramSession } from '../../../config/congressProgram';
import { weekdayDate } from '../../../utils/congressDirectory';
import { isPresenterIn, virtualPresenterLine, type VirtualSession } from '../../../utils/virtualSessions';
import { GLASS_CARD, PRESS, RoomPill } from '../ui/congressUi';
import { useVirtualSessions } from './VirtualSessionsContext';
import { PanelistNote, VirtualBadge, ZoomJoin } from './VirtualParts';

/**
 * /portal/virtual — for virtual presenters (their own sessions) and admins
 * (every virtual session). Anyone else is sent back to the portal home; the
 * data is RLS-protected regardless, so they would see an empty list anyway.
 */

type Row = { vs: VirtualSession; s: ProgramSession };

const byTime = (a: Row, b: Row) => a.s.day - b.s.day || a.s.start.localeCompare(b.s.start);

function rowsFor(list: VirtualSession[]): Row[] {
  return list
    .map((vs) => ({ vs, s: sessionById(vs.sessionId) }))
    .filter((r): r is Row => !!r.s)
    .sort(byTime);
}

function VirtualSessionCard({ vs, s }: Row) {
  return (
    <li className={`rounded-[22px] p-4 ${GLASS_CARD}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[13px] font-bold tabular-nums text-gansid-on-surface">
          {weekdayDate(s.day)} · {s.start}–{s.end}
        </span>
        <RoomPill room={s.room} />
        <VirtualBadge />
      </div>
      <Link to={`/portal/program/session/${s.id}`} className={`mt-2 flex items-start gap-2 ${PRESS}`}>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold leading-snug text-gansid-on-surface text-pretty">{s.title}</span>
          <span className="mt-1 block font-body text-xs text-gansid-on-surface/55">
            {SESSION_KIND_LABEL[s.kind]} · Presenting virtually: {virtualPresenterLine(vs)}
          </span>
        </span>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gansid-on-surface/30" aria-hidden />
      </Link>
      <div className="mt-3 border-t border-gansid-on-surface/[0.06] pt-3">
        <ZoomJoin session={vs} />
      </div>
    </li>
  );
}

export function VirtualSessionsPage() {
  const { loaded, sessions, myKey, isAdmin, canSee } = useVirtualSessions();

  if (!loaded) return null;
  if (!canSee) return <Navigate to="/portal" replace />;

  const mine = rowsFor(sessions.filter((vs) => isPresenterIn(vs, myKey)));
  const all = rowsFor(sessions);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Virtual presentation</h1>
        <p className="mt-1 font-body text-sm text-gansid-on-surface/60">
          {myKey
            ? `You’re presenting virtually in ${mine.length} session${mine.length === 1 ? '' : 's'}`
            : `${all.length} sessions have virtual presenters`}
        </p>
      </div>

      {myKey && <PanelistNote />}

      {myKey && (
        <section className="mt-5">
          <h2 className="mb-2 font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">Your sessions</h2>
          <ul className="space-y-3">
            {mine.map((r) => (
              <VirtualSessionCard key={r.vs.sessionId} {...r} />
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section className="mt-6">
          <h2 className="mb-2 font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">
            All virtual sessions · admin view
          </h2>
          <ul className="space-y-3">
            {all.map((r) => (
              <VirtualSessionCard key={r.vs.sessionId} {...r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
