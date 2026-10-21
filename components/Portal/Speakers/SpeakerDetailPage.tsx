import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { sessionById } from '../../../config/congressProgram';
import { buildSpeakerDirectory, initialsFor, sessionWhen } from '../../../utils/congressDirectory';
import { BackHeader, GLASS_CARD, PRESS, RoomPill } from '../ui/congressUi';

const SPEAKERS = buildSpeakerDirectory();

/** One person's page: who they are and every session they appear in. */
export function SpeakerDetailPage() {
  const { speakerId } = useParams();
  const speaker = useMemo(() => SPEAKERS.find((p) => p.id === speakerId), [speakerId]);

  if (!speaker) {
    return (
      <div className="mx-auto max-w-2xl">
        <BackHeader title="Speaker" fallback="/portal/speakers" />
        <div className={`rounded-gansid-md p-8 text-center ${GLASS_CARD}`}>
          <p className="font-display font-semibold text-gansid-on-surface/80">We couldn’t find that speaker</p>
          <Link to="/portal/speakers" className="mt-2 inline-block font-body text-sm font-semibold text-gansid-secondary">
            Back to all speakers
          </Link>
        </div>
      </div>
    );
  }

  // One row per session, even when a person both speaks and chairs it.
  const sessionIds = [...new Set(speaker.appearances.map((a) => a.sessionId))];
  const sessions = sessionIds
    .map((id) => sessionById(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  const place = [...speaker.orgs, speaker.country].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-2xl">
      <BackHeader title="Speaker" subtitle="GANSID Congress 2026" fallback="/portal/speakers" />

      <div
        className="-mx-6 px-6 py-7 text-center text-white sm:mx-0 sm:rounded-gansid-md"
        style={{ backgroundImage: 'linear-gradient(140deg,#8b2a5e 0%,#5a3575 60%,#1a4880 130%)' }}
      >
        <span className="mx-auto grid h-[82px] w-[82px] place-items-center rounded-full bg-white/15 font-display text-2xl font-bold ring-1 ring-white/35">
          {initialsFor(speaker.name)}
        </span>
        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">{speaker.name}</h2>
        <p className="mt-1 font-body text-sm text-white/80">{speaker.roles.join(' · ')}</p>
        {place && <p className="mt-0.5 font-body text-[13px] text-white/65">{place}</p>}
      </div>

      {speaker.bio && (
        <section className={`mt-4 rounded-[22px] p-4 ${GLASS_CARD}`}>
          <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">Biography</h3>
          <p className="mt-2 font-body text-sm leading-relaxed text-gansid-on-surface/75">{speaker.bio}</p>
        </section>
      )}

      <section className={`mt-4 rounded-[22px] p-4 ${GLASS_CARD}`}>
        <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/40">Sessions</h3>
        <ul className="mt-1 divide-y divide-gansid-on-surface/[0.06]">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link to={`/portal/program/session/${s.id}`} className={`flex items-center gap-3 py-3 ${PRESS}`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14px] font-bold leading-snug text-gansid-on-surface text-pretty">
                    {s.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-body text-xs text-gansid-on-surface/50">{sessionWhen(s)}</span>
                    <RoomPill room={s.room} />
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gansid-on-surface/30" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
