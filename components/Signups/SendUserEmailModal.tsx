import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send as SendIcon, Loader2, RotateCcw, ChevronDown, ChevronRight, Tag,
  BarChart3, Edit3, Mail, Eye, MousePointerClick, Clock, RefreshCw,
} from 'lucide-react';
import type { PortalUser } from '../../services/storageService';
import type { AppSettings, Form } from '../../types';
import {
  generateTrackingId,
  logEmailSend,
  getEmailSendsForEmail,
  type EmailSend,
} from '../../services/emailSendsService';
import { supabase } from '../../services/supabaseClient';
import { CURRENT_SITE } from '../../config/sites';
import { renderEmailShell, mergePlaceholders, plainTextToHtml } from '../../utils/emailShell';

type TemplateKey = 'reminder' | 'invitation' | 'blank';
type View = 'compose' | 'analytics';

interface Props {
  user: PortalUser;
  settings: AppSettings;
  forms: Form[];
  onClose: () => void;
  onSent?: () => void;
}

interface EmailFields {
  heading: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}

const EMPTY_FIELDS: EmailFields = {
  heading: '',
  message: '',
  ctaLabel: '',
  ctaUrl: '',
  footerNote: '',
};

const DEFAULTS: Record<TemplateKey, { subject: string; fields: EmailFields }> = {
  reminder: {
    subject: 'Complete your registration for {{event}}',
    fields: {
      heading: 'Pick up where you left off',
      message:
        "Hi {{name}},\n\n" +
        "You started registering for {{event}} but didn't quite finish. Your progress " +
        "(step {{step}} of {{total_steps}}) is saved and waiting for you.",
      ctaLabel: 'Resume registration',
      ctaUrl: '{{resume_url}}',
      footerNote:
        'If you registered from another device, signing in with the same email will also resume your draft.',
    },
  },
  invitation: {
    subject: "You're invited to {{event}}",
    fields: {
      heading: 'Join us at {{event}}',
      message:
        "Hi {{name}},\n\n" +
        "We'd love to have you at {{event}}. Click below to sign up and reserve your spot — " +
        "it only takes a minute.",
      ctaLabel: 'Sign up now',
      ctaUrl: '{{signup_url}}',
      footerNote:
        "Questions? Reply to this email and we'll get back to you shortly.",
    },
  },
  blank: {
    subject: '',
    fields: { ...EMPTY_FIELDS },
  },
};

const TEMPLATE_OPTIONS: Array<{ key: TemplateKey; label: string; description: string }> = [
  { key: 'reminder', label: 'Registration Reminder', description: 'Nudge a user who started but did not finish' },
  { key: 'invitation', label: 'Invitation / Marketing', description: 'Invite a user who has not signed up yet' },
  { key: 'blank', label: 'Blank / Custom', description: 'Start from scratch' },
];

const TEMPLATE_LABELS: Record<string, string> = {
  reminder: 'Registration Reminder',
  invitation: 'Invitation / Marketing',
  blank: 'Blank / Custom',
  custom: 'Custom',
};

// ---------------------------------------------------------------------------
// Rendering helpers — thin wrapper over the shared site-aware email shell.
// ---------------------------------------------------------------------------

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trackingEndpoint(): string {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  if (!url) return '';
  return `${url.replace(/\/$/, '')}/functions/v1/track-email`;
}

function buildOpenPixelUrl(trackingId: string): string {
  const endpoint = trackingEndpoint();
  if (!endpoint || !trackingId) return '';
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=open`;
}

function wrapClickUrl(trackingId: string, destination: string): string {
  const endpoint = trackingEndpoint();
  if (!endpoint || !trackingId || !destination) return destination;
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=click&to=${encodeURIComponent(destination)}`;
}

