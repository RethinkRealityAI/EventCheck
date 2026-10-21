import { Link } from 'react-router-dom';
import { ChevronRight, Video } from 'lucide-react';
import { sessionById, type ProgramSession } from '../../../config/congressProgram';
import { nextSaved, weekdayDate } from '../../../utils/congressDirectory';
import { isPresenterIn } from '../../../utils/virtualSessions';
import { RoomPill } from '../ui/congressUi';
import { useVirtualSessions } from './VirtualSessionsContext';
import { ZoomJoin } from './VirtualParts';

/**
 * Home card for virtual presenters ONLY (not admins, not delegates): their next
 * virtual session with its Zoom link, and the way into /portal/virtual.
 */
export function VirtualPresentationCard({ now }: { now: number }) {
  const { sessions, myKey } = useVirtualSessions();
  if (!myKey) return null;

  const mine = sessions.filter((vs) => isPresenterIn(vs, myKey));
  if (mine.length === 0) return null;

  const programme = mine.map((vs) => sessionById(vs.sessionId)).filter((s): s is ProgramSession => !!s);
  const next = nextSaved(now, programme);
  const nextVs = next ? mine.find((vs) => vs.sessionId === next.id) : undefined;

  return (
    <div
      className="rounded-[26px] p-[18px] text-white shadow-[0_22px_44px_-24px_rgba(90,53,117,0.85)]"
      style={{ backgroundImage: 'linear-gradient(140deg,#5a3575 0%,#3d3a8a 55%,#2260a1 120%)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/15" aria-hidden>
            <Video className="h-3.5 w-3.5" />
          </span>
          <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/85">
            You’re presenting virtually
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-white/[0.14] px-2.5 py-1 font-display text-[11px] font-bold">
          {mine.length} session{mine.length === 1 ? '' : 's'}
        </span>
      </div>

      {next && nextVs ? (
        <>
          <p className="mt-3 line-clamp-2 font-display text-[18px] font-bold leading-[1.22] text-pretty">{next.title}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-display text-[15px] font-extrabold tabular-nums">{next.start}</span>
            <span className="font-body text-[13px] text-white/[0.82]">{weekdayDate(next.day)}</span>
            <RoomPill room={next.room} onDark />
          </p>
          <p className="mt-3 font-body text-[12.5px] leading-relaxed text-white/80">
            Join with the <strong className="text-white">panelist link</strong> emailed to you. Back-up: join here as an attendee and we’ll promote you.
          </p>
          <div className="mt-3">
            <ZoomJoin session={nextVs} onDark />
          </div>
        </>
      ) : (
        <p className="mt-3 font-display text-[16px] font-bold">Thank you — all your virtual sessions are done</p>
      )}

      <Link
        to="/portal/virtual"
        className="mt-3 flex items-center justify-between border-t border-white/[0.16] pt-3 font-body text-[12.5px] text-white/80"
      >
        <span>All your virtual sessions &amp; Zoom links</span>
        <span className="inline-flex items-center gap-0.5 font-display font-bold text-white">
          Open <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
