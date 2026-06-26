import { useEffect, useState } from 'react';
import type jsPDF from 'jspdf';
import { supabase } from '../../services/supabaseClient';
import { generateTicketPDF } from '../../utils/pdfGenerator';
// Reuse the existing row → domain mappers so the rebuilt PDFs match checkout.
import { mapAttendeeFromDb, mapFormFromDb } from '../../services/storageService';
import { DEFAULT_SETTINGS, AppSettings, PdfSettings } from '../../types';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: string }
  | { phase: 'ready'; tickets: { id: string; name: string }[] };

/**
 * The registration-download edge function returns a PARTIAL app_settings row
 * (security allow-list: only `id`, `pdf_settings`, `currency`, `email_from_name`).
 * It deliberately omits SMTP + every other column. There is NO reusable
 * AppSettings mapper in storageService (the mapping is inline in getSettings and
 * reads the full row), so we build the minimal AppSettings the ticket generator
 * needs directly from the partial row — falling back to DEFAULT_SETTINGS for
 * everything else. generateTicketPDF only reads `settings.pdfSettings` (merged
 * with `form.pdfSettings`); `currency`/`emailFromName` are carried through for
 * completeness.
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
        // The edge function returns { error, reason } on a bad/expired token.
        const reason = (data && data.reason) || (error ? 'server' : 'invalid');
        setState({ phase: 'error', reason });
        return;
      }

      try {
        const settings = buildSettingsFromPartial(data.settings);
        const form = data.form ? mapFormFromDb(data.form as any) : undefined;
        const rows = [data.primary, ...((data.guests as any[]) || [])].filter(Boolean);
        const builtDocs: Record<string, jsPDF> = {};
        const tickets: { id: string; name: string }[] = [];
        for (const row of rows) {
          const attendee = mapAttendeeFromDb(row as any);
          const doc = await generateTicketPDF(attendee, settings, form);
          builtDocs[attendee.id] = doc;
          tickets.push({ id: attendee.id, name: attendee.name || 'Ticket' });
        }
        if (cancelled) return;
        setDocs(builtDocs);
        setState({ phase: 'ready', tickets });
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

  if (state.phase === 'loading') {
    return (
      <div style={{ maxWidth: 560, margin: '64px auto', textAlign: 'center', fontFamily: 'system-ui', padding: 16 }}>
        Loading your tickets…
      </div>
    );
  }

  if (state.phase === 'error') {
    const msg =
      state.reason === 'expired'
        ? 'This download link has expired. Please contact the organizer to re-send your tickets.'
        : 'We couldn’t load these tickets. The link may be invalid — please contact the organizer.';
    return (
      <div style={{ maxWidth: 560, margin: '64px auto', textAlign: 'center', fontFamily: 'system-ui', padding: 16 }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Ticket download</h1>
        <p style={{ color: '#475569' }}>{msg}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '48px auto', fontFamily: 'system-ui', padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Your tickets</h1>
      {state.tickets.length === 0 ? (
        <p style={{ color: '#475569' }}>No tickets were found for this link.</p>
      ) : (
        <>
          <button
            onClick={() => state.tickets.forEach((t) => download(t.id, t.name))}
            style={{ marginBottom: 16, padding: '10px 18px', background: '#1E4A8C', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
          >
            Download all ({state.tickets.length})
          </button>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {state.tickets.map((t) => (
              <li
                key={t.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}
              >
                <span>{t.name}</span>
                <button
                  onClick={() => download(t.id, t.name)}
                  style={{ padding: '8px 14px', background: '#fff', border: '1px solid #1E4A8C', color: '#1E4A8C', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default TicketDownloadPage;
