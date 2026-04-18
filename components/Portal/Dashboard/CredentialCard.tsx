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
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor'
    : profile.role === 'sponsor' ? 'Sponsor'
    : profile.role === 'admin' ? 'Admin'
    : 'Delegate';
  const rolePillGradient =
    profile.role === 'exhibitor' ? 'bg-[linear-gradient(135deg,#8b2a5e_0%,#5a3575_100%)]'
    : profile.role === 'sponsor' ? 'bg-[linear-gradient(135deg,#2260a1_0%,#1a4880_100%)]'
    : profile.role === 'admin' ? 'bg-[linear-gradient(135deg,#0f172a_0%,#1a4880_100%)]'
    : 'bg-gansid-primary-gradient';

  if (!attendee) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-display text-xs uppercase tracking-widest text-gansid-on-surface/50">GANSID Congress 2026</span>
            <span className={`${rolePillGradient} text-white font-display text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1 rounded-full shadow-md`}>
              {roleBadge}
            </span>
          </div>
          <div className="h-24 w-24 rounded-full bg-gansid-primary-gradient flex items-center justify-center font-display text-2xl text-white shadow-lg ring-4 ring-white">
            {initials}
          </div>
          <p className="font-body text-gansid-on-surface/70 text-sm">No credential yet.</p>
          <Link to="/form/gansid-congress-2026">
            <ViscousButton variant="primary">Register for Congress</ViscousButton>
          </Link>
        </div>
      </GlassCard>
    );
  }

  const qrPayload = (attendee as any).qrPayload ?? attendee.id;

  return (
    <>
      <GlassCard className="relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gansid-gradient-swirl opacity-10 blur-2xl pointer-events-none" />
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-display text-xs uppercase tracking-widest text-gansid-on-surface/50">GANSID Congress 2026</span>
            <span className={`${rolePillGradient} text-white font-display text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1 rounded-full shadow-md`}>
              {roleBadge}
            </span>
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
