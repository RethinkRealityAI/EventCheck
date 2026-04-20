import { useRef } from 'react';
import html2canvas from 'html2canvas';
import type { Profile, Attendee } from '../../../types';
import { GlassDialog } from '../ui/GlassDialog';
import { ViscousButton } from '../ui/ViscousButton';

interface Props {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  attendee: Attendee;
}

export function CredentialBadgeModal({ open, onClose, profile, attendee }: Props) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor'
    : profile.role === 'sponsor' ? 'Sponsor'
    : profile.role === 'super_admin' ? 'Super Admin'
    : profile.role === 'admin' ? 'Admin'
    : 'Attendee';
  const qrPayload = (attendee as any).qrPayload ?? attendee.id;

  const handleSave = async () => {
    if (!badgeRef.current) return;
    const canvas = await html2canvas(badgeRef.current, { backgroundColor: '#FDFDFD', scale: 2 });
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GANSID-2026-Credential-${(profile.fullName ?? 'user').replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <GlassDialog open={open} onClose={onClose}>
      <div ref={badgeRef} className="bg-white rounded-gansid-xl overflow-hidden">
        <div className="h-20 bg-gansid-primary-gradient flex items-center justify-center">
          <span className="text-white font-display text-xl tracking-widest">GANSID Congress 2026</span>
        </div>
        <div className="p-8 flex flex-col items-center space-y-4">
          <div className="h-28 w-28 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-3xl">
            {(profile.fullName ?? 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold">{profile.fullName}</div>
            <div className="font-body text-gansid-on-surface/70">{profile.organization}</div>
            <div className="font-body text-sm text-gansid-on-surface/50">{profile.countryCode ?? ''}</div>
          </div>
          <span className="px-4 py-1 rounded-full bg-gansid-primary-container/20 text-gansid-primary font-display uppercase tracking-wide text-sm">{roleBadge}</span>
          <img
            alt="QR"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`}
          />
          <p className="font-body text-xs text-gansid-on-surface/50 text-center">Present this QR at the Congress entrance.</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-6">
        <ViscousButton variant="secondary" onClick={onClose}>Close</ViscousButton>
        <ViscousButton variant="primary" onClick={handleSave}>Save as Image</ViscousButton>
      </div>
    </GlassDialog>
  );
}
