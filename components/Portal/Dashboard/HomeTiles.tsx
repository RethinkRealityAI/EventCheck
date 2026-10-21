import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bookmark, CalendarDays, ChevronRight, MapPin, Ticket, Users } from 'lucide-react';
import { SESSION_KIND_LABEL } from '../../../config/congressProgram';
import {
  buildSpeakerDirectory,
  congressPhase,
  congressStarted,
  countCountries,
  countdownLabel,
  nextSaved,
  upNext,
  weekdayDate,
} from '../../../utils/congressDirectory';
import { GLASS_CARD, PRESS, RoomPill, useNow } from '../ui/congressUi';
import { useMySchedule } from '../Program/useMySchedule';
import { useUpdates } from '../Updates/useUpdates';
import { VirtualPresentationCard } from '../Virtual/VirtualPresentationCard';
import { SponsorTile } from './SponsorSlot';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { usePortalContent, usePortalContentLoaded } from '../content/ContentProvider';

/**
 * Portal home — six cards, in order: the live Programme card, My schedule, then
 * a 2×2 of Speakers, My ticket, Hyderabad guide and Updates. The latest
 * announcements sit right under the Programme card (hidden when there are
 * none), and the partner tile (flag-gated) plus a footer line sit underneath.
 *
 * Time-dependent copy is derived from Date.now() against the IST session
 * times and refreshes every minute and on focus.
 */

const SPEAKERS = buildSpeakerDirectory();
const SPEAKERS_LINE = `${SPEAKERS.length} from ${countCountries(SPEAKERS)} countries`;

const PROGRAMME_GRADIENT = 'linear-gradient(140deg,#2260a1 0%,#1a4880 55%,#8b2a5e 130%)';

function IconTile({ gradient, children }: { gradient: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-white shadow-[0_10px_20px_-12px_rgba(26,28,28,0.8)]"
      style={{ backgroundImage: gradient }}
    >
      {children}
    </span>
  );
}

function GridCard({
  to,
  gradient,
  icon,
  title,
  sub,
  badge,
}: {
  to: string;
  gradient: string;
  icon: ReactNode;
  title: string;
  sub: string;
  badge?: number;
}) {
  return (
    <Link to={to} className={`relative flex flex-col rounded-[24px] p-[15px] ${GLASS_CARD} ${PRESS}`}>
      <IconTile gradient={gradient}>{icon}</IconTile>
      {badge ? (
        <span className="absolute right-3.5 top-3.5 min-w-[22px] rounded-full bg-gansid-primary px-1.5 py-0.5 text-center font-display text-[11px] font-bold tabular-nums text-white">
          {badge}
        </span>
      ) : null}
      <span className="mt-3 font-display text-[15.5px] font-bold tracking-tight text-gansid-on-surface">{title}</span>
      <span className="mt-0.5 line-clamp-2 font-body text-xs leading-snug text-gansid-on-surface/55">{sub}</span>
    </Link>
  );
}

