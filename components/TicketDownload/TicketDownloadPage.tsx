import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type jsPDF from 'jspdf';
import { AlertTriangle, Download, Loader2, Ticket } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateTicketPDF } from '../../utils/pdfGenerator';
// Reuse the existing row → domain mappers so the rebuilt PDFs match checkout.
import { mapAttendeeFromDb, mapFormFromDb } from '../../services/storageService';
import { DEFAULT_SETTINGS, AppSettings, PdfSettings } from '../../types';
import { CURRENT_SITE } from '../../config/sites';

type TicketRow = { id: string; name: string; ticketType?: string };

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: string }
  | { phase: 'ready'; tickets: TicketRow[]; formTitle?: string; bannerUrl?: string };

/**
 * The registration-download edge function returns a PARTIAL app_settings row
 * (security allow-list: only `id`, `pdf_settings`, `currency`,
 * `email_from_name`, `email_header_logo`). It deliberately omits SMTP + every
 * other column. There is NO reusable AppSettings mapper in storageService
 * (the mapping is inline in getSettings and reads the full row), so we build
 * the minimal AppSettings the ticket generator needs directly from the partial
 * row — falling back to DEFAULT_SETTINGS for everything else. generateTicketPDF
 * only reads `settings.pdfSettings` (merged with `form.pdfSettings`);
 * `currency`/`emailFromName` are carried through for completeness.
 * (`email_header_logo` is consumed separately for the page header banner.)
 */
function buildSettingsFromPartial(partial: any): AppSettings {
  const pdfSettings =
    (partial?.pdf_settings as unknown as PdfSettings) || DEFAULT_SETTINGS.pdfSettings;
  return {
    ...DEFAULT_SETTINGS,
    pdfSettings,
    currency: partial?.currency || DEFAULT_SETTINGS.currency,
    emailFromName: partial?.email_from_name || DEFAULT_SETTINGS.emailFromName,
  };
}

/**
 * Mirrors the email renderer's rule (_shared/emailTemplates.ts usableImageUrl):
 * only a trimmed http(s) URL renders as the header banner. data:/blob:/other
 * URIs (e.g. SCAGO's live base64 email_header_logo) fall through to the
 * brand-gradient wordmark band instead.
 */
function usableBannerUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : undefined;
}

function getTokenFromHash(): string {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return '';
  return new URLSearchParams(hash.slice(qIdx + 1)).get('token') ?? '';
}

