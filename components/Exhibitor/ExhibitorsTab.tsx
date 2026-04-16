// components/Exhibitor/ExhibitorsTab.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Mail, Check } from 'lucide-react';
import type { Attendee, Form } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendees: Attendee[];
  forms: Form[];
  onRefresh?: () => void;
}

export default function ExhibitorsTab({ attendees, forms, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { showNotification } = useNotifications();

  const exhibitorForms = forms.filter(f => (f as any).formType === 'exhibitor');
  const exhibitorFormIds = new Set(exhibitorForms.map(f => f.id));

  // Primary attendees on exhibitor forms = the exhibitor org contacts
  const orgs = attendees.filter(a =>
    exhibitorFormIds.has(a.formId) && a.isPrimary !== false && !a.primaryAttendeeId
  );

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
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Staff Progress</th>
            <th className="px-3 py-2">Registered</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map(org => {
            const info = (org.companyInfo ?? {}) as any;
            const tier = getExhibitorTier(info.tier);
            const staff = staffByOrg.get(org.id) ?? [];
            const hallStaff = staff.filter(s => (s.answers?.exhibitor_staff_category) === 'hall_only');
            const fullStaff = staff.filter(s => (s.answers?.exhibitor_staff_category) === 'full_congress');
            const isExpanded = expanded.has(org.id);
            return (
              <React.Fragment key={org.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <button onClick={() => toggleExpand(org.id)} className="p-1 hover:bg-slate-100 rounded">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium">{info.orgName || org.name}</td>
                  <td className="px-3 py-2">{tier?.name ?? info.tier}</td>
                  <td className="px-3 py-2 text-slate-600">{org.email}</td>
                  <td className="px-3 py-2 text-xs">
                    {tier
                      ? `${hallStaff.length}/${tier.hallOnlyQuota} Hall · ${fullStaff.length}/${tier.fullCongressQuota} Full`
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
                        title="Full Congress staff"
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
  const isPending = guestType === 'exhibitor-staff-pending';

  const copyLink = () => {
    const url = `${window.location.origin}/#/form/${staff.formId}?ref=${staff.id}`;
    navigator.clipboard.writeText(url);
    showNotification('Link copied to clipboard', 'success');
  };

  const resend = async () => {
    await supabase.functions.invoke('send-ticket-email', {
      body: { mode: 'exhibitor-staff-invite', attendeeId: staff.id, origin: window.location.origin },
    });
    showNotification('Invitation resent', 'success');
  };

  const markComplete = async () => {
    if (!window.confirm(`Mark ${staff.name} as completed?`)) return;
    await supabase.from('attendees').update({ guest_type: 'exhibitor-staff-claimed' }).eq('id', staff.id);
    onRefresh?.();
    showNotification('Marked as completed', 'success');
  };

  const badge = guestType === 'exhibitor-staff-pending'
    ? <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900 text-xs">Pending</span>
    : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-900 text-xs">Completed</span>;

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