function ProgrammeCard({ now }: { now: number }) {
  const next = upNext(now);
  const pill = countdownLabel(congressPhase(now));
  const s = next?.session;

  return (
    <Link
      to={s ? `/portal/program?day=${s.day}` : '/portal/program'}
      className={`block rounded-[26px] p-[18px] text-white shadow-[0_22px_44px_-24px_rgba(18,58,107,0.85)] ${PRESS}`}
      style={{ backgroundImage: PROGRAMME_GRADIENT }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15" aria-hidden>
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/85">
            Programme · {next?.live ? 'Now' : 'Up next'}
          </span>
        </span>
        <span className="rounded-full bg-white/[0.14] px-2.5 py-1 font-display text-[11px] font-bold">{pill}</span>
      </div>

      {s ? (
        <>
          <p className="mt-3 line-clamp-2 font-display text-[18px] font-bold leading-[1.22] text-pretty">{s.title}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-display text-[15px] font-extrabold tabular-nums">{next.live ? `Until ${s.end}` : s.start}</span>
            <span className="font-body text-[13px] text-white/[0.82]">{weekdayDate(s.day)}</span>
            <RoomPill room={s.room} onDark />
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 font-display text-[18px] font-bold leading-[1.22]">That’s a wrap for 2026</p>
          <p className="mt-2 font-body text-[13px] text-white/[0.82]">Thank you for joining us in Hyderabad</p>
        </>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.16] pt-3 font-body text-[12.5px]">
        <span className="text-white/80">
          {s
            ? next.parallel.length
              ? `+${next.parallel.length} parallel session${next.parallel.length === 1 ? '' : 's'}`
              : SESSION_KIND_LABEL[s.kind]
            : 'Browse every session'}
        </span>
        <span className="inline-flex items-center gap-0.5 font-display font-bold">
          Full programme <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function MyScheduleCard({ now }: { now: number }) {
  const { sessions, count } = useMySchedule();
  const next = nextSaved(now, sessions);

  return (
    <Link to="/portal/my-schedule" className={`flex items-center gap-3.5 rounded-[24px] p-[15px] ${GLASS_CARD} ${PRESS}`}>
      <IconTile gradient="linear-gradient(135deg,#ba0028,#E0243C)">
        <Bookmark className="h-5 w-5" />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[15.5px] font-bold tracking-tight text-gansid-on-surface">My schedule</span>
          {count > 0 && <span className="shrink-0 font-body text-xs text-gansid-on-surface/50">{count} saved</span>}
        </span>
        {count === 0 ? (
          <>
            <span className="mt-0.5 block truncate font-body text-[13px] text-gansid-on-surface/70">Bookmark sessions to build your plan</span>
            <span className="mt-0.5 block truncate font-body text-xs text-gansid-on-surface/50">Clash alerts and calendar export included</span>
          </>
        ) : next ? (
          <>
            <span className="mt-0.5 block truncate font-body text-[13px] text-gansid-on-surface/70">{next.title}</span>
            <span className="mt-1 flex min-w-0 items-center gap-2">
              <span className="truncate font-body text-xs font-semibold text-gansid-secondary">
                Next · {weekdayDate(next.day)}, {next.start}
              </span>
              <RoomPill room={next.room} />
            </span>
          </>
        ) : (
          <span className="mt-0.5 block truncate font-body text-[13px] text-gansid-on-surface/70">All your saved sessions are done</span>
        )}
      </span>
    </Link>
  );
}

export function HomeTiles() {
  const now = useNow();
  const { unread } = useUpdates();
  const started = congressStarted(now);
  // Admins switch the partner tile off in /admin/content → Portal. Wait for
  // the real setting so a switched-off tile never flashes on from defaults.
  const { showSponsorTile } = usePortalContent();
  const tileOn = usePortalContentLoaded() && showSponsorTile !== false;

  return (
    <section aria-label="Congress shortcuts" className="space-y-3">
      {/* Virtual presenters only: their next session + Zoom link, first thing they see. */}
      <VirtualPresentationCard now={now} />
      <ProgrammeCard now={now} />
      {/* Latest announcements, as on the old home. The Programme card stays the
          hero; the Updates card keeps the unread count and full list. */}
      <AnnouncementsFeed hideWhenEmpty />
      <MyScheduleCard now={now} />

      <div className="grid grid-cols-2 gap-3">
        <GridCard
          to="/portal/speakers"
          gradient="linear-gradient(135deg,#8b2a5e,#5a3575)"
          icon={<Users className="h-5 w-5" />}
          title="Speakers"
          sub={SPEAKERS_LINE}
        />
        <GridCard
          to="/portal/tickets"
          gradient="linear-gradient(135deg,#0f335f,#2260a1)"
          icon={<Ticket className="h-5 w-5" />}
          title="My ticket"
          sub={started ? 'Show your QR at the desk' : 'Badge QR ready · Desk opens Fri 07:00'}
        />
        <GridCard
          to="/portal/venue"
          gradient="linear-gradient(135deg,#ba0028,#8b2a5e)"
          icon={<MapPin className="h-5 w-5" />}
          title="Hyderabad guide"
          sub="Eat, see, get around"
        />
        <GridCard
          to="/portal/updates"
          gradient="linear-gradient(135deg,#5a3575,#8b2a5e)"
          icon={<Bell className="h-5 w-5" />}
          title="Updates"
          sub={unread[0]?.title ?? 'All caught up'}
          badge={unread.length}
        />
      </div>

      {/* Partner tile — admin toggle in the Content CMS; the build flag
          VITE_FEATURE_SPONSOR_TILES=false removes it entirely. */}
      {tileOn && <SponsorTile
        name="Novartis"
        logoUrl="/branding/gansid/partners/novartis-logo.png"
        imageUrl="/branding/gansid/partners/novartis-cover.jpg"
        body="Novartis is an innovative medicines company. Every day, we work to reimagine medicine to improve and extend people's lives so that patients, healthcare professionals and societies are empowered in the face of serious disease. Our medicines reach 304 million people worldwide."
        href="https://www.novartis.com"
      />}

      <p className="pt-2 text-center font-body text-xs text-gansid-on-surface/40">GANSID Congress 2026 · Hyderabad, India</p>
    </section>
  );
}