function composeBodyContent(fields: EmailFields, vars: Record<string, string>, opts: { trackingId?: string; previewMode?: boolean }): string {
  const { trackingId = '', previewMode = false } = opts;
  const heading = escapeHtmlAttr(mergePlaceholders(fields.heading || '', vars));
  const bodyHtml = plainTextToHtml(mergePlaceholders(fields.message || '', vars));
  const ctaLabel = escapeHtmlAttr(mergePlaceholders(fields.ctaLabel || '', vars));
  const rawCtaUrl = mergePlaceholders(fields.ctaUrl || '', vars);
  const ctaUrl = !previewMode && trackingId ? wrapClickUrl(trackingId, rawCtaUrl) : rawCtaUrl;
  const footerNote = escapeHtmlAttr(mergePlaceholders(fields.footerNote || '', vars));

  const ctaBlock = ctaLabel && rawCtaUrl
    ? `<p style="text-align: center;"><a href="${escapeHtmlAttr(ctaUrl)}" class="button">${ctaLabel}</a></p>`
    : '';
  const footerNoteBlock = footerNote
    ? `<p style="font-size: 13px; opacity: 0.6;">${footerNote}</p>`
    : '';
  const headingBlock = heading ? `<h2>${heading}</h2>` : '';

  return `${headingBlock}
${bodyHtml}
${ctaBlock}
${footerNoteBlock}`;
}

function renderEmailHtml(
  fields: EmailFields,
  vars: Record<string, string>,
  opts: { previewMode?: boolean; trackingId?: string } = {},
): string {
  const { previewMode = false, trackingId = '' } = opts;
  const trackingPixelUrl = !previewMode && trackingId ? buildOpenPixelUrl(trackingId) : undefined;
  return renderEmailShell({
    content: composeBodyContent(fields, vars, { trackingId, previewMode }),
    site: CURRENT_SITE.key,
    previewMode,
    trackingPixelUrl,
  });
}

// Shim so existing callers that used applyPlaceholders directly still work.
const applyPlaceholders = mergePlaceholders;

