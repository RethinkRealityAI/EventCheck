// components/Exhibitor/ExhibitorsTab.tsx
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Copy, Mail, Check } from 'lucide-react';
import type { Attendee, Form } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import { getBoothType } from '../../config/formTemplates/boothTypes';
import { useNotifications } from '../NotificationSystem';
import { getPendingSponsorExhibitorAccounts, type PendingOrgAccount } from '../../services/storageService';

interface Props {
  attendees: Attendee[];
  forms: Form[];
  onRefresh?: () => void;
  /** Shared page size from the dashboard's overhead control — same value
   *  used by every other tab, so switching tabs doesn't change page size. */
  itemsPerPage: number;
}

export default function ExhibitorsTab({ attendees, forms, onRefresh, itemsPerPage }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const { showNotification } = useNotifications();

  // Organisations that created a sponsor/exhibitor account but never submitted
  // the form. They have no attendee row, so the list below can't show them —
  // and they were previously invisible everywhere in the dashboard.
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrgAccount[]>([]);
  const [showPending, setShowPending] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getPendingSponsorExhibitorAccounts()
      .then(rows => { if (!cancelled) setPendingOrgs(rows); })
      .catch(() => { /* non-critical panel — never break the tab */ });
    return () => { cancelled = true; };
  }, [attendees.length]);

  // Rendered in BOTH the populated and empty states — on a tenant where no
  // exhibitor has completed the form yet, the empty state is exactly where
  // these accounts most need to be visible.
  const pendingPanel = pendingOrgs.length === 0 ? null : (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <button
        type="button"
        onClick={() => setShowPending(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-amber-900">
          {pendingOrgs.length} account{pendingOrgs.length === 1 ? '' : 's'} signed up but haven’t submitted the form
        </span>
        {showPending ? <ChevronDown className="w-4 h-4 text-amber-700" /> : <ChevronRight className="w-4 h-4 text-amber-700" />}
      </button>
      {showPending && (
        <>
          <p className="text-xs text-amber-800/80 mt-1 mb-2">
            These created a sponsor/exhibitor account but have no registration yet, so they don’t appear in the list below.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-amber-900/70 uppercase">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Organization</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Progress</th>
                  <th className="px-2 py-1">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrgs.map(o => (
                  <tr key={o.userId} className="border-t border-amber-200/60">
                    <td className="px-2 py-1.5 font-medium text-slate-800">{o.fullName || '—'}</td>
                    <td className="px-2 py-1.5">
                      <a href={`mailto:${o.email}`} className="text-amber-900 underline">{o.email}</a>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{o.organization || '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className="px-1.5 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800 font-semibold uppercase text-[10px]">
                        {o.role}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {o.hasDraft
                        ? <span className="text-amber-800 font-medium">Started, not finished</span>
                        : <span className="text-slate-500">Never started</span>}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {o.signupDate ? new Date(o.signupDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  // Include both legacy exhibitor forms AND combined sponsor_exhibitor forms.
  // Primaries on sponsor_exhibitor forms always carry either `exhibitorBoothType`
  // (booth selected) or `sponsorTier` (sponsor-only) — we render them here when
  // they have a booth; sponsor-only combined primaries appear under the Sponsors tab.
  const exhibitorForms = forms.filter(f => {
    const t = (f as any).formType;
    return t === 'exhibitor' || t === 'sponsor_exhibitor';
  });
  const exhibitorFormIds = new Set(exhibitorForms.map(f => f.id));

  // Primary attendees on exhibitor / combined forms = the exhibitor org contacts.
  // For sponsor_exhibitor, only include rows that actually booked a booth.
  const orgs = attendees.filter(a => {
    if (!exhibitorFormIds.has(a.formId)) return false;
    if (a.isPrimary === false) return false;
    if (a.primaryAttendeeId) return false;
    const form = exhibitorForms.find(f => f.id === a.formId);
    if (form && (form as any).formType === 'sponsor_exhibitor') {
      // Combined form primaries belong in this tab only when a booth is selected.
      return Boolean(a.exhibitorBoothType);
    }
    return true;
  });

  // For each org, its staff = attendees whose primaryAttendeeId points at it
  const staffByOrg = new Map<string, Attendee[]>();
  for (const a of attendees) {
    const pid = a.primaryAttendeeId;
    if (pid) {
      const arr = staffByOrg.get(pid) ?? [];
      arr.push(a);
      staffByOrg.set(pid, arr);
    }
  }

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const totalPages = Math.max(1, Math.ceil(orgs.length / itemsPerPage));
  useEffect(() => { setPage(1); }, [itemsPerPage, orgs.length]);
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const pagedOrgs = orgs.slice(startIndex, startIndex + itemsPerPage);

  if (orgs.length === 0) {
    return (
      <div className="space-y-4">
        {pendingPanel}
        <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl">
          No exhibitor registrations yet.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {pendingPanel}
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="w-8"></th>
            <th className="px-3 py-2">Organization</th>
            <th className="px-3 py-2">Tier / Booth</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Staff Progress</th>
            <th className="px-3 py-2">Extras</th>
            <th className="px-3 py-2">Registered</th>
          </tr>
        </thead>
        <tbody>
          {pagedOrgs.map(org => {
            const info = (org.companyInfo ?? {}) as any;
            const tier = getExhibitorTier(info.tier);
            const booth = org.exhibitorBoothType ? getBoothType(org.exhibitorBoothType) : undefined;
            const staff = staffByOrg.get(org.id) ?? [];
            // Support both legacy (`exhibitor_staff_category`) and combined-form
            // (`staffCategory`) answer keys. Both use `hall_only` for Hall-Only;
            // Full Congress is `full_access` (combined form) or `full_congress`
            // (legacy) — treat them as the same bucket for the Staff Progress
            // summary.
            const staffCat = (s: Attendee): string | undefined => {
              const a: any = s.answers ?? {};
              return a.staffCategory ?? a.exhibitor_staff_category;
            };
            const hallStaff = staff.filter(s => staffCat(s) === 'hall_only');
            const fullStaff = staff.filter(s => {
              const c = staffCat(s);
              return c === 'full_access' || c === 'full_congress';
            });
            const paidExtras = staff.filter(s => s.isPaidExtra === true);
            const isExpanded = expanded.has(org.id);
            const tierOrBoothLabel = org.exhibitorBoothType
              ? (booth?.label ?? org.exhibitorBoothType)
              : (tier?.name ?? info.tier ?? '—');
            // Use booth quotas when present; otherwise fall back to legacy tier quotas.
            const hallQuota = booth?.hallOnlyQuota ?? tier?.hallOnlyQuota;
            const fullQuota = booth?.fullAccessQuota ?? tier?.fullCongressQuota;
            return (
              <React.Fragment key={org.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <button onClick={() => toggleExpand(org.id)} className="p-1 hover:bg-slate-100 rounded">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium">{info.orgName || org.name}</td>
                  <td className="px-3 py-2">{tierOrBoothLabel}</td>
                  <td className="px-3 py-2 text-slate-600">{org.email}</td>
                  <td className="px-3 py-2 text-xs">
                    {hallQuota !== undefined && fullQuota !== undefined
                      ? `${hallStaff.length}/${hallQuota} Hall · ${fullStaff.length}/${fullQuota} Full`
                      : `${staff.length} staff`}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {paidExtras.length > 0 ? (
                      <span
                        className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold"
                        title={`${paidExtras.length} additional booth staff paid by card ($${paidExtras.length * 50})`}
                      >
                        +{paidExtras.length} paid
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {org.registeredAt ? new Date(org.registeredAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="p-3 bg-slate-50">
                      <StaffSection
                        title="Hall Only staff"
                        staff={hallStaff}
                        orgFormId={org.formId}
                        onRefresh={onRefresh}
                        showNotification={showNotification}
                      />
                      <StaffSection
                        title="Full Access staff"
                        staff={fullStaff}
                        orgFormId={org.formId}
                        onRefresh={onRefresh}
                        showNotification={showNotification}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white text-xs text-gray-600 border-t border-gray-100">
        <div>
          Showing {orgs.length > 0 ? startIndex + 1 : 0}–{Math.min(startIndex + itemsPerPage, orgs.length)} of {orgs.length}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1.5 rounded bg-white border border-gray-200 disabled:opacity-50 hover:bg-gray-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-gray-700">Page {safePage} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1.5 rounded bg-white border border-gray-200 disabled:opacity-50 hover:bg-gray-50"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffSection({
  title,
  staff,
  orgFormId,
  onRefresh,
  showNotification,
}: {
  title: string;
  staff: Attendee[];
  orgFormId: string;
  onRefresh?: () => void;
  showNotification: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  if (staff.length === 0) {
    return (
      <div className="mb-2">
        <div className="text-xs font-medium text-slate-500 uppercase mb-1">{title}</div>
        <div className="text-xs text-slate-400 italic">No staff in this category</div>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="text-xs font-medium text-slate-500 uppercase mb-1">{title}</div>
      <ul className="space-y-1">
        {staff.map(s => (
          <StaffRow
            key={s.id}
            staff={s}
            onRefresh={onRefresh}
            showNotification={showNotification}
          />
        ))}
      </ul>
    </div>
  );
}

function StaffRow({
  staff,
  onRefresh,
  showNotification,
}: {
  staff: Attendee;
  onRefresh?: () => void;
  showNotification: (m: string, t?: 'success' | 'error' | 'info') => void;
}) {
  const guestType = staff.guestType;
  // Pending = either legacy exhibitor-staff-pending OR combined-form staff-pending.
  const isPending = guestType === 'exhibitor-staff-pending' || guestType === 'staff-pending';
  const isClaimed = guestType === 'exhibitor-staff-claimed' || guestType === 'staff-claimed';
  // Combined-form rows use the `staff-invite` / `staff-claimed` send-ticket-email
  // mode; legacy exhibitor rows use `exhibitor-staff-invite`. Select based on
  // which guest_type family the row belongs to.
  const isCombinedFormRow = guestType === 'staff-pending' || guestType === 'staff-claimed';
  const inviteMode = isCombinedFormRow ? 'staff-invite' : 'exhibitor-staff-invite';
  const claimedGuestType = isCombinedFormRow ? 'staff-claimed' : 'exhibitor-staff-claimed';

  const copyLink = () => {
    if (!staff.formId) {
      showNotification('Cannot copy link — staff record is missing its form ID', 'error');
      return;
    }
    const url = `${window.location.origin}/#/form/${staff.formId}?ref=${staff.id}`;
    navigator.clipboard.writeText(url);
    showNotification('Link copied to clipboard', 'success');
  };

  const resend = async () => {
    const { error } = await supabase.functions.invoke('send-ticket-email', {
      body: { mode: inviteMode, attendeeId: staff.id, origin: window.location.origin },
    });
    if (error) {
      showNotification(`Failed to resend invitation: ${error.message || 'unknown error'}`, 'error');
      return;
    }
    showNotification('Invitation resent', 'success');
  };

  const markComplete = async () => {
    if (!window.confirm(`Mark ${staff.name} as completed?`)) return;
    await supabase.from('attendees').update({ guest_type: claimedGuestType }).eq('id', staff.id);
    onRefresh?.();
    showNotification('Marked as completed', 'success');
  };

  const badge = isPending
    ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs">Pending</span>
    : isClaimed
      ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs">Registered</span>
      : <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">{guestType ?? 'Unknown'}</span>;

  return (
    <li className="flex items-center gap-2 pl-4 py-1">
      <span className="text-sm">{staff.name}</span>
      <span className="text-xs text-slate-500">{staff.email}</span>
      {badge}
      {staff.isPaidExtra && (
        <span
          className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200"
          title="Paid additional booth staff ($50 USD)"
        >
          Paid extra
        </span>
      )}
      {isPending && (
        <div className="ml-auto flex gap-1">
          <button onClick={copyLink} title="Copy link" className="p-1 hover:bg-slate-200 rounded">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={resend} title="Resend" className="p-1 hover:bg-slate-200 rounded">
            <Mail className="w-3.5 h-3.5" />
          </button>
          <button onClick={markComplete} title="Mark complete" className="p-1 hover:bg-slate-200 rounded">
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}
