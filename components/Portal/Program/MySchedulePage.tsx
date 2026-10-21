import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, Bookmark, X } from 'lucide-react';
import { CONGRESS_DAYS, SESSION_KIND_LABEL, formatTime } from '../../../config/congressProgram';
import { downloadIcs, useMySchedule } from './useMySchedule';
import { RoomPill } from '../ui/congressUi';

/**
 * My Schedule — the delegate's own plan, built from the interactive programme.
 * Sessions are grouped by congress day in running order, clashes are flagged,
 * and the whole plan exports to any calendar app as .ics.
 */
export function MySchedulePage() {
  const { sessions, count, remove, clashing } = useMySchedule();

  if (count === 0) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">My schedule</h1>
        <div className="mt-6 rounded-gansid-lg bg-white/85 p-9 text-center shadow-[0_18px_40px_-26px_rgba(26,28,28,0.4)] ring-1 ring-black/[0.04] backdrop-blur-viscous">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gansid-surface-container-low">
            <Bookmark className="h-6 w-6 text-gansid-on-surface/35" />
          </div>
          <p className="mt-4 font-display text-lg font-bold">Nothing saved yet</p>
          <p className="mx-auto mt-1.5 max-w-sm font-body text-sm leading-relaxed text-gansid-on-surface/55">
            Tap the bookmark on any session in the programme and it lands here, ready for the three days.
          </p>
          <Link
            to="/portal/program"
            className="mt-5 inline-flex rounded-full bg-gansid-primary-gradient px-6 py-3 font-display text-sm font-bold text-white shadow-[0_16px_32px_-18px_rgba(186,0,40,0.75)] transition-transform duration-300 ease-viscous hover:scale-[1.02]"
          >
            Browse the programme
          </Link>
        </div>
      </div>
    );
  }

  const hasClash = clashing.size > 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">My schedule</h1>
          <p className="mt-1 font-body text-sm text-gansid-on-surface/60">
            {count} session{count === 1 ? '' : 's'} saved across three days
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadIcs(sessions)}
          className="inline-flex items-center gap-2 rounded-full bg-gansid-primary-gradient px-4 py-2.5 font-display text-sm font-bold text-white shadow-[0_14px_28px_-16px_rgba(186,0,40,0.75)] transition-transform duration-300 ease-viscous hover:scale-[1.02]"
        >
          <CalendarPlus className="h-4 w-4" />
          Add to calendar
        </button>
      </div>

      {hasClash && (
        <div className="mb-5 flex items-start gap-3 rounded-gansid-md bg-gansid-primary/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gansid-primary" />
          <p className="font-body text-[13px] leading-relaxed text-gansid-on-surface/75">
            Some saved sessions run at the same time. Parallel streams overlap by design — keep both if you plan to
            move between rooms.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {CONGRESS_DAYS.map((d) => {
          const daySessions = sessions.filter((s) => s.day === d.day);
          if (daySessions.length === 0) return null;
          return (
            <section key={d.day}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="h-4 w-1 rounded-full bg-gansid-primary-gradient" aria-hidden />
                <h2 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gansid-on-surface/50">
                  {d.label} · {d.date}
                </h2>
              </div>

              <div className="space-y-3">
                {daySessions.map((s) => (
                  <div
                    key={s.id}
                    className="relative rounded-gansid-md bg-white/85 p-4 shadow-[0_16px_36px_-26px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.04] backdrop-blur-viscous"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gansid-secondary/10 px-2.5 py-1 font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-gansid-secondary">
                        {SESSION_KIND_LABEL[s.kind]}
                      </span>
                      <span className="font-display text-[12.5px] font-bold tabular-nums text-gansid-on-surface">
                        {formatTime(s.start)} – {formatTime(s.end)}
                      </span>
                      <RoomPill room={s.room} />
                      {clashing.has(s.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gansid-primary/[0.08] px-2 py-0.5 font-body text-[10.5px] font-semibold text-gansid-primary">
                          <AlertTriangle className="h-3 w-3" /> Clash
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 pr-9 font-display text-[15px] font-bold leading-snug tracking-tight text-pretty">
                      {s.title}
                    </h3>

                    {s.speakers?.length ? (
                      <p className="mt-1.5 font-body text-[12.5px] text-gansid-on-surface/55">{s.speakers.join(' · ')}</p>
                    ) : null}
                    {s.moderator && (
                      <p className="mt-0.5 font-body text-[12px] text-gansid-on-surface/45">Moderator: {s.moderator}</p>
                    )}

                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      aria-label={`Remove ${s.title} from my schedule`}
                      className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-gansid-on-surface/[0.04] transition-transform duration-300 ease-viscous active:scale-90"
                    >
                      <X className="h-4 w-4 text-gansid-on-surface/45" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-center font-body text-xs text-gansid-on-surface/40">
        Your plan is saved on this device. Sign in on another device and bookmark there too.
      </p>
    </div>
  );
}
