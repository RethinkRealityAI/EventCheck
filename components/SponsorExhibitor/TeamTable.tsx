import React, { useMemo, useState } from 'react';
import type { Attendee, Profile } from '../../types';
import { GlassCard } from '../Portal/ui/GlassCard';
import { ViscousButton } from '../Portal/ui/ViscousButton';
import { CredentialBadgeModal } from '../Portal/Dashboard/CredentialBadgeModal';
import { generateTicketPDF } from '../../utils/pdfGenerator';
import { getFormById, getSettings } from '../../services/storageService';

interface Props {
  primary: Attendee;
  staff: Attendee[];
  onFillIn?: (
    id: string,
    patch: { name: string; email: string; category: string }
  ) => Promise<void>;
}

const categoryLabel = (s: Attendee): string => {
  const c = (s.answers as any)?.staffCategory;
  return c === 'hall_only' ? 'Hall-Only'
    : c === 'full_access' ? 'Full Congress'
    : '—';
};

const isPending = (s: Attendee) =>
  s.guestType === 'staff-pending' || s.guestType === 'exhibitor-staff-pending';

/**
 * Portal-side read + light-edit view of an org's staff roster.
 *
 * Pending rows get a "Copy invitation link" action plus an inline "Fill in"
 * form so the primary can correct a wrong email without bouncing through the
 * full registration flow.
 *
 * Registered rows get a "View ticket" modal (reuses `CredentialBadgeModal`
 * with a synthetic `Profile` built from the primary's `companyInfo` — staff
 * don't have portal accounts) plus a PDF download.
 */
export default function TeamTable({ primary, staff, onFillIn }: Props) {
  const [viewQrId, setViewQrId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', email: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const orgName = primary.companyInfo?.orgName || '';

  // Build a synthetic Profile for CredentialBadgeModal. Staff don't have
  // portal accounts, so we stub the fields the modal reads.
  const qrAttendee = useMemo(
    () => (viewQrId ? staff.find((s) => s.id === viewQrId) ?? null : null),
    [viewQrId, staff]
  );
  const syntheticProfile: Profile | null = useMemo(() => {
    if (!qrAttendee) return null;
    return {
      id: qrAttendee.id,
      email: qrAttendee.email || '',
      fullName: qrAttendee.name || null,
      role: (primary.exhibitorBoothType ? 'exhibitor' : 'sponsor') as Profile['role'],
      organization: orgName || null,
      countryCode: null,
      phone: null,
      avatarUrl: null,
      adminPermissions: null,
      createdAt: qrAttendee.registeredAt || new Date().toISOString(),
      updatedAt: qrAttendee.registeredAt || new Date().toISOString(),
    };
  }, [qrAttendee, primary.exhibitorBoothType, orgName]);

  // Build the public registration link for a staff member. MUST be
  // `/#/form/<formId>?ref=<id>` so PublicRegistration's pending-claim
  // handler can pre-fill the staff member's name/email/category. Pointing
  // at `/` would land them on the GANSID portal Landing/signup page.
  const copy = (s: Attendee) => {
    if (!s.formId) {
      console.warn('Cannot copy staff invitation link — staff attendee has no formId', { id: s.id });
      return;
    }
    const url = `${window.location.origin}/#/form/${s.formId}?ref=${s.id}`;
    navigator.clipboard.writeText(url);
  };

  const download = async (s: Attendee) => {
    setDownloadingId(s.id);
    setDownloadError(null);
    try {
      const [form, settings] = await Promise.all([
        getFormById(s.formId),
        getSettings(),
      ]);
      if (!form || !settings) throw new Error('Ticket template unavailable');
      const doc = await generateTicketPDF(s, settings, form);
      const safeName = (s.name || 'Staff').replace(/[^a-zA-Z0-9 ]/g, '_').replace(/\s+/g, '_');
      doc.save(`${safeName}_Ticket.pdf`);
    } catch (err: any) {
      console.error('Staff ticket PDF download failed', err);
      setDownloadError(err?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  if (staff.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="font-display text-lg mb-2">Your Team</h3>
        <p className="text-sm text-gansid-on-surface/70">
          No staff added yet. Add them from your registration submission.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg">Your Team</h3>
        {orgName && (
          <span className="text-xs text-gansid-on-surface/60">{orgName}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gansid-on-surface/60 uppercase">
            <tr>
              <th className="py-2 pr-3">Name</th>
              <th className="pr-3">Email</th>
              <th className="pr-3">Category</th>
              <th className="pr-3">Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const pending = isPending(s);
              const editing = editId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <tr className="border-t border-gansid-on-surface/10 align-top">
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="pr-3">{s.email || '—'}</td>
                    <td className="pr-3">{categoryLabel(s)}</td>
                    <td className="pr-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          pending
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {pending ? 'Pending' : 'Registered'}
                      </span>
                    </td>
                    <td className="space-x-2 whitespace-nowrap">
                      {pending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => copy(s)}
                            className="text-xs text-gansid-primary underline"
                          >
                            Copy link
                          </button>
                          {onFillIn && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(s.id);
                                setEdit({
                                  name: s.name,
                                  email: s.email || '',
                                  category:
                                    (s.answers as any)?.staffCategory || '',
                                });
                              }}
                              className="text-xs text-gansid-secondary underline"
                            >
                              Fill in
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setViewQrId(s.id)}
                            className="text-xs text-gansid-primary underline"
                          >
                            View ticket
                          </button>
                          <button
                            type="button"
                            onClick={() => download(s)}
                            disabled={downloadingId === s.id}
                            className="text-xs text-gansid-secondary underline disabled:opacity-50"
                          >
                            {downloadingId === s.id
                              ? 'Preparing…'
                              : 'Download PDF'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {editing && (
                    <tr className="border-t border-gansid-on-surface/10 bg-gansid-surface/50">
                      <td colSpan={5} className="p-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            className="border rounded px-2 py-1"
                            placeholder="Name"
                            value={edit.name}
                            onChange={(e) =>
                              setEdit({ ...edit, name: e.target.value })
                            }
                          />
                          <input
                            className="border rounded px-2 py-1"
                            placeholder="Email"
                            type="email"
                            value={edit.email}
                            onChange={(e) =>
                              setEdit({ ...edit, email: e.target.value })
                            }
                          />
                          <select
                            className="border rounded px-2 py-1"
                            value={edit.category}
                            onChange={(e) =>
                              setEdit({ ...edit, category: e.target.value })
                            }
                          >
                            <option value="">Category…</option>
                            <option value="hall_only">Hall-Only</option>
                            <option value="full_access">Full Congress</option>
                          </select>
                        </div>
                        <div className="mt-2 flex gap-2 justify-end">
                          <ViscousButton
                            variant="secondary"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </ViscousButton>
                          <ViscousButton
                            variant="primary"
                            disabled={
                              saving ||
                              !edit.name ||
                              !edit.email ||
                              !edit.category
                            }
                            onClick={async () => {
                              if (!onFillIn) return;
                              setSaving(true);
                              try {
                                await onFillIn(s.id, edit);
                                setEditId(null);
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            {saving ? 'Saving…' : 'Save & Re-Send Invite'}
                          </ViscousButton>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {downloadError && (
        <p className="mt-2 text-xs text-gansid-primary">{downloadError}</p>
      )}

      {qrAttendee && syntheticProfile && (
        <CredentialBadgeModal
          open={true}
          onClose={() => setViewQrId(null)}
          profile={syntheticProfile}
          attendee={qrAttendee}
        />
      )}
    </GlassCard>
  );
}
