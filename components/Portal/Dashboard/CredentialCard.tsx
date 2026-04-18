import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Profile, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { CredentialBadgeModal } from './CredentialBadgeModal';
import { getFormById, getSettings } from '../../../services/storageService';
import { generateTicketPDF } from '../../../utils/pdfGenerator';

interface Props { profile: Profile; attendee: Attendee | null; }

export function CredentialCard({ profile, attendee }: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const initials = (profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor'
    : profile.role === 'sponsor' ? 'Sponsor'
    : profile.role === 'admin' ? 'Admin'
    : 'Attendee';
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
          <p className="font-body text-xs text-gansid-on-surface/50">Complete your registration to receive your credential.</p>
        </div>
      </GlassCard>
    );
  }

  const qrPayload = (attendee as any).qrPayload ?? attendee.id;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const [form, settings] = await Promise.all([
        getFormById((attendee as any).formId),
        getSettings(),
      ]);
      if (!form || !settings) throw new Error('Ticket template unavailable');
      const doc = await generateTicketPDF(attendee, settings, form);
      const safeName = (attendee.name || profile.fullName || 'Attendee').replace(/[^a-zA-Z0-9 ]/g, '_');
      doc.save(`${safeName}_Ticket.pdf`);
    } catch (err: any) {
      console.error('Ticket PDF download failed', err);
      setDownloadError(err?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <GlassCard className="relative overflow-hidden">
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
          <p className="font-body text-xs text-gansid-on-surface/50">Click QR to enlarge</p>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-gansid-primary-gradient text-white font-display font-bold text-sm shadow-md hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Preparing…' : 'Download Ticket PDF'}
          </button>
          {downloadError && (
            <p className="font-body text-xs text-gansid-primary">{downloadError}</p>
          )}
        </div>
      </GlassCard>
      <CredentialBadgeModal open={open} onClose={() => setOpen(false)} profile={profile} attendee={attendee} />
    </>
  );
}
