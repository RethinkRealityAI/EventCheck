import React, { useMemo, useState } from 'react';
import {
  Mail, Eye, ChevronDown, ChevronRight, RotateCcw, Send as SendIcon,
  Loader2, Users, UserPlus, Plus, X, Tag,
} from 'lucide-react';
import type { AppSettings, Attendee } from '../../types';
import { CURRENT_SITE } from '../../config/sites';
import { renderEmailShell, mergePlaceholders } from '../../utils/emailShell';
import RichTextEditor from '../RichTextEditor';
import { sendEmail } from '../../services/emailService';

// ---------------------------------------------------------------------------
// Template catalog — every editable template surface in one place.
// ---------------------------------------------------------------------------

interface TemplateEntry {
  key: string;
  label: string;
  group: string;
  description: string;
  subjectField: keyof AppSettings | null;
  bodyField: keyof AppSettings;
  placeholders: string[];
  /** If true, shown in all deployments. If false, portal/GANSID only. */
  global: boolean;
}

const TEMPLATES: TemplateEntry[] = [
  // Event — core
  {
    key: 'ticket',
    label: 'Ticket Confirmation (purchaser)',
    group: 'Event',
    description: 'Main confirmation email sent to the purchaser after a successful registration. Used for individual ticket purchases.',
    subjectField: 'emailSubject',
    bodyField: 'emailBodyTemplate',
    placeholders: ['name', 'event', 'id', 'invoiceId', 'amount'],
    global: true,
  },
  {
    key: 'table-purchaser',
    label: 'Table Purchaser Confirmation',
    group: 'Event',
    description: 'Sent to the buyer of a full table (e.g. 8 seats). Often references the included guest seats and instructions for sharing claim links.',
    subjectField: 'emailTablePurchaserSubject',
    bodyField: 'emailTablePurchaserBody',
    placeholders: ['name', 'event', 'id', 'invoiceId', 'amount'],
    global: true,
  },
  {
    key: 'invite',
    label: 'Invitation / Marketing',
    group: 'Event',
    description: 'Outreach email to invite a contact to register.',
    subjectField: 'emailInvitationSubject',
    bodyField: 'emailInvitationBody',
    placeholders: ['name', 'event', 'link'],
    global: true,
  },
  {
    key: 'reminder',
    label: 'Registration Reminder',
    group: 'Event',
    description: 'Nudge for portal users who started but haven\'t completed registration.',
    subjectField: 'emailReminderSubject',
    bodyField: 'emailReminderBody',
    placeholders: ['name', 'event', 'step', 'total_steps', 'resume_url', 'signup_url'],
    global: false,
  },
  {
    key: 'contact-invite',
    label: 'Contact Invitation (free register)',
    group: 'Event',
    description: 'Sent from Contacts → Invite to register. Each imported contact gets a unique, prefilled free-registration link. The body MUST keep the {{registration_link}} button — it is replaced per recipient when sent.',
    subjectField: 'emailContactInviteSubject',
    bodyField: 'emailContactInviteBody',
    placeholders: ['name', 'first_name', 'email', 'event', 'registration_link'],
    global: false,
  },
  {
    key: 'guest',
    label: 'Guest Ticket',
    group: 'Event guests',
    description: 'Sent to each named additional registrant — both static "guests" and group-mode inline registrants.',
    subjectField: 'emailGuestSubject',
    bodyField: 'emailGuestBody',
    placeholders: ['name', 'purchaser', 'event'],
    global: true,
  },
  {
    key: 'purchaser-guest-note',
    label: 'Purchaser Guest Backup Note',
    group: 'Event guests',
    description: 'Appended to the purchaser\'s email when guest tickets are included.',
    subjectField: null,
    bodyField: 'emailPurchaserGuestNote',
    placeholders: [],
    global: true,
  },
  {
    key: 'guest-claim',
    label: 'Group — Needs Details (pending-claim)',
    group: 'Event guests',
    description: 'Sent to group registrants whose details the purchaser didn\'t fill. Includes a claim link + optional portal signup.',
    subjectField: 'emailGuestClaimSubject',
    bodyField: 'emailGuestClaimBody',
    placeholders: ['name', 'purchaser', 'event', 'complete_url', 'signup_url'],
    global: false,
  },
  {
    key: 'guest-confirmed',
    label: 'Group — Details Already Filled (inline)',
    group: 'Event guests',
    description: 'Sent to group registrants when the purchaser filled their full details inline.',
    subjectField: 'emailGuestConfirmedSubject',
    bodyField: 'emailGuestConfirmedBody',
    placeholders: ['name', 'purchaser', 'event', 'registration_id', 'qr_image_url'],
    global: false,
  },
  {
    key: 'guest-completion-notify',
    label: 'Purchaser — Guest Completed Their Details',
    group: 'Event guests',
    description: 'Sent to the purchaser when one of their guests finishes claiming their seat. Heads-up only — the guest gets their own ticket separately.',
    subjectField: 'emailGuestCompletionNotifySubject',
    bodyField: 'emailGuestCompletionNotifyBody',
    placeholders: ['name', 'purchaser', 'event'],
    global: true,
  },
  // Staff (combined sponsor_exhibitor + legacy exhibitor share these)
  {
    key: 'staff-invite',
    label: 'Staff Invitation',
    group: 'Staff',
    description: 'Sent to sponsor/exhibitor staff members with a claim link to complete their registration.',
    subjectField: 'emailStaffInviteSubject',
    bodyField: 'emailStaffInviteBody',
    placeholders: ['name', 'purchaser', 'org_name', 'category', 'event', 'complete_url', 'signup_url'],
    global: false,
  },
  {
    key: 'staff-confirmed',
    label: 'Staff Confirmation',
    group: 'Staff',
    description: 'Sent to staff after they complete their registration. Delivers their QR-enabled ticket.',
    subjectField: 'emailStaffConfirmedSubject',
    bodyField: 'emailStaffConfirmedBody',
    placeholders: ['name', 'org_name', 'event'],
    global: false,
  },
  {
    key: 'exhibitor-staff-completion-notify',
    label: 'Org Contact — Staff Completed Their Details',
    group: 'Staff',
    description: 'Sent to the sponsor/exhibitor company contact when one of their staff members finishes claiming a ticket.',
    subjectField: 'emailExhibitorStaffCompletionNotifySubject',
    bodyField: 'emailExhibitorStaffCompletionNotifyBody',
    placeholders: ['name', 'contact_name', 'org_name', 'event'],
    global: false,
  },
  // BOGO (Buy-One-Get-One-Free) — sent on GANSID forms with bogoEnabled.
  // Defaults are baked into the send-ticket-email edge function, so leaving
  // these blank means "use the default copy". Filling them overrides.
  {
    key: 'bogo-ticket',
    label: 'BOGO — Free Guest Ticket',
    group: 'BOGO',
    description: 'Sent to the free guest when the payer entered their details inline at checkout OR via the portal "Send free ticket" action.',
    subjectField: 'emailBogoTicketSubject',
    bodyField: 'emailBogoTicketBody',
    placeholders: ['name', 'purchaser', 'event', 'free_category_name', 'qr_image_url', 'registration_id', 'signup_url', 'admin_contact'],
    global: false,
  },
  {
    key: 'bogo-claim-link',
    label: 'BOGO — Claim Link for Payer',
    group: 'BOGO',
    description: 'Sent to the buyer (NOT the guest) when they chose "send claim link later" — contains a forwardable claim URL.',
    subjectField: 'emailBogoClaimLinkSubject',
    bodyField: 'emailBogoClaimLinkBody',
    placeholders: ['payer_name', 'event', 'claim_url', 'portal_tickets_url', 'admin_contact'],
    global: false,
  },
  {
    key: 'bogo-ticket-updated',
    label: 'BOGO — Ticket Updated',
    group: 'BOGO',
    description: 'Sent to the free guest when the payer edited recipient details (uncommitted only). Re-attaches the QR image so prior copies should be discarded.',
    subjectField: 'emailBogoTicketUpdatedSubject',
    bodyField: 'emailBogoTicketUpdatedBody',
    placeholders: ['name', 'purchaser', 'event', 'qr_image_url', 'admin_contact'],
    global: false,
  },
  {
    key: 'bogo-ticket-withdrawn',
    label: 'BOGO — Ticket Withdrawn',
    group: 'BOGO',
    description: 'Sent to the free guest when admin deletes the paid source attendee (cascade-cancel notification).',
    subjectField: 'emailBogoTicketWithdrawnSubject',
    bodyField: 'emailBogoTicketWithdrawnBody',
    placeholders: ['name', 'purchaser', 'event', 'admin_contact'],
    global: false,
  },
  // Sponsor templates — surfaced here so admins see the full inventory of
  // emails the platform sends in one place. These same fields are also
  // editable in the Sponsors → Templates tab; both UIs write to the same
  // AppSettings rows so there's no data divergence.
  {
    key: 'sponsor-invitation',
    label: 'Sponsor Invitation',
    group: 'Sponsors',
    description: 'Outreach email inviting a contact to sponsor the event. Sent from the Sponsors → Prospects tab.',
    subjectField: 'sponsorInvitationSubject',
    bodyField: 'sponsorInvitationBody',
    placeholders: ['contactName', 'orgName', 'event', 'eventDate', 'sponsorFormLink'],
    global: true,
  },
  {
    key: 'sponsor-confirmation-paid',
    label: 'Sponsor Confirmation (Paid)',
    group: 'Sponsors',
    description: 'Confirmation receipt for sponsors paying online. Includes itemised package list and any guest claim links.',
    subjectField: 'sponsorConfirmationPaidSubject',
    bodyField: 'sponsorConfirmationPaidBody',
    placeholders: ['contactName', 'orgName', 'event', 'itemsList', 'total', 'transactionId', 'guestClaimLinks'],
    global: true,
  },
  {
    key: 'sponsor-cheque-pledge',
    label: 'Sponsor Cheque Pledge (to sponsor)',
    group: 'Sponsors',
    description: 'Sent to the sponsor when they select cheque payment. Confirms the pledge and provides the mailing address.',
    subjectField: 'sponsorChequePledgeSubject',
    bodyField: 'sponsorChequePledgeBody',
    placeholders: ['contactName', 'orgName', 'event', 'itemsList', 'total', 'mailingAddress'],
    global: true,
  },
  {
    key: 'sponsor-cheque-internal',
    label: 'Sponsor Cheque Pledge (internal alert)',
    group: 'Sponsors',
    description: 'Sent to internal recipients (sponsorChequeInternalRecipients) when a cheque pledge is submitted, so staff can follow up.',
    subjectField: 'sponsorChequeInternalSubject',
    bodyField: 'sponsorChequeInternalBody',
    placeholders: ['orgName', 'contactName', 'contactEmail', 'contactPhone', 'itemsList', 'total', 'adminDashboardLink'],
    global: true,
  },
  {
    key: 'sponsor-cheque-received',
    label: 'Sponsor Cheque Received',
    group: 'Sponsors',
    description: 'Final receipt sent to the sponsor after the cheque payment is confirmed by an admin.',
    subjectField: 'sponsorChequeReceivedSubject',
    bodyField: 'sponsorChequeReceivedBody',
    placeholders: ['contactName', 'orgName', 'event', 'itemsList', 'total'],
    global: true,
  },
];

