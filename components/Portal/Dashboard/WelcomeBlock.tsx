import type { Profile, Attendee } from '../../../types';

interface Props {
  profile: Profile;
  latestAttendee: Attendee | null;
}

export function WelcomeBlock({ profile, latestAttendee }: Props) {
  const firstName = (profile.fullName ?? profile.email).split(' ')[0];
  const subhead = !latestAttendee
    ? 'Complete your Congress registration to receive your credential.'
    : (latestAttendee as any).paymentStatus === 'paid'
    ? 'Your GANSID 2026 credential is ready.'
    : 'Awaiting payment confirmation for your Congress registration.';

  return (
    <div>
      <h1 className="font-display font-bold text-5xl leading-tight">
        Welcome back,
        <br />
        <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">{firstName}</span>
      </h1>
      <p className="font-body text-gansid-on-surface/70 mt-3 text-lg">{subhead}</p>
    </div>
  );
}