// ---------------------------------------------------------------------------
// Analytics tab
// ---------------------------------------------------------------------------

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AnalyticsView({ email, reloadSignal }: { email: string; reloadSignal: number }) {
  const [sends, setSends] = useState<EmailSend[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await getEmailSendsForEmail(email);
      if (!cancelled) {
        setSends(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email, reloadSignal, refreshTick]);

  const stats = useMemo(() => {
    const list = sends ?? [];
    const total = list.length;
    const opened = list.filter(s => s.openedAt).length;
    const clicked = list.filter(s => s.clickCount > 0).length;
    return {
      total,
      opened,
      clicked,
      openRate: total ? Math.round((opened / total) * 100) : 0,
      clickRate: total ? Math.round((clicked / total) * 100) : 0,
    };
  }, [sends]);

  if (loading && sends === null) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading history…
      </div>
    );
  }

  const list = sends ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Mail className="w-4 h-4" />} label="Sent" value={stats.total} sub={`all time`} tint="from-[#ba0028]/5 to-white" />
        <StatCard icon={<Eye className="w-4 h-4" />} label="Opened" value={stats.opened} sub={`${stats.openRate}% open rate`} tint="from-[#E0243C]/5 to-white" />
        <StatCard icon={<MousePointerClick className="w-4 h-4" />} label="Clicked" value={stats.clicked} sub={`${stats.clickRate}% click rate`} tint="from-[#2260a1]/5 to-white" />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Email history</h3>
        <button
          onClick={() => setRefreshTick(t => t + 1)}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 transition"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {list.length === 0 && (
        <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500">
          <Mail className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          No emails sent to this recipient yet.<br />
          Switch to the <strong>Compose</strong> tab to send the first one.
        </div>
      )}

      {list.map(s => (
        <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-3 hover:border-[#ba0028]/30 transition">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 truncate" title={s.subject}>{s.subject}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#ba0028]/10 to-[#E0243C]/10 text-[#ba0028] font-medium border border-[#ba0028]/20">
                  {TEMPLATE_LABELS[s.templateKey || 'custom'] || s.templateKey}
                </span>
                {s.eventName && (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Tag className="w-3 h-3" />{s.eventName}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-gray-500 flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> {timeAgo(s.sentAt)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5" title={formatFull(s.sentAt)}>
                {formatFull(s.sentAt)}
              </div>
            </div>
          </div>

          {/* Engagement pills */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {s.openedAt ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Opened ${formatFull(s.openedAt)}`}>
                <Eye className="w-3 h-3" /> Opened {timeAgo(s.openedAt)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                <Eye className="w-3 h-3" /> Not opened
              </span>
            )}
            {s.clickCount > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200" title={`Last click ${formatFull(s.lastClickedAt)}`}>
                <MousePointerClick className="w-3 h-3" /> {s.clickCount} click{s.clickCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                <MousePointerClick className="w-3 h-3" /> No clicks
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, sub, tint }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  tint: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-gradient-to-br ${tint} p-3`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-600">
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1 leading-none">{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PLACEHOLDER_LABELS: Record<string, string> = {
  name: 'Recipient name',
  email: 'Recipient email',
  event: 'Event name',
  resume_url: 'Resume URL',
  signup_url: 'Signup URL',
  step: 'Current step',
  total_steps: 'Total steps',
  link: 'Generic link',
};

const PLACEHOLDER_ORDER = ['name', 'email', 'event', 'resume_url', 'signup_url', 'step', 'total_steps', 'link'];

export default function SendUserEmailModal({ user, settings, forms, onClose, onSent }: Props) {
  const initialTemplate: TemplateKey = user.draft ? 'reminder' : user.hasPaidTicket ? 'blank' : 'invitation';
  const [view, setView] = useState<View>('compose');
  const [template, setTemplate] = useState<TemplateKey>(initialTemplate);
  const [subject, setSubject] = useState<string>(DEFAULTS[initialTemplate].subject);
  const [fields, setFields] = useState<EmailFields>({ ...DEFAULTS[initialTemplate].fields });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [placeholdersOpen, setPlaceholdersOpen] = useState(true);
  const [sendsReloadSignal, setSendsReloadSignal] = useState(0);

  const defaultEventFormId = useMemo(() => {
    const draftForm = forms.find(f => f.id === user.draft?.formId);
    const ticketForm = forms.find(f => f.id === user.mostRecentTicketFormId);
    return (draftForm || ticketForm || forms[0])?.id || '';
  }, [forms, user]);
  const [eventFormId, setEventFormId] = useState<string>(defaultEventFormId);

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const defaultVars = useMemo<Record<string, string>>(() => {
    const origin = window.location.origin;
    const eventForm = forms.find(f => f.id === eventFormId) || forms[0];
    const steps = (eventForm?.settings as any)?.steps;
    const totalSteps = Array.isArray(steps) ? steps.length : 0;

    const resumeFormId = user.draft?.formId || eventForm?.id;
    const resumeUrl = resumeFormId
      ? `${origin}/#/form/${resumeFormId}`
      : `${origin}/#/portal`;

    return {
      name: user.fullName || user.email.split('@')[0],
      email: user.email,
      event: eventForm?.title || 'the event',
      resume_url: resumeUrl,
      signup_url: `${origin}/#/`,
      step: user.draft ? String(user.draft.currentIndex + 1) : '1',
      total_steps: totalSteps > 0 ? String(totalSteps) : '5',
      link: resumeUrl,
    };
  }, [user, forms, eventFormId]);

  const vars = useMemo<Record<string, string>>(
    () => ({ ...defaultVars, ...overrides }),
    [defaultVars, overrides],
  );

  const seedTemplate = (key: TemplateKey) => {
    const d = DEFAULTS[key];
    setSubject(d.subject);
    setFields({ ...d.fields });
  };

  const handleTemplateChange = (key: TemplateKey) => {
    setTemplate(key);
    seedTemplate(key);
  };

  const renderedHtml = useMemo(
    () => renderEmailHtml(fields, vars, { previewMode: true }),
    [fields, vars],
  );
  const renderedSubject = useMemo(() => applyPlaceholders(subject, vars), [subject, vars]);

  const handleSend = async () => {
    setError('');
    if (!renderedSubject.trim()) {
      setError('Subject is required.');
      return;
    }
    if (!fields.message.trim()) {
      setError('Message body is required.');
      return;
    }
    setSending(true);
    try {
      if (!settings.smtpUser || !settings.smtpPass) {
        throw new Error('SMTP credentials are not configured in Settings.');
      }
      const trackingId = generateTrackingId();
      const renderedHtmlSend = renderEmailHtml(fields, vars, { trackingId });
      const eventForm = forms.find(f => f.id === eventFormId) || forms[0];

      // Invoke the edge function directly with mode=raw-html so our
      // fully pre-rendered GANSID-branded document is delivered as-is.
      // The default sendTicketEmail() path wraps .message inside
      // generateEmailTemplate, which would double-wrap and break layout.
      const { data: response, error } = await supabase.functions.invoke('send-ticket-email', {
        body: {
          mode: 'raw-html',
          to: user.email,
          subject: renderedSubject,
          html: renderedHtmlSend,
          smtpConfig: {
            host: settings.smtpHost || 'smtp.ionos.com',
            port: Number(settings.smtpPort || 587),
            user: settings.smtpUser,
            pass: settings.smtpPass,
            fromName: settings.emailFromName || '',
          },
        },
      });
      if (error) throw new Error(error.message || 'Failed to send email');
      if ((response as any)?.error) throw new Error((response as any).error);

      // Log after successful SMTP — never logs a failed send.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      await logEmailSend({
        trackingId,
        recipientEmail: user.email,
        recipientUserId: user.userId ?? null,
        subject: renderedSubject,
        templateKey: template,
        formId: eventForm?.id ?? null,
        eventName: vars.event || null,
        sentBy: authUser?.id ?? null,
        metadata: {
          heading: fields.heading,
          ctaLabel: fields.ctaLabel,
          ctaUrl: fields.ctaUrl,
          overrides: Object.keys(overrides),
        },
      });

      setSent(true);
      setSendsReloadSignal(s => s + 1);
      onSent?.();
      setTimeout(() => { onClose(); }, 1200);
    } catch (e: any) {
      setError(e?.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const setField = <K extends keyof EmailFields>(k: K, v: EmailFields[K]) =>
    setFields(prev => ({ ...prev, [k]: v }));

  const setOverride = (key: string, value: string) => {
    setOverrides(prev => ({ ...prev, [key]: value }));
  };
  const clearOverride = (key: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#ba0028]/30 focus:border-[#ba0028] text-sm transition';

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — GANSID gradient with tabs */}
        <div
          className="text-white"
          style={{ background: 'linear-gradient(135deg, #ba0028 0%, #E0243C 55%, #2260a1 100%)' }}
        >
          <div className="px-6 pt-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Send email</h2>
              <p className="text-xs text-white/85 mt-0.5">
                To <span className="font-semibold">{user.fullName || user.email}</span>{' '}
                <span className="text-white/70">&lt;{user.email}&gt;</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          {/* Tabs */}
          <div className="px-6 mt-3 flex gap-1">
            {([
              ['compose', 'Compose', <Edit3 className="w-3.5 h-3.5" key="c" />],
              ['analytics', 'Analytics', <BarChart3 className="w-3.5 h-3.5" key="a" />],
            ] as Array<[View, string, React.ReactNode]>).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-1.5 ${view === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'bg-white/10 text-white/85 hover:bg-white/20'}`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'compose' ? (
          <>
            {/* Two-column body — editor left (scrollable), preview right (fixed) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 overflow-hidden min-h-0">
              {/* Editor */}
              <div className="lg:col-span-2 overflow-y-auto px-6 py-5 space-y-4 border-r border-gray-100">
                {/* Template dropdown */}
                <div>
                  <label className={labelCls}>Template</label>
                  <div className="relative">
                    <select
                      value={template}
                      onChange={e => handleTemplateChange(e.target.value as TemplateKey)}
                      className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer font-medium`}
                    >
                      {TEMPLATE_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                    {TEMPLATE_OPTIONS.find(t => t.key === template)?.description}. The branded
                    shell (header image, colours, footer) is applied automatically.
                  </p>
                </div>

                {/* Event selector */}
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      Event <span className="normal-case tracking-normal text-gray-400 font-normal">— used for {'{{event}}'}</span>
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      value={eventFormId}
                      onChange={e => { setEventFormId(e.target.value); clearOverride('event'); }}
                      className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer`}
                    >
                      {forms.length === 0 && <option value="">— no forms available —</option>}
                      {forms.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.title}{f.id === defaultEventFormId ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className={labelCls}>Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className={inputCls}
                    placeholder="Subject line (recipient sees this)"
                  />
                </div>

                {/* Heading */}
                <div>
                  <label className={labelCls}>Heading</label>
                  <input
                    type="text"
                    value={fields.heading}
                    onChange={e => setField('heading', e.target.value)}
                    className={inputCls}
                    placeholder="Large heading at the top of the email body"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className={labelCls}>Message</label>
                  <textarea
                    value={fields.message}
                    onChange={e => setField('message', e.target.value)}
                    rows={7}
                    className={`${inputCls} leading-relaxed`}
                    placeholder="Use blank lines for paragraph breaks. Plain text — no HTML."
                  />
                </div>

                {/* CTA */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>CTA button label</label>
                    <input
                      type="text"
                      value={fields.ctaLabel}
                      onChange={e => setField('ctaLabel', e.target.value)}
                      className={inputCls}
                      placeholder="Resume registration"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>CTA button URL</label>
                    <input
                      type="text"
                      value={fields.ctaUrl}
                      onChange={e => setField('ctaUrl', e.target.value)}
                      className={inputCls}
                      placeholder="{{resume_url}}"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 -mt-2">
                  Leave both CTA fields empty to omit the button.
                </p>

                {/* Footer note */}
                <div>
                  <label className={labelCls}>Footer note (small)</label>
                  <textarea
                    value={fields.footerNote}
                    onChange={e => setField('footerNote', e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder="Small italic note shown below the button"
                  />
                </div>

                {/* Placeholder values — collapsible */}
                <div className="pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setPlaceholdersOpen(o => !o)}
                    className="w-full flex items-center justify-between text-left group"
                  >
                    <div>
                      <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                        Placeholder values
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        These replace <code className="bg-gray-100 px-1 rounded text-[10px]">{'{{variable}}'}</code> in every field above. Click any to override.
                      </div>
                    </div>
                    {placeholdersOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                    )}
                  </button>

                  {placeholdersOpen && (
                    <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3">
                      {PLACEHOLDER_ORDER.map(key => {
                        const defaultValue = defaultVars[key] ?? '';
                        const currentValue = vars[key] ?? '';
                        const isOverridden = overrides[key] !== undefined && overrides[key] !== defaultValue;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <div className="w-[110px] shrink-0">
                              <code className={`text-[11px] px-1.5 py-0.5 rounded font-mono ${isOverridden ? 'bg-[#ba0028]/10 text-[#ba0028]' : 'bg-gray-200 text-gray-700'}`}>
                                {'{{'}{key}{'}}'}
                              </code>
                              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                                {PLACEHOLDER_LABELS[key] || key}
                              </div>
                            </div>
                            <input
                              type="text"
                              value={currentValue}
                              onChange={e => setOverride(key, e.target.value)}
                              className={`flex-1 px-2 py-1.5 text-xs border rounded-md outline-none focus:ring-1 transition ${isOverridden ? 'border-[#ba0028]/40 bg-[#ba0028]/5 focus:ring-[#ba0028]/30' : 'border-gray-200 bg-white focus:ring-[#ba0028]/30 focus:border-[#ba0028]'}`}
                            />
                            {isOverridden && (
                              <button
                                type="button"
                                onClick={() => clearOverride(key)}
                                title="Reset to default"
                                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-[#ba0028] transition"
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

                {error && (
                  <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Live preview — fixed height, no internal scroll */}
              <div className="lg:col-span-3 bg-gray-100 flex flex-col min-h-0">
                <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Live preview</div>
                  <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={renderedSubject}>
                    Subject: <span className="font-medium text-gray-700">{renderedSubject || <em className="text-gray-400">(empty)</em>}</span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <iframe
                    title="Email preview"
                    srcDoc={renderedHtml}
                    sandbox=""
                    scrolling="no"
                    className="w-full h-full bg-white border-0 block"
                  />
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-gray-50">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || sent}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition shadow-sm ${sent ? 'bg-emerald-600' : sending ? 'bg-gray-400 cursor-not-allowed' : 'hover:shadow-md'}`}
                style={!sent && !sending ? { background: 'linear-gradient(135deg, #ba0028 0%, #E0243C 100%)' } : undefined}
              >
                {sent ? 'Sent!' : sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><SendIcon className="w-4 h-4" /> Send</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <AnalyticsView email={user.email} reloadSignal={sendsReloadSignal} />
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
              <p className="text-[11px] text-gray-500">
                Open / click tracking uses an invisible pixel + CTA redirect — some corporate
                inboxes strip these, so counts are lower bounds.
              </p>
              <button
                onClick={() => setView('compose')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition"
              >
                Back to compose
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