// ---------------------------------------------------------------------------
// Preview helpers
// ---------------------------------------------------------------------------

const DEFAULT_VARS: Record<string, string> = {
  name: 'Jane Doe',
  purchaser: 'John Smith',
  event: 'GANSID Congress 2026',
  id: 'ATT-000123',
  invoiceId: 'INV-00456',
  amount: '250.00',
  step: '3',
  total_steps: '5',
  resume_url: 'https://example.com/#/form/abc?resume=1',
  signup_url: 'https://example.com/#/',
  link: 'https://example.com/#/form/abc',
  first_name: 'Jane',
  email: 'jane.doe@example.com',
  registration_link: 'https://example.com/#/form/abc?invite=demo-token',
  complete_url: 'https://example.com/#/form/abc?ref=att-123',
  org_name: 'Acme Pharmaceuticals',
  category: 'Hall-Only',
  registration_id: 'ATT-000123',
  qr_image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=demo',
  // Sponsor-specific previews
  contactName: 'Alex Morgan',
  contact_name: 'Alex Morgan',
  orgName: 'Acme Pharmaceuticals',
  eventDate: 'October 23, 2026',
  sponsorFormLink: 'https://example.com/#/sponsor',
  itemsList: '<ul><li>Gold Sponsorship — $5,000</li><li>Program Ad — $500</li></ul>',
  total: '$5,500',
  transactionId: 'pp-abc-001',
  guestClaimLinks: '',
  mailingAddress: '123 Example St,\nToronto, ON',
  contactEmail: 'alex@example.com',
  contactPhone: '+1 416 555 0100',
  adminDashboardLink: 'https://example.com/#/admin',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  settings: AppSettings;
  onSettingsChange: (field: keyof AppSettings, value: any) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, field: 'emailHeaderLogo') => void;
  uploading: boolean;
  allAttendees: Attendee[];
  dummyAttendee: Attendee | null;
  onNotify: (msg: string, level: 'success' | 'warning' | 'error' | 'info') => void;
}

