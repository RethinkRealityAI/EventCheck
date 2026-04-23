import React, { useMemo, useState } from 'react';
import { AppSettings } from '../../types';
import { Save, ChevronDown, Eye, RotateCcw, ChevronRight } from 'lucide-react';
import { saveSettings } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';
import { CURRENT_SITE } from '../../config/sites';
import { renderEmailShell, mergePlaceholders } from '../../utils/emailShell';

interface Props {
  settings: AppSettings;
  onSaved: () => void | Promise<void>;
}

interface SponsorTemplate {
  subjectKey: keyof AppSettings;
  bodyKey: keyof AppSettings;
  title: string;
  description: string;
  placeholders: string[];
}

const TEMPLATES: SponsorTemplate[] = [
  {
    subjectKey: 'sponsorInvitationSubject',
    bodyKey: 'sponsorInvitationBody',
    title: 'Sponsor Invitation',
    description: 'Outreach email sent to prospect organizations before they register.',
    placeholders: ['orgName', 'contactName', 'event', 'eventDate', 'sponsorFormLink'],
  },
  {
    subjectKey: 'sponsorConfirmationPaidSubject',
    bodyKey: 'sponsorConfirmationPaidBody',
    title: 'Sponsor Confirmation (Paid)',
    description: 'Sent after a successful PayPal capture. Includes itemized receipt + guest claim links.',
    placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'transactionId', 'event', 'guestClaimLinks'],
  },
  {
    subjectKey: 'sponsorChequePledgeSubject',
    bodyKey: 'sponsorChequePledgeBody',
    title: 'Sponsor Cheque Pledge',
    description: 'Sent when a sponsor opts to pay by cheque. Waiting for cheque to arrive.',
    placeholders: ['orgName', 'contactName', 'itemsList', 'total', 'mailingAddress', 'event'],
  },
  {
    subjectKey: 'sponsorChequeInternalSubject',
    bodyKey: 'sponsorChequeInternalBody',
    title: 'Cheque Notification (internal)',
    description: 'Sent to the admin team when a sponsor submits a cheque pledge.',
    placeholders: ['orgName', 'contactName', 'contactEmail', 'contactPhone', 'itemsList', 'total', 'adminDashboardLink'],
  },
  {
    subjectKey: 'sponsorChequeReceivedSubject',
    bodyKey: 'sponsorChequeReceivedBody',
    title: 'Cheque Received Confirmation',
    description: 'Sent after admin marks cheque received. Final paid receipt + guest tickets.',
    placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'event'],
  },
];

const DEFAULT_VARS: Record<string, string> = {
  orgName: 'Acme Pharmaceuticals Ltd.',
  contactName: 'Dr. Jane Smith',
  contactEmail: 'jane@acme-pharma.com',
  contactPhone: '+1 (416) 555-1234',
  event: 'GANSID Congress 2026',
  eventDate: 'October 23–25, 2026',
  sponsorFormLink: 'https://example.com/#/form/sponsor-form',
  tier: 'Gold',
  itemsList: '<ul><li>Gold Tier × 1 — $12,500.00</li><li>Networking booth × 1 — $1,000.00</li></ul>',
  total: '$13,500.00',
  transactionId: 'PAY-TX-1234567',
  mailingAddress: '123 Main Street, Toronto, ON M5V 1A1',
  adminDashboardLink: 'https://admin.example.com/#/admin/sponsors',
  guestClaimLinks: '<ul><li>Seat 1: <a href="#">example.com/claim/abc123</a></li><li>Seat 2: <a href="#">example.com/claim/def456</a></li></ul>',
};

