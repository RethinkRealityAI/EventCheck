import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import type { Attendee, Form, AppSettings } from '../../../types';
import { getFormById, getSettings } from '../../../services/storageService';
import { generateTicketPDF } from '../../../utils/pdfGenerator';
import { isPendingStaff, staffPassLabel } from '../../../utils/teamTickets';

export interface TeamGroup {
  primary: Attendee;
  staff: Attendee[];
}

interface Props {
  groups: TeamGroup[];
}

const safeFile = (name: string) =>
  (name || 'Ticket').replace(/[^a-zA-Z0-9 ]/g, '_').replace(/\s+/g, '_');

/**
 * Every ticket belonging to an organisation the signed-in user is the primary
 * contact for — the sponsor or exhibitor whose name is on the booking.
 *
 * The portal's own ticket query deliberately filters staff rows out (they are
 * not the user's personal registrations, and folding them into the BOGO card
 * list would misreport what the user themselves bought). That is right for
 * that list and wrong for the person actually holding the sponsorship: they
 * are the one fielding "where is my badge?" from their whole delegation, often
 * for people whose own email cannot reach them — a corporate mail filter is a
 * common reason a colleague never completes signup at all. So the team's
 * tickets get their own section here, downloadable one by one or all at once,
 * and the primary can hand them out however they like.
 *
 * Read-only on purpose. Editing the roster (fixing a wrong address, re-sending
 * an invitation) lives on the dashboard's TeamTable, which already does it;
 * duplicating those controls here would mean two places to keep correct.
 */
export default function TeamTicketsSection({ groups }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [formsById, setFormsById] = useState<Record<string, Form>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The ticket PDF needs the form (layout/branding) and global settings. Both
  // are shared across every row, so they are fetched once per distinct form
  // rather than per download.
  const formIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) for (const s of g.staff) if (s.formId) ids.add(s.formId);
    return Array.from(ids);
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, forms] = await Promise.all([
          getSettings(),
          Promise.all(formIds.map((id) => getFormById(id).catch(() => null))),
        ]);
        if (cancelled) return;
        setSettings(s);
        const map: Record<string, Form> = {};
        for (const f of forms) if (f) map[f.id] = f;
        setFormsById(map);
      } catch (err) {
        console.error('TeamTicketsSection: could not load ticket template', err);
      }
    })();
    return () => { cancelled = true; };
  }, [formIds.join(',')]);

  const downloadOne = async (s: Attendee) => {
    const form = formsById[s.formId];
    if (!settings || !form) {
      setError('Ticket template is still loading — try again in a moment.');
      return;
    }
    setBusyId(s.id);
    setError(null);
    try {
      const doc = await generateTicketPDF(s, settings, form);
      doc.save(`${safeFile(s.name)}_Ticket.pdf`);
    } catch (err: any) {
      console.error('Team ticket PDF failed', err);
      setError(err?.message || 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const downloadAll = async (group: TeamGroup) => {
    const ready = group.staff.filter((s) => !isPendingStaff(s) && formsById[s.formId]);
    if (!settings || ready.length === 0) return;
    setBusyId(`all:${group.primary.id}`);
    setError(null);
    try {
      // Saved one file at a time rather than zipped: this runs in the browser
      // with no archiver dependency, and a handful of PDFs is the realistic
      // size of a delegation. Sequential so the browser does not treat a burst
      // of saves as a popup storm.
      for (const s of ready) {
        const doc = await generateTicketPDF(s, settings, formsById[s.formId]);
        doc.save(`${safeFile(s.name)}_Ticket.pdf`);
      }
    } catch (err: any) {
      console.error('Team ticket bulk download failed', err);
      setError(err?.message || 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  if (groups.length === 0) return null;

  return (
    <div className="mt-10 space-y-8">
      {groups.map((group) => {
        const orgName =
          group.primary.companyInfo?.orgName || group.primary.name || 'Your organisation';
        const ready = group.staff.filter((s) => !isPendingStaff(s));
        const pending = group.staff.filter(isPendingStaff);
        const bulkBusy = busyId === `all:${group.primary.id}`;

        return (
          <section key={group.primary.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold text-slate-900">{orgName} — team tickets</h2>
              {ready.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadAll(group)}
                  disabled={bulkBusy || !settings}
                  className="text-sm font-medium text-slate-700 underline hover:text-slate-900 disabled:opacity-50"
                >
                  {bulkBusy ? 'Downloading…' : `Download all (${ready.length})`}
                </button>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-4">
              You are the primary contact for this booking, so every pass under it appears here.
            </p>

            {error && (
              <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>
            )}

            <div className="space-y-3">
              {ready.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap gap-4 items-center"
                >
                  <div className="flex-shrink-0 p-2 bg-white border border-slate-200 rounded-lg">
                    {s.qrPayload
                      ? <QRCode value={s.qrPayload} size={72} />
                      : <div className="w-[72px] h-[72px] grid place-items-center text-[10px] text-slate-400 text-center">No QR</div>}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold text-slate-900">{s.name || 'Unnamed'}</p>
                    <p className="text-sm text-slate-600">{staffPassLabel(s)}</p>
                    {s.email && <p className="text-xs text-slate-500 mt-0.5">{s.email}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadOne(s)}
                    disabled={busyId === s.id || !settings || !formsById[s.formId]}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === s.id ? 'Preparing…' : 'Download ticket'}
                  </button>
                </div>
              ))}

              {pending.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 flex flex-wrap gap-3 items-center"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-slate-700">{s.name || s.email || 'Unnamed seat'}</p>
                    <p className="text-xs text-slate-500">
                      Hasn’t completed their details yet — no ticket to download. Invite them from
                      your dashboard.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
