import type { Profile, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';

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
      <GlassCard tint="blue" className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-gansid-secondary/10 blur-2xl" aria-hidden />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-gansid-secondary font-display font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-gansid-secondary" aria-hidden />
              Up Next
            </div>
            <div className="font-display text-xl font-bold mt-1.5">GANSID Congress 2026</div>
            <div className="font-body text-sm text-gansid-on-surface/60 mt-1">Hyderabad, India &middot; Oct 23&ndash;25, 2026</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-5xl font-black leading-none bg-gansid-gradient-reverse bg-clip-text text-transparent tabular-nums">{days}</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-gansid-on-surface/50 font-display font-semibold mt-1">days to go</div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