const SponsorTemplatesTab: React.FC<Props> = ({ settings, onSaved }) => {
  const { showNotification } = useNotifications();
  const [s, setS] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>(String(TEMPLATES[0].subjectKey));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [globalOpen, setGlobalOpen] = useState(false);

  const template = TEMPLATES.find(t => String(t.subjectKey) === selectedKey) || TEMPLATES[0];

  const vars = useMemo(() => ({ ...DEFAULT_VARS, ...overrides }), [overrides]);

  const subjectValue = String(s[template.subjectKey] || '');
  const bodyValue = String(s[template.bodyKey] || '');

  const previewHtml = useMemo(
    () => renderEmailShell({
      content: mergePlaceholders(bodyValue, vars),
      site: CURRENT_SITE.key,
      headerImageUrl: s.emailHeaderLogo || undefined,
      footerText: s.emailFooterText,
      previewMode: true,
    }),
    [bodyValue, vars, s.emailHeaderLogo, s.emailFooterText],
  );

  const resolvedSubject = useMemo(() => mergePlaceholders(subjectValue, vars), [subjectValue, vars]);

  const setOverride = (key: string, value: string) => setOverrides(prev => ({ ...prev, [key]: value }));
  const clearOverride = (key: string) =>
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(s);
      showNotification('Sponsor templates saved', 'success');
      await onSaved();
    } catch (e: any) {
      showNotification(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm transition';

  return (
    <div className="bg-white rounded-2xl shadow border border-slate-200 flex flex-col overflow-hidden h-[calc(100vh-200px)] min-h-[620px]">
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-5 min-h-0">
        {/* Editor column */}
        <div className="xl:col-span-2 overflow-y-auto px-6 py-5 space-y-5 border-r border-gray-100">
          {/* Template picker */}
          <div>
            <label className={labelCls}>Template</label>
            <div className="relative">
              <select
                value={selectedKey}
                onChange={e => { setSelectedKey(e.target.value); setOverrides({}); }}
                className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer font-medium`}
              >
                {TEMPLATES.map(t => (
                  <option key={String(t.subjectKey)} value={String(t.subjectKey)}>{t.title}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{template.description}</p>
          </div>

          <div>
            <label className={labelCls}>Subject</label>
            <input
              value={subjectValue}
              onChange={e => setS({ ...s, [template.subjectKey]: e.target.value } as AppSettings)}
              className={inputCls}
              placeholder="Subject (supports placeholders)"
            />
          </div>

          <div>
            <label className={labelCls}>Body (HTML)</label>
            <textarea
              value={bodyValue}
              onChange={e => setS({ ...s, [template.bodyKey]: e.target.value } as AppSettings)}
              rows={12}
              className={`${inputCls} font-mono text-xs leading-relaxed`}
              placeholder="HTML body. Use {{placeholder}} tokens for merged values."
            />
          </div>

          {/* Placeholder overrides */}
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 space-y-2">
            <div>
              <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Preview placeholders</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Override the dummy values used below.</div>
            </div>
            {template.placeholders.map(key => {
              const defaultValue = DEFAULT_VARS[key] ?? '';
              const currentValue = vars[key] ?? '';
              const isOverridden = overrides[key] !== undefined && overrides[key] !== defaultValue;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-[130px] shrink-0">
                    <code className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${isOverridden ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-700'}`}>
                      {'{{'}{key}{'}}'}
                    </code>
                  </div>
                  <input
                    value={currentValue}
                    onChange={e => setOverride(key, e.target.value)}
                    className={`flex-1 px-2 py-1.5 text-xs border rounded-md outline-none focus:ring-1 transition ${isOverridden ? 'border-indigo-300 bg-indigo-50 focus:ring-indigo-400' : 'border-gray-200 bg-white focus:ring-indigo-400 focus:border-indigo-400'}`}
                  />
                  {isOverridden && (
                    <button
                      type="button"
                      onClick={() => clearOverride(key)}
                      title="Reset"
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-indigo-700"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Global sponsor settings — collapsible */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setGlobalOpen(o => !o)}
              className="w-full flex items-center justify-between text-left group px-4 py-3"
            >
              <div>
                <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Global sponsor settings</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Internal recipients, cheque mailing address, HST rate.</div>
              </div>
              {globalOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            </button>
            {globalOpen && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <label className={labelCls}>Internal cheque-notification recipients</label>
                  <textarea
                    value={(s.sponsorChequeInternalRecipients || []).join('\n')}
                    onChange={e => setS({ ...s, sponsorChequeInternalRecipients: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
                    rows={3}
                    className={`${inputCls} font-mono text-xs`}
                    placeholder="gala@sicklecellanemia.ca&#10;communication@sicklecellanemia.ca"
                  />
                </div>
                <div>
                  <label className={labelCls}>Cheque mailing address</label>
                  <textarea
                    value={s.sponsorChequeMailingAddress || ''}
                    onChange={e => setS({ ...s, sponsorChequeMailingAddress: e.target.value })}
                    rows={3}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>HST rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={s.sponsorHstRate}
                      onChange={e => setS({ ...s, sponsorHstRate: parseFloat(e.target.value) || 0 })}
                      className={`${inputCls} w-32`}
                    />
                    <span className="text-xs text-gray-500">e.g. 0.13 for 13%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview column */}
        <div className="xl:col-span-3 bg-gray-100 flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4" /> Live preview
            </div>
            <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={resolvedSubject}>
              Subject: <span className="font-medium text-gray-700">{resolvedSubject || <em className="text-gray-400">(empty)</em>}</span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <iframe
              title="Sponsor email preview"
              srcDoc={previewHtml}
              sandbox=""
              scrolling="no"
              className="w-full h-full bg-white border-0 block"
            />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 text-sm font-bold hover:bg-red-700 transition shadow-sm"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save all templates'}
        </button>
      </div>
    </div>
  );
};

export default SponsorTemplatesTab;