export default function EmailTemplatesTab({
  settings,
  onSettingsChange,
  onFileUpload,
  uploading,
  allAttendees,
  dummyAttendee,
  onNotify,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string>('ticket');
  const [placeholdersOpen, setPlaceholdersOpen] = useState<boolean>(false);
  const [brandingOpen, setBrandingOpen] = useState<boolean>(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  // Send-test state
  const [recipientMode, setRecipientMode] = useState<'manual' | 'all' | 'specific'>('manual');
  const [manualNameInput, setManualNameInput] = useState('');
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [manualRecipients, setManualRecipients] = useState<{ name: string; email: string }[]>([]);
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');
  const [sending, setSending] = useState(false);

  const visibleTemplates = useMemo(
    () => TEMPLATES.filter(t => t.global || CURRENT_SITE.portalEnabled),
    [],
  );

  const template = visibleTemplates.find(t => t.key === selectedKey) || visibleTemplates[0];

  const subjectValue = (template.subjectField ? (settings[template.subjectField] as string) : '') || '';
  const bodyValue = (settings[template.bodyField] as string) || '';

  const defaultVars = useMemo<Record<string, string>>(() => ({
    ...DEFAULT_VARS,
    event: dummyAttendee?.formTitle || settings.pdfSettings?.eventTitle || DEFAULT_VARS.event,
    name: dummyAttendee?.name || DEFAULT_VARS.name,
    id: dummyAttendee?.id || DEFAULT_VARS.id,
    invoiceId: dummyAttendee?.invoiceId || DEFAULT_VARS.invoiceId,
    amount: String(settings.ticketPrice || DEFAULT_VARS.amount),
  }), [dummyAttendee, settings.pdfSettings?.eventTitle, settings.ticketPrice]);

  const vars = useMemo<Record<string, string>>(() => ({ ...defaultVars, ...overrides }), [defaultVars, overrides]);

  const previewHtml = useMemo(() => {
    const mergedBody = mergePlaceholders(bodyValue, vars);
    return renderEmailShell({
      content: mergedBody,
      site: CURRENT_SITE.key,
      headerImageUrl: settings.emailHeaderLogo || undefined,
      footerText: settings.emailFooterText,
      previewMode: true,
    });
  }, [bodyValue, vars, settings.emailHeaderLogo, settings.emailFooterText]);

  const resolvedSubject = useMemo(() => mergePlaceholders(subjectValue, vars), [subjectValue, vars]);

  const setOverride = (key: string, value: string) => setOverrides(prev => ({ ...prev, [key]: value }));
  const clearOverride = (key: string) =>
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // --- Send test email ---

  const addManualRecipient = () => {
    if (!manualEmailInput.includes('@')) {
      onNotify('Enter a valid email address.', 'warning');
      return;
    }
    setManualRecipients(prev => [...prev, { name: manualNameInput.trim(), email: manualEmailInput.trim() }]);
    setManualNameInput('');
    setManualEmailInput('');
  };

  const handleSend = async () => {
    if (recipientMode === 'manual' && manualRecipients.length === 0) {
      onNotify('Add at least one recipient.', 'warning');
      return;
    }
    if (recipientMode === 'specific' && !selectedAttendeeId) {
      onNotify('Pick an attendee.', 'warning');
      return;
    }
    if (!template.subjectField) {
      onNotify('This template is embedded inside another email — nothing to send standalone.', 'warning');
      return;
    }

    setSending(true);
    try {
      let targets: { email: string; name: string }[] = [];
      if (recipientMode === 'manual') {
        targets = manualRecipients.map(r => ({ email: r.email, name: r.name || 'Guest' }));
      } else if (recipientMode === 'specific') {
        const att = allAttendees.find(a => a.id === selectedAttendeeId);
        if (att) targets = [{ email: att.email, name: att.name }];
      } else {
        targets = allAttendees.map(a => ({ email: a.email, name: a.name }));
      }

      let sent = 0;
      for (const t of targets) {
        const mergedBody = mergePlaceholders(bodyValue, { ...vars, name: t.name });
        const mergedSubject = mergePlaceholders(subjectValue, { ...vars, name: t.name });
        const html = renderEmailShell({
          content: mergedBody,
          site: CURRENT_SITE.key,
          headerImageUrl: settings.emailHeaderLogo || undefined,
          footerText: settings.emailFooterText,
        });
        await sendEmail(t.email, mergedSubject, html);
        sent++;
      }
      onNotify(`Sent ${sent} test email${sent === 1 ? '' : 's'}.`, 'success');
      if (recipientMode === 'manual') setManualRecipients([]);
    } catch (e: any) {
      onNotify(`Failed to send: ${e?.message || 'unknown error'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  // --- UI ---

  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm transition';

  // Group templates for the dropdown
  const groupedOptions = useMemo(() => {
    const map = new Map<string, TemplateEntry[]>();
    for (const t of visibleTemplates) {
      const arr = map.get(t.group) || [];
      arr.push(t);
      map.set(t.group, arr);
    }
    return Array.from(map.entries());
  }, [visibleTemplates]);

  return (
    <div className="flex-1 grid grid-cols-1 xl:grid-cols-5 min-h-0">
      {/* Editor — left column, 2/5 */}
      <div className="xl:col-span-2 overflow-y-auto px-6 py-5 space-y-5 border-r border-gray-100 min-w-0">
        {/* Template picker */}
        <div>
          <label className={labelCls}>Template</label>
          <div className="relative">
            <select
              value={template.key}
              onChange={e => { setSelectedKey(e.target.value); setOverrides({}); }}
              className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer font-medium`}
            >
              {groupedOptions.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
            {template.description}
          </p>
        </div>

        {/* Subject */}
        {template.subjectField ? (
          <div>
            <label className={labelCls}>Subject Line</label>
            <input
              type="text"
              value={subjectValue}
              onChange={e => onSettingsChange(template.subjectField!, e.target.value)}
              className={inputCls}
              placeholder="Subject (supports placeholders)"
            />
          </div>
        ) : (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            This content is appended inside the purchaser's ticket email — there is no standalone subject.
          </div>
        )}

        {/* Body */}
        <div>
          <label className={labelCls}>Body (HTML)</label>
          <RichTextEditor
            value={bodyValue}
            onChange={(val) => onSettingsChange(template.bodyField, val as any)}
            className="min-h-[280px]"
            placeholder="Draft your email content here..."
          />
        </div>

        {/* Placeholder values */}
        <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white">
          <button
            type="button"
            onClick={() => setPlaceholdersOpen(o => !o)}
            className="w-full flex items-center justify-between text-left group px-4 py-3"
          >
            <div>
              <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                Placeholder values
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {template.placeholders.length === 0
                  ? 'This template has no placeholders.'
                  : 'Override the values used in the live preview.'}
              </div>
            </div>
            {placeholdersOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
            )}
          </button>

          {placeholdersOpen && template.placeholders.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              {template.placeholders.map(key => {
                const defaultValue = defaultVars[key] ?? '';
                const currentValue = vars[key] ?? '';
                const isOverridden = overrides[key] !== undefined && overrides[key] !== defaultValue;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-[120px] shrink-0">
                      <code className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${isOverridden ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-700'}`}>
                        {'{{'}{key}{'}}'}
                      </code>
                    </div>
                    <input
                      type="text"
                      value={currentValue}
                      onChange={e => setOverride(key, e.target.value)}
                      className={`flex-1 px-2 py-1.5 text-xs border rounded-md outline-none focus:ring-1 transition ${isOverridden ? 'border-indigo-300 bg-indigo-50 focus:ring-indigo-400' : 'border-gray-200 bg-white focus:ring-indigo-400 focus:border-indigo-400'}`}
                    />
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => clearOverride(key)}
                        title="Reset to default"
                        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-indigo-700 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Branding — header image + footer text */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setBrandingOpen(o => !o)}
            className="w-full flex items-center justify-between text-left group px-4 py-3"
          >
            <div>
              <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                Branding
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Header image + footer text (applied to every template on this site).
              </div>
            </div>
            {brandingOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
            )}
          </button>
          {brandingOpen && (
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className={labelCls}>Header image</label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  {settings.emailHeaderLogo ? (
                    <img src={settings.emailHeaderLogo} alt="Header" className="h-10 max-w-[140px] object-contain" />
                  ) : (
                    <div className="h-10 px-3 text-[11px] text-gray-400 border border-dashed border-gray-300 rounded flex items-center">No image — falls back to gradient brand</div>
                  )}
                  <label className="cursor-pointer text-xs font-medium text-indigo-700 hover:underline">
                    {settings.emailHeaderLogo ? 'Replace' : 'Upload'}
                    <input type="file" className="hidden" accept="image/*" onChange={e => onFileUpload(e, 'emailHeaderLogo')} />
                  </label>
                  {settings.emailHeaderLogo && (
                    <button
                      onClick={() => onSettingsChange('emailHeaderLogo', '')}
                      className="text-xs font-medium text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  Leave empty to use the {CURRENT_SITE.displayName} gradient header. Recommended 1120×260.
                </p>
              </div>
              <div>
                <label className={labelCls}>Footer text (HTML)</label>
                <textarea
                  value={settings.emailFooterText}
                  onChange={e => onSettingsChange('emailFooterText', e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="Replace the default site footer copy"
                />
              </div>
            </div>
          )}
        </div>

        {/* Send test email */}
        {template.subjectField && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
              <SendIcon className="w-4 h-4" /> Send {template.label}
            </h3>
            <div className="flex gap-2 bg-white p-1 rounded-lg border border-indigo-100">
              <button onClick={() => setRecipientMode('manual')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'manual' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                <UserPlus className="w-3 h-3 inline mr-1" /> Manual
              </button>
              <button onClick={() => setRecipientMode('specific')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'specific' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Users className="w-3 h-3 inline mr-1" /> Attendee
              </button>
              <button onClick={() => setRecipientMode('all')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Users className="w-3 h-3 inline mr-1" /> All ({allAttendees.length})
              </button>
            </div>

            {recipientMode === 'manual' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Name"
                    value={manualNameInput}
                    onChange={e => setManualNameInput(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={manualEmailInput}
                    onChange={e => setManualEmailInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addManualRecipient()}
                    className={inputCls}
                  />
                </div>
                <button onClick={addManualRecipient} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium transition">
                  <Plus className="w-3 h-3" /> Add recipient
                </button>
                {manualRecipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {manualRecipients.map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded-full text-[11px]">
                        {r.name || r.email}
                        <button onClick={() => setManualRecipients(prev => prev.filter((_, ix) => ix !== i))} className="hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {recipientMode === 'specific' && (
              <select
                value={selectedAttendeeId}
                onChange={e => setSelectedAttendeeId(e.target.value)}
                className={`${inputCls} bg-white`}
              >
                <option value="">Select an attendee…</option>
                {allAttendees.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                ))}
              </select>
            )}

            {recipientMode === 'all' && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                This will email every one of the {allAttendees.length} registered attendees. Double-check the preview first.
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending}
              className={`w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition ${sending ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'}`}
            >
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><SendIcon className="w-4 h-4" /> Send</>}
            </button>
          </div>
        )}
      </div>

      {/* Live preview — right column, 3/5 */}
      <div className="xl:col-span-3 bg-gray-100 flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Live preview
          </div>
          <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={resolvedSubject}>
            {template.subjectField ? (
              <>Subject: <span className="font-medium text-gray-700">{resolvedSubject || <em className="text-gray-400">(empty)</em>}</span></>
            ) : (
              <em className="text-gray-400">Embedded content (no subject)</em>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            sandbox=""
            scrolling="no"
            className="w-full h-full bg-white border-0 block"
          />
        </div>
      </div>
    </div>
  );
}
