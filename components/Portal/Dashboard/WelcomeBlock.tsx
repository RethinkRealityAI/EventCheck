import type { Profile, Attendee } from '../../../types';
import { CalendarDays } from 'lucide-react';

interface Props {
  profile: Profile;
  latestAttendee: Attendee | null;
  /** Derived org name when the user is staff of a sponsor/exhibitor org —
   *  triggers the "Staff — {OrgName}" pill + "Attending with …" sub-line. */
  staffOrg?: string | null;
}

function daysUntilCongress(): number {
  const congressDate = new Date('2026-10-23T00:00:00Z');
  const now = new Date();
  const diffMs = congressDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function WelcomeBlock({ profile, latestAttendee, staffOrg }: Props) {
  const firstName = (profile.fullName ?? profile.email).split(' ')[0];
  const subhead = !latestAttendee
    ? 'Complete your Congress registration to receive your credential.'
    : (latestAttendee as any).paymentStatus === 'paid'
    ? 'Your GANSID 2026 credential is ready.'
    : 'Awaiting payment confirmation for your Congress registration.';

  const days = daysUntilCongress();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          {staffOrg ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gansid-secondary/10 text-gansid-secondary text-xs font-semibold">
              Staff &mdash; {staffOrg}
            </span>
          ) : (
            <span className="inline-flex px-3 py-1 rounded-full bg-gansid-on-surface/5 text-xs capitalize text-gansid-on-surface/70">
              {profile?.role || 'Attendee'}
            </span>
          )}
        </div>
        <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight">
          <span className="text-gansid-secondary">Welcome back,</span>{' '}
          <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <p className="font-body text-gansid-on-surface/70 mt-3 text-lg">{subhead}</p>
        {staffOrg && (
          <p className="font-body text-sm text-gansid-on-surface/70 mt-1">
            Attending with <strong>{staffOrg}</strong>
          </p>
        )}
      </div>
      {/* Up Next — premium filled gradient tile, matched to TicketsSummaryTile */}
      <div className="group relative overflow-hidden rounded-2xl bg-[linear-gradient(140deg,#2260a1_0%,#1a4880_55%,#8b2a5e_130%)] p-5 text-white shadow-[0_16px_36px_-16px_rgba(34,96,161,0.7)] ring-1 ring-white/10">
        {/* interior sheen + soft motif */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />

        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25 backdrop-blur-sm" aria-hidden>
                <CalendarDays className="h-3.5 w-3.5" />
              </span>
              Up Next
            </div>
            <div className="mt-2 font-display text-xl font-bold leading-tight">GANSID Congress 2026</div>
            <div className="mt-1 font-body text-sm text-white/75">Hyderabad, India &middot; Oct 23&ndash;25, 2026</div>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/[0.12] px-4 py-3 text-center ring-1 ring-white/20 backdrop-blur-sm">
            <div className="font-display text-5xl font-black leading-none text-white tabular-nums drop-shadow-sm">{days}</div>
            <div className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">days to go</div>
          </div>
        </div>
      </div>
    </div>
  );
}
