import React, { useMemo, useState } from 'react';
import type { Attendee, Profile } from '../../types';
import { GlassCard } from '../Portal/ui/GlassCard';
import { CredentialBadgeModal } from '../Portal/Dashboard/CredentialBadgeModal';
import { generateTicketPDF } from '../../utils/pdfGenerator';
import { getFormById, getSettings } from '../../services/storageService';
import {
  isPendingStaff,
  staffPassLabel,
  seatUsage,
  CATEGORY_LABELS,
  seatRemovalBlocker,
  type StaffCategory,
} from '../../utils/teamTickets';

interface Props {
  primary: Attendee;
  staff: Attendee[];
  onFillIn?: (
    id: string,
    patch: { name: string; email: string; category: string }
  ) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

const initialsOf = (name: string): string =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

// ── Buttons ────────────────────────────────────────────────────────────────
// One place for the button shapes. Previously every action was an underlined
// text link, so "Remove" and "Download PDF" looked identical and nothing said
// which was the thing you normally want — the reason this table read as a wall
// of blue words.
const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-gansid-secondary';
const BTN_PRIMARY = `${BTN_BASE} bg-gansid-secondary text-white hover:bg-[#1a4880]`;
const BTN_QUIET = `${BTN_BASE} border border-gansid-on-surface/15 bg-white/70 text-gansid-on-surface hover:bg-white`;
const BTN_GHOST = `${BTN_BASE} text-gansid-on-surface/70 hover:bg-gansid-on-surface/5 hover:text-gansid-on-surface`;
const BTN_DANGER = `${BTN_BASE} text-red-700 hover:bg-red-50`;
const BTN_DANGER_SOLID = `${BTN_BASE} bg-red-600 text-white hover:bg-red-700`;

/**
 * An organisation's staff roster, as the primary contact manages it.
 *
 * Every seat here is a real congress pass, so the actions are deliberately
 * ranked: viewing a ticket is the common case and looks like the main button,
 * editing is quiet, and removing someone is the only thing tinted red and the
 * only thing that asks twice.
 *
 * Seats are finite. The tier or booth grants a fixed number of Hall-Only and
 * Full Congress places, and the counter at the top is the honest version of
 * that: when a category is full, its option is disabled with the reason shown
 * rather than failing on save. Freeing a seat means removing someone — which
 * is exactly why Remove lives beside it.
 */
export default function TeamTable({ primary, staff, onFillIn, onRemove }: Props) {
  const [viewQrId, setViewQrId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', email: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orgName = primary.companyInfo?.orgName || '';
  const usage = useMemo(() => seatUsage(primary, staff), [primary, staff]);

  // Seat counts for the row being edited, excluding that row — so re-saving
  // someone in their current category is never blocked by their own seat.
  const usageForEdit = useMemo(
    () => (editId ? seatUsage(primary, staff, { excludeId: editId }) : null),
    [primary, staff, editId]
  );

  const qrAttendee = useMemo(
    () => (viewQrId ? staff.find((s) => s.id === viewQrId) ?? null : null),
    [viewQrId, staff]
  );
  // Staff don't have portal accounts, so the badge modal gets a synthetic
  // Profile built from the org's details.
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

  // MUST be `/#/form/<formId>?ref=<id>` so PublicRegistration's pending-claim
  // handler pre-fills their details. `/` would land them on portal signup.
  const copy = async (s: Attendee) => {
    if (!s.formId) {
      setError('This seat has no registration form attached — contact the organisers.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/#/form/${s.formId}?ref=${s.id}`);
      setNotice(`Invitation link for ${s.name || 'this seat'} copied.`);
      setError(null);
    } catch {
      setError('Your browser blocked the copy. Select the link manually instead.');
    }
  };

  const download = async (s: Attendee) => {
    setDownloadingId(s.id);
    setError(null);
    try {
      const [form, settings] = await Promise.all([getFormById(s.formId), getSettings()]);
      if (!form || !settings) throw new Error('Ticket template unavailable');
      const doc = await generateTicketPDF(s, settings, form);
      const safeName = (s.name || 'Staff').replace(/[^a-zA-Z0-9 ]/g, '_').replace(/\s+/g, '_');
      doc.save(`${safeName}_Ticket.pdf`);
    } catch (err: any) {
      console.error('Staff ticket PDF download failed', err);
      setError(err?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const beginEdit = (s: Attendee) => {
    setError(null);
    setNotice(null);
    setConfirmRemoveId(null);
    setEditId(s.id);
    setEdit({
      name: s.name || '',
      email: s.email || '',
      category: (s.answers as any)?.staffCategory || '',
    });
  };

  const save = async (s: Attendee) => {
    if (!onFillIn) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onFillIn(s.id, edit);
      setEditId(null);
      setNotice(
        isPendingStaff(s)
          ? `Saved. Invitation re-sent to ${edit.email}.`
          : `Saved. Updated ticket sent to ${edit.email}.`
      );
    } catch (err: any) {
      // Previously a try/finally with no catch: a rejected save closed nothing
      // and said nothing, so a quota refusal or a failed send looked like a
      // button that simply did not work.
      console.error('Staff roster save failed', err);
      setError(err?.message || 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Attendee) => {
    if (!onRemove) return;
    setRemovingId(s.id);
    setError(null);
    setNotice(null);
    try {
      await onRemove(s.id);
      setConfirmRemoveId(null);
      setNotice(`${s.name || 'That seat'} was removed. The seat is free again.`);
    } catch (err: any) {
      console.error('Staff removal failed', err);
      setError(err?.message || 'Could not remove that person.');
    } finally {
      setRemovingId(null);
    }
  };

  if (staff.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="font-display text-lg mb-2">Your team</h3>
        <p className="text-sm text-gansid-on-surface/70">
          No staff added yet. Add them from your registration submission.
        </p>
      </GlassCard>
    );
  }

  const categoryOptions: StaffCategory[] = ['hall_only', 'full_access'];

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-1">
        <div>
          <h3 className="font-display text-lg leading-tight">Your team</h3>
          {orgName && <p className="text-xs text-gansid-on-surface/60 mt-0.5">{orgName}</p>}
        </div>
        {/* Seat meter. Sponsors ask "how many have I got left?" constantly, and
            the answer used to require counting the rows by hand. */}
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((c) => {
            const used = usage.used[c];
            const total = usage.quota[c];
            if (total === 0 && used === 0) return null;
            const full = used >= total;
            return (
              <span
                key={c}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                  full
                    ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                    : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                }`}
                title={full ? `All ${total} ${CATEGORY_LABELS[c]} seats are taken` : undefined}
              >
                {CATEGORY_LABELS[c]} {used}/{total}
              </span>
            );
          })}
        </div>
      </div>

      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            error
              ? 'bg-red-50 text-red-800 ring-1 ring-red-200'
              : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          }`}
        >
          {error || notice}
        </div>
      )}

      <ul className="mt-4 space-y-2.5">
        {staff.map((s) => {
          const pending = isPendingStaff(s);
          const editing = editId === s.id;
          const confirming = confirmRemoveId === s.id;

          return (
            <li
              key={s.id}
              className="rounded-xl border border-gansid-on-surface/10 bg-white/60 backdrop-blur-sm px-3.5 py-3"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  aria-hidden="true"
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    pending
                      ? 'bg-gansid-on-surface/10 text-gansid-on-surface/50'
                      : 'bg-gansid-secondary/10 text-gansid-secondary'
                  }`}
                >
                  {initialsOf(s.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-gansid-on-surface truncate">
                      {s.name || 'Unnamed seat'}
                    </span>
                    <span className="rounded-full bg-gansid-on-surface/5 px-2 py-0.5 text-[10px] font-semibold text-gansid-on-surface/70">
                      {staffPassLabel(s)}
                    </span>
                    {pending && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Awaiting their details
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gansid-on-surface/60 truncate">{s.email || 'No email yet'}</p>
                </div>

                {!editing && !confirming && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pending ? (
                      <button type="button" onClick={() => copy(s)} className={BTN_PRIMARY}>
                        Copy invite link
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setViewQrId(s.id)} className={BTN_PRIMARY}>
                          Ticket
                        </button>
                        <button
                          type="button"
                          onClick={() => download(s)}
                          disabled={downloadingId === s.id}
                          className={BTN_QUIET}
                        >
                          {downloadingId === s.id ? 'Preparing…' : 'PDF'}
                        </button>
                      </>
                    )}
                    {onFillIn && (
                      <button type="button" onClick={() => beginEdit(s)} className={BTN_GHOST}>
                        Edit
                      </button>
                    )}
                    {/* Removing someone who has already arrived would delete
                        the only record that they did. The organisers can, from
                        the admin side; the sponsor cannot. */}
                    {onRemove && !seatRemovalBlocker({ checkedInAt: s.checkedInAt }) && (
                      <button
                        type="button"
                        onClick={() => { setConfirmRemoveId(s.id); setError(null); setNotice(null); }}
                        className={BTN_DANGER}
                      >
                        Remove
                      </button>
                    )}
                    {s.checkedInAt && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Checked in
                      </span>
                    )}
                  </div>
                )}

                {confirming && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gansid-on-surface/80">
                      Remove {s.name || 'this seat'}? Their pass stops working.
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={removingId === s.id}
                      className={BTN_DANGER_SOLID}
                    >
                      {removingId === s.id ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(null)}
                      className={BTN_GHOST}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {editing && (
                <div className="mt-3 border-t border-gansid-on-surface/10 pt-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-gansid-on-surface/70">Name</span>
                      <input
                        value={edit.name}
                        onChange={(e) => setEdit((v) => ({ ...v, name: e.target.value }))}
                        className="w-full rounded-lg border border-gansid-on-surface/15 bg-white px-2.5 py-1.5 text-sm focus:border-gansid-secondary focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-gansid-on-surface/70">Email</span>
                      <input
                        type="email"
                        value={edit.email}
                        onChange={(e) => setEdit((v) => ({ ...v, email: e.target.value }))}
                        className="w-full rounded-lg border border-gansid-on-surface/15 bg-white px-2.5 py-1.5 text-sm focus:border-gansid-secondary focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-gansid-on-surface/70">Pass type</span>
                      <select
                        value={edit.category}
                        onChange={(e) => setEdit((v) => ({ ...v, category: e.target.value }))}
                        className="w-full rounded-lg border border-gansid-on-surface/15 bg-white px-2.5 py-1.5 text-sm focus:border-gansid-secondary focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {categoryOptions.map((c) => {
                          // Excluding this seat from the count, is there room?
                          // Disabling here means the sponsor sees the limit
                          // before saving rather than after being refused.
                          const free = usageForEdit ? usageForEdit.quota[c] - usageForEdit.used[c] : 1;
                          const isCurrent = edit.category === c;
                          const disabled = free <= 0 && !isCurrent;
                          return (
                            <option key={c} value={c} disabled={disabled}>
                              {CATEGORY_LABELS[c]}
                              {disabled ? ' — no seats left' : free > 0 ? ` — ${free} left` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-gansid-on-surface/55">
                    {pending
                      ? 'Saving re-sends their invitation to complete their own details.'
                      : 'Saving emails them an updated ticket. Changing the address moves the ticket to that person.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      disabled={saving || !edit.name.trim() || !edit.email.trim() || !edit.category}
                      onClick={() => save(s)}
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      disabled={saving}
                      onClick={() => { setEditId(null); setError(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {qrAttendee && syntheticProfile && (
        <CredentialBadgeModal
          open
          profile={syntheticProfile}
          attendee={qrAttendee}
          onClose={() => setViewQrId(null)}
        />
      )}
    </GlassCard>
  );
}