export function TicketDownloadPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  // Hold rebuilt jsPDF docs keyed by attendee id for download-on-click.
  const [docs, setDocs] = useState<Record<string, jsPDF>>({});

  // Tenant-gated branding — same precedent as PublicRegistration.tsx.
  const isGansid = CURRENT_SITE.key === 'gansid';
  const brandGradientClass = isGansid ? 'bg-gansid-primary-gradient' : '';
  const brandDefaultStyle = isGansid ? undefined : { backgroundColor: '#4F46E5' };
  const wordmark = isGansid ? 'GANSID Congress 2026' : CURRENT_SITE.displayName;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getTokenFromHash();
      if (!token) {
        if (!cancelled) setState({ phase: 'error', reason: 'missing' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('registration-download', {
        body: { token },
      });
      if (cancelled) return;
      if (error || !data || data.error) {
        // The edge function returns { error, reason } in a NON-2xx body on a
        // bad/expired token. supabase-js v2 sets `data = null` on non-2xx and
        // stashes the Response in `error.context` (same gotcha handled in
        // MyTicketsPage) — so the reason must be read from there, not `data`.
        let reason = 'invalid';
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            reason = body?.reason || body?.error || (error ? 'server' : 'invalid');
          } catch {
            reason = error ? 'server' : 'invalid';
          }
        } else if (data && (data as any).reason) {
          reason = (data as any).reason;
        }
        if (!cancelled) setState({ phase: 'error', reason });
        return;
      }

      try {
        const settings = buildSettingsFromPartial(data.settings);
        const bannerUrl = usableBannerUrl((data.settings as any)?.email_header_logo);
        const form = data.form ? mapFormFromDb(data.form as any) : undefined;
        const rows = [data.primary, ...((data.guests as any[]) || [])].filter(Boolean);
        const builtDocs: Record<string, jsPDF> = {};
        const tickets: TicketRow[] = [];
        for (const row of rows) {
          const attendee = mapAttendeeFromDb(row as any);
          const doc = await generateTicketPDF(attendee, settings, form);
          builtDocs[attendee.id] = doc;
          tickets.push({
            id: attendee.id,
            name: attendee.name || 'Ticket',
            ticketType: attendee.ticketType || undefined,
          });
        }
        if (cancelled) return;
        setDocs(builtDocs);
        setState({ phase: 'ready', tickets, formTitle: form?.title, bannerUrl });
      } catch (e) {
        console.error('TicketDownloadPage: failed to rebuild ticket PDFs', e);
        if (!cancelled) setState({ phase: 'error', reason: 'render' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const download = (id: string, name: string) => {
    const doc = docs[id];
    if (doc) doc.save(`${(name || 'Ticket').replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`);
  };

  /** Header banner: uploaded http(s) logo when available, else a brand-gradient wordmark band. */
  const renderBanner = (bannerUrl?: string) =>
    bannerUrl ? (
      <img src={bannerUrl} alt={wordmark} className="w-full h-auto block" />
    ) : (
      <div
        className={`px-6 py-8 text-center text-white ${brandGradientClass}`}
        style={brandDefaultStyle}
      >
        <p className="text-[11px] uppercase tracking-[0.25em] font-semibold text-white/75 mb-1.5">
          Event Tickets
        </p>
        <p className="text-xl sm:text-2xl font-black tracking-tight leading-tight">{wordmark}</p>
      </div>
    );

  /** Shared premium page shell: soft backdrop + centered card with the banner on top. */
  const renderShell = (children: ReactNode, opts?: { bannerUrl?: string; footer?: ReactNode }) => (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 px-4 py-10 sm:py-16">
      <div className="max-w-xl mx-auto animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-300/50 ring-1 ring-slate-900/5 overflow-hidden">
          {renderBanner(opts?.bannerUrl)}
          <div className="p-6 sm:p-8">{children}</div>
        </div>
        {opts?.footer}
      </div>
    </div>
  );

  if (state.phase === 'loading') {
    return renderShell(
      <div>
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          <p className="font-semibold">Preparing your tickets…</p>
        </div>
        <div className="mt-6 space-y-3" aria-hidden="true">
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      </div>,
    );
  }

  if (state.phase === 'error') {
    const expired = state.reason === 'expired';
    return renderShell(
      <div className="text-center py-2">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">
          {expired ? 'This ticket link has expired' : 'This ticket link is invalid or has expired'}
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          {expired
            ? 'For security, download links only work for a limited time. Please check the most recent email from the organizers for a fresh link, or ask them to re-send your tickets.'
            : 'Please double-check that you opened the link from the most recent email you received. If it still doesn’t work, the organizers can re-send your tickets.'}
        </p>
        <p className="text-sm text-slate-500 mt-4">
          Need help?{' '}
          <a
            href={`mailto:${CURRENT_SITE.supportEmail}`}
            className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 transition"
          >
            Contact the organizers
          </a>
        </p>
      </div>,
    );
  }

  return renderShell(
    <div>
      <div className="mb-6">
        {state.formTitle && (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
            {state.formTitle}
          </p>
        )}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your tickets</h1>
        <p className="text-sm text-slate-500 mt-1">
          Download your ticket{state.tickets.length === 1 ? '' : 's'} below and have the QR code
          ready at check-in.
        </p>
      </div>

      {state.tickets.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <Ticket className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No tickets were found for this link.</p>
        </div>
      ) : (
        <>
          {state.tickets.length > 1 && (
            <button
              onClick={() => state.tickets.forEach((t) => download(t.id, t.name))}
              className={`w-full mb-4 py-3.5 rounded-xl text-white text-sm font-black uppercase tracking-widest shadow-lg transition transform hover:scale-[1.01] active:scale-[0.99] ${brandGradientClass}`}
              style={brandDefaultStyle}
            >
              <Download className="w-4 h-4 inline -mt-0.5 mr-2" />
              Download all ({state.tickets.length})
            </button>
          )}
          <ul className="space-y-3">
            {state.tickets.map((t) => (
              <li
                key={t.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white shadow ${brandGradientClass}`}
                    style={brandDefaultStyle}
                  >
                    <Ticket className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                    {t.ticketType && (
                      <p className="text-xs text-slate-500 truncate">{t.ticketType}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => download(t.id, t.name)}
                  className={`w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-lg text-white text-sm font-bold shadow transition transform hover:scale-[1.02] active:scale-95 ${brandGradientClass}`}
                  style={brandDefaultStyle}
                >
                  <Download className="w-4 h-4 inline -mt-0.5 mr-1.5" />
                  Download
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>,
    {
      bannerUrl: state.bannerUrl,
      footer: (
        <p className="text-center text-xs text-slate-400 mt-6 px-4">
          Keep this link handy — you can come back and re-download your tickets anytime before the
          event.
        </p>
      ),
    },
  );
}

export default TicketDownloadPage;
