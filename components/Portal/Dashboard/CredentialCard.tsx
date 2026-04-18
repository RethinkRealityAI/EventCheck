import { useState } from 'react';
import type { Profile, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { CredentialBadgeModal } from './CredentialBadgeModal';
import { Link } from 'react-router-dom';

interface Props { profile: Profile; attendee: Attendee | null; }

export function CredentialCard({ profile, attendee }: Props) {
  const [open, setOpen] = useState(false);
  const initials = (profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor' : profile.role === 'sponsor' ? 'Sponsor' : 'Delegate';

  if (!attendee) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="font-display text-sm uppercase tracking-wider text-gansid-on-surface/50">GANSID '26</div>
          <div className="h-24 w-24 rounded-full bg-gansid-surface-container-low flex items-center justify-center font-display text-2xl text-gansid-on-surface/40">
            {initials}
          </div>
          <p className="font-body text-gansid-on-surface/70 text-sm">No credential yet.</p>
          <Link to="/portal">
            <ViscousButton variant="primary">Register for Congress</ViscousButton>
          </Link>
        </div>
      </GlassCard>
    );
  }

  const qrPayload = (attendee as any).qrPayload ?? attendee.id;

  return (
    <>
      <GlassCard>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-display text-sm uppercase tracking-wider text-gansid-on-surface/50">GANSID '26</span>
            <span className="px-3 py-1 text-xs rounded-full bg-gansid-primary-container/20 text-gansid-primary font-display uppercase tracking-wide">{roleBadge}</span>
          </div>
          <div className="h-24 w-24 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-2xl">
            {initials}
          </div>
          <div>
            <div className="font-display text-xl font-semibold">{profile.fullName}</div>
            <div className="font-body text-sm text-gansid-on-surface/70">{profile.organization}</div>
          </div>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open credential badge">
            <img
              alt="Credential QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`}
              className="rounded-lg"
            />
          </button>
          <p className="font-body text-xs text-gansid-on-surface/50">Click to enlarge</p>
        </div>
      </GlassCard>
      <CredentialBadgeModal open={open} onClose={() => setOpen(false)} profile={profile} attendee={attendee} />
    </>
  );
}
