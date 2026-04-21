// components/Exhibitor/ExhibitorsTab.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Mail, Check } from 'lucide-react';
import type { Attendee, Form } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import { getBoothType } from '../../config/formTemplates/boothTypes';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendees: Attendee[];
  forms: Form[];
  onRefresh?: () => void;
}

export default function ExhibitorsTab({ attendees, forms, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { showNotification } = useNotifications();

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

  if (orgs.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl">
        No exhibitor registrations yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="w-8"></th>
            <th className="px-3 py-2">Organization</th>
            <th className="px-3 py-2">Tier / Booth</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Staff Progress</th>
            <th className="px-3 py-2">Registered</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map(org => {
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
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {org.registeredAt ? new Date(org.registeredAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="p-3 bg-slate-50">
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
    const url = `${window.location.origin}/#/form/${staff.formId}?ref=${staff.id}`;
    navigator.clipboard.writeText(url);
    showNotification('Link copied to clipboard', 'success');
  };

  const resend = async () => {
    await supabase.functions.invoke('send-ticket-email', {
      body: { mode: inviteMode, attendeeId: staff.id, origin: window.location.origin },
    });
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
