import { useState } from 'react';
import { Download, Loader2, QrCode } from 'lucide-react';
import type { Profile, Attendee } from '../../../types';
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
    : profile.role === 'super_admin' ? 'Super Admin'
    : profile.role === 'admin' ? 'Admin'
    : 'Attendee';
  const rolePillGradient =
    profile.role === 'exhibitor' ? 'bg-[linear-gradient(135deg,#8b2a5e_0%,#5a3575_100%)]'
    : profile.role === 'sponsor' ? 'bg-[linear-gradient(135deg,#2260a1_0%,#1a4880_100%)]'
    : profile.role === 'super_admin' ? 'bg-[linear-gradient(135deg,#78350f_0%,#b45309_100%)]'
    : profile.role === 'admin' ? 'bg-[linear-gradient(135deg,#0f172a_0%,#1a4880_100%)]'
    : 'bg-gansid-primary-gradient';

  if (!attendee) {
    return (
      <div className="overflow-hidden rounded-gansid-lg bg-white shadow-[0_16px_40px_-18px_rgba(26,28,28,0.35)] ring-1 ring-black/[0.05]">
        {/* Gradient header band */}
        <div className="relative bg-gansid-primary-gradient px-6 pt-5 pb-14 text-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">GANSID Congress 2026</span>
            <span className="rounded-full bg-white/20 px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-white ring-1 ring-white/30 backdrop-blur-sm">
              {roleBadge}
            </span>
          </div>
        </div>
        <div className="-mt-10 flex flex-col items-center px-6 pb-6 text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-gansid-primary-gradient font-display text-2xl font-bold text-white shadow-lg ring-4 ring-white">
            {initials}
          </div>
          <div className="mt-3 font-display text-lg font-bold text-gansid-on-surface">{profile.fullName ?? profile.email}</div>
          <p className="mt-3 font-body text-sm font-medium text-gansid-on-surface/75">No credential yet</p>
          <p className="mt-1 font-body text-xs text-gansid-on-surface/50">Complete your registration to receive your credential.</p>
        </div>
      </div>
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
      <div className="overflow-hidden rounded-gansid-lg bg-white shadow-[0_18px_44px_-18px_rgba(26,28,28,0.4)] ring-1 ring-black/[0.05]">
        {/* Gradient header band with wordmark + role pill */}
        <div className="relative bg-gansid-primary-gradient px-6 pt-5 pb-16 text-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/22 to-transparent" aria-hidden />
          <div className="pointer-events-none absolute -left-10 -top-12 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">GANSID Congress 2026</span>
            <span className={`${rolePillGradient} rounded-full px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-md ring-1 ring-white/25`}>
              {roleBadge}
            </span>
          </div>
        </div>

        {/* Overlapping avatar + identity */}
        <div className="-mt-11 flex flex-col items-center px-6 text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-gansid-primary-gradient font-display text-2xl font-bold text-white shadow-lg ring-4 ring-white">
            {initials}
          </div>
          <div className="mt-3 font-display text-xl font-bold leading-tight text-gansid-on-surface">{profile.fullName}</div>
          {profile.organization && (
            <div className="mt-0.5 font-body text-sm text-gansid-on-surface/65">{profile.organization}</div>
          )}
        </div>

        {/* QR panel — sunken tinted surface for that "credential" feel */}
        <div className="px-6 pt-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open credential badge"
            className="group mx-auto flex w-full flex-col items-center rounded-2xl bg-gansid-surface-container-low p-4 ring-1 ring-black/[0.04] transition-transform duration-300 ease-viscous hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50"
          >
            <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/[0.04]">
              <img
                alt="Credential QR"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`}
                className="h-40 w-40 rounded-md"
              />
            </div>
            <span className="mt-2.5 inline-flex items-center gap-1.5 font-body text-xs font-medium text-gansid-on-surface/55">
              <QrCode className="h-3.5 w-3.5" /> Tap to enlarge
            </span>
          </button>
        </div>

        {/* Download CTA */}
        <div className="px-6 pb-6 pt-4">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gansid-primary-gradient px-4 py-3 font-display text-sm font-bold text-white shadow-md transition-transform duration-300 ease-viscous hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Preparing…' : 'Download Ticket PDF'}
          </button>
          {downloadError && (
            <p className="mt-2 text-center font-body text-xs text-gansid-primary">{downloadError}</p>
          )}
        </div>
      </div>
      <CredentialBadgeModal open={open} onClose={() => setOpen(false)} profile={profile} attendee={attendee} />
    </>
  );
}
