import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, BookmarkCheck, BookmarkPlus, ChevronRight } from 'lucide-react';
import { SESSION_KIND_LABEL, sessionById } from '../../../config/congressProgram';
import {
  isBreakSession,
  isPerson,
  parsePerson,
  speakerIdForKey,
  weekdayDate,
  type SpeakerRole,
} from '../../../utils/congressDirectory';
import { BackHeader, GLASS_CARD, InitialsAvatar, PRESS, RoomPill } from '../ui/congressUi';
import { useMySchedule } from './useMySchedule';

/** Full session view: talks, host, and every person, each linking to their page. */
export function SessionDetailPage() {
  const { sessionId } = useParams();
  const session = sessionId ? sessionById(sessionId) : undefined;
  const { has, toggle, clashing } = useMySchedule();

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackHeader title="Session" fallback="/portal/program" />
        <div className={`rounded-gansid-md p-8 text-center ${GLASS_CARD}`}>
          <p className="font-display font-semibold text-gansid-on-surface/80">We couldn’t find that session</p>
          <Link to="/portal/program" className="mt-2 inline-block font-body text-sm font-semibold text-gansid-secondary">
            Back to the programme
          </Link>
        </div>
      </div>
    );
  }

  const people: { raw: string; role: SpeakerRole }[] = [
    ...(session.speakers ?? []).map((raw) => ({ raw, role: 'Speaker' as const })),
    ...(session.moderator ? [{ raw: session.moderator, role: 'Moderator' as const }] : []),
    ...(session.chair ? [{ raw: session.chair, role: 'Session chair' as const }] : []),
  ];
  const persons = people.filter((p) => isPerson(p.raw));
  const groups = people.filter((p) => !isPerson(p.raw));
  const isBreak = isBreakSession(session);
  const saved = has(session.id);
  const bookmarkable = session.bookmarkable !== false && !isBreak;

  return (
    <div className="mx-auto max-w-2xl">
      <BackHeader title="Session" subtitle="GANSID Congress 2026" fallback={`/portal/program?day=${session.day}`} />

      <div
        className="-mx-6 px-6 py-6 text-white sm:mx-0 sm:rounded-gansid-md"
        style={{ backgroundImage: 'linear-gradient(140deg,#2260a1 0%,#1a4880 55%,#8b2a5e 130%)' }}
      >
        <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ring-white/20">
          {SESSION_KIND_LABEL[session.kind]}
        </span>
        <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-pretty">{session.title}</h2>
        <p className="mt-2 font-body text-sm text-white/80">
          {weekdayDate(session.day)} · {session.start}–{session.end}
        </p>
        <RoomPill room={session.room} onDark className="mt-2.5 text-[12.5px]" />
      </div>

      {bookmarkable && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => toggle(session.id)}
            aria-pressed={saved}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-display text-sm font-bold',
              PRESS,
              saved
                ? 'bg-gansid-on-surface/[0.05] text-gansid-primary'
                : 'bg-gansid-primary-gradient text-white shadow-[0_14px_28px_-16px_rgba(186,0,40,0.75)]',
            ].join(' ')}
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
            {saved ? 'In my schedule' : 'Add to my schedule'}
          </button>
          {saved && clashing.has(session.id) && (
            <p className="mt-2 flex items-center justify-center gap-1.5 font-body text-xs font-medium text-gansid-primary">
              <AlertTriangle className="h-3.5 w-3.5" /> Overlaps another saved session
            </p>
          )}
        </div>
      )}

      {isBreak && !session.talks?.length && persons.length === 0 && (
        <p className={`mt-4 rounded-[22px] p-4 font-body text-sm text-gansid-on-surface/65 ${GLASS_CARD}`}>
          Open to all delegates · {session.room}
        </p>
      )}

      {session.talks?.length ? (
        <section className={`mt-4 rounded-[22px] p-4 ${GLASS_CARD}`}>
          <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">Talks</h3>
          <ol className="mt-3 space-y-3">
            {session.talks.map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gansid-secondary/10 font-display text-xs font-bold text-gansid-secondary">
                  {i + 1}
                </span>
                <span className="font-body text-[13.5px] leading-relaxed text-gansid-on-surface/75 text-pretty">{t}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {session.sponsor && (
        <section className={`mt-4 rounded-[22px] p-4 ${GLASS_CARD}`}>
          <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">Hosted by</h3>
          <p className="mt-2 font-display text-[15px] font-bold text-gansid-on-surface">{session.sponsor}</p>
        </section>
      )}

      {(persons.length > 0 || groups.length > 0) && (
        <section className={`mt-4 rounded-[22px] p-4 ${GLASS_CARD}`}>
          <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">
            Speakers &amp; chairs
          </h3>
          <ul className="mt-1 divide-y divide-gansid-on-surface/[0.06]">
            {persons.map(({ raw, role }) => {
              const p = parsePerson(raw);
              const sub = [role, ...(p.org ? [p.org] : []), p.country].filter(Boolean).join(' · ');
              return (
                <li key={`${role}-${raw}`}>
                  <Link to={`/portal/speakers/${speakerIdForKey(p.key)}`} className={`flex items-center gap-3 py-3 ${PRESS}`}>
                    <InitialsAvatar name={p.name} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[14.5px] font-bold text-gansid-on-surface">{p.name}</span>
                      <span className="block truncate font-body text-xs text-gansid-on-surface/55">{sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gansid-on-surface/30" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {groups.map(({ raw }) => (
            <p key={raw} className="pt-2 font-body text-[13px] text-gansid-on-surface/55">
              {raw}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
