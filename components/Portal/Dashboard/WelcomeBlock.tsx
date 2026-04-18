import type { Profile, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';

interface Props { profile: Profile; latestAttendee: Attendee | null; }

function daysUntilCongress(): number {
  const congressDate = new Date('2026-10-23T00:00:00Z');
  const now = new Date();
  const diffMs = congressDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function WelcomeBlock({ profile, latestAttendee }: Props) {
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
        <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight">
          <span className="text-gansid-secondary">Welcome back,</span>{' '}
          <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">{firstName}</span>
        </h1>
        <p className="font-body text-gansid-on-surface/70 mt-3 text-lg">{subhead}</p>
      </div>
      <GlassCard tint="blue">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gansid-on-surface/50 font-display">Up Next</div>
            <div className="font-display text-xl font-semibold mt-1">GANSID Congress 2026</div>
            <div className="font-body text-sm text-gansid-on-surface/60 mt-1">Hyderabad, India &middot; Oct 23&ndash;25, 2026</div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold text-gansid-secondary">{days}</div>
            <div className="text-xs uppercase tracking-wide text-gansid-on-surface/50 font-display">days to go</div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
