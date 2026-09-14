import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send as SendIcon, Loader2, ChevronDown, Tag, Users, Search, CheckCircle2, XCircle,
  Circle, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, Mail, Eye,
} from 'lucide-react';
import type { AppSettings, Form } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { generateTrackingId, logEmailSend } from '../../services/emailSendsService';
import { classifyEmailFailure, extractInvokeError, shouldAbortBulkSend } from '../../utils/emailSendErrors';
import { mergePlaceholders } from '../../utils/emailShell';
import {
  ADMIN_EMAIL_TEMPLATES,
  PLACEHOLDER_LABELS,
  dedupeRecipients,
  renderAdminEmailHtml,
  templateOptionsFor,
  type AdminEmailAudience,
  type AdminEmailTemplateKey,
  type BulkRecipient,
  type EmailFields,
} from '../../utils/adminEmailCompose';

// ---------------------------------------------------------------------------
// Filter-driven mass email.
//
// The caller decides WHO (the rows currently matching its filters — e.g. the
// Signups tab's "In progress" bucket, or the dashboard's "Delegates of
// Pfizer" view) and hands them over as recipients with per-person placeholder
// values. This modal owns the rest: compose once with a live per-recipient
// preview, review and prune the list, then send in throttled batches with a
// visible status per person, a cancel that stops after the in-flight sends,
// and a retry for whatever failed.
//
// Every successful send is logged to email_sends with a shared campaignId so
// the Signups "Last email" column, the per-user analytics and any later
// reporting all see the same run.
// ---------------------------------------------------------------------------

type Step = 'compose' | 'review' | 'send';
type ItemStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

interface SendItem {
  key: string;
  email: string;
  name: string;
  subtitle?: string;
  status: ItemStatus;
  error?: string | null;
}

interface Props {
  audience: AdminEmailAudience;
  /** Human description of the filter that produced the list — shown in the
   *  header and stored on every email_sends row ("In progress · matching 'pfizer'"). */
  audienceLabel: string;
  recipients: BulkRecipient[];
  settings: AppSettings;
  forms: Form[];
  defaultTemplate?: AdminEmailTemplateKey;
  /** When set, `{{event}}` is taken from this form for everyone instead of
   *  each recipient's own registration. */
  defaultEventFormId?: string;
  onClose: () => void;
  /** Fired once the run finishes (or the modal closes mid-run) if at least one email went out. */
  onSent?: () => void;
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

export default function BulkEmailModal({
  audience, audienceLabel, recipients, settings, forms, defaultTemplate, defaultEventFormId, onClose, onSent,
}: Props) {
  const templateOptions = useMemo(() => templateOptionsFor(audience), [audience]);
  const initialTemplate: AdminEmailTemplateKey = defaultTemplate && templateOptions.some(o => o.key === defaultTemplate)
    ? defaultTemplate
    : templateOptions[0].key;

  const [step, setStep] = useState<Step>('compose');
  const [template, setTemplate] = useState<AdminEmailTemplateKey>(initialTemplate);
  const [subject, setSubject] = useState<string>(ADMIN_EMAIL_TEMPLATES[initialTemplate].subject);
  const [fields, setFields] = useState<EmailFields>({ ...ADMIN_EMAIL_TEMPLATES[initialTemplate].fields });
  const [eventFormId, setEventFormId] = useState<string>(defaultEventFormId ?? '');
  const [mobileView, setMobileView] = useState<'compose' | 'preview'>('compose');

  // Audience — deduped once; the admin can then prune it.
  const deduped = useMemo(() => dedupeRecipients(recipients), [recipients]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(deduped.recipients.map(r => r.key)));
  const [recipientSearch, setRecipientSearch] = useState('');
  const [previewKey, setPreviewKey] = useState<string>(deduped.recipients[0]?.key ?? '');

  // Send run
  const [items, setItems] = useState<SendItem[]>([]);
  const [batchSize, setBatchSize] = useState<number>(50);
  const [pauseSeconds, setPauseSeconds] = useState<number>(30);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [armed, setArmed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [abortNotice, setAbortNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');
  const cancelRef = useRef(false);
  const mountedRef = useRef(true);
  const sentAnyRef = useRef(false);
  const campaignIdRef = useRef<string>(generateTrackingId());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
      if (sentAnyRef.current) onSent?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setItemsSafe = (fn: (prev: SendItem[]) => SendItem[]) => {
    if (mountedRef.current) setItems(fn);
  };

  // ENV-FIRST SMTP (Resend edge secrets on GANSID; app_settings.smtp_pass
  // cleared) means the client can't verify config — any partial app_settings
  // SMTP counts as ready; real failures surface per-row in the run.
  const smtpReady = !!(settings.smtpUser || settings.smtpPass);

  const eventForm = useMemo(() => forms.find(f => f.id === eventFormId), [forms, eventFormId]);

  const varsFor = (r: BulkRecipient): Record<string, string> => (
    eventForm ? { ...r.vars, event: eventForm.title } : r.vars
  );

  const selectedRecipients = useMemo(
    () => deduped.recipients.filter(r => selected.has(r.key)),
    [deduped.recipients, selected],
  );

  const previewRecipient = useMemo(
    () => deduped.recipients.find(r => r.key === previewKey) ?? selectedRecipients[0] ?? deduped.recipients[0],
    [deduped.recipients, previewKey, selectedRecipients],
  );
  const previewVars = previewRecipient ? varsFor(previewRecipient) : {};
  const renderedHtml = useMemo(
    () => renderAdminEmailHtml(fields, previewVars, { previewMode: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, previewRecipient, eventForm],
  );
  const renderedSubject = mergePlaceholders(subject, previewVars);

  const seedTemplate = (key: AdminEmailTemplateKey) => {
    setTemplate(key);
    const d = ADMIN_EMAIL_TEMPLATES[key];
    setSubject(d.subject);
    setFields({ ...d.fields });
  };

  const setField = <K extends keyof EmailFields>(k: K, v: EmailFields[K]) =>
    setFields(prev => ({ ...prev, [k]: v }));

  // Placeholders that actually carry a value for this audience.
  const availablePlaceholders = useMemo(() => {
    const sample = deduped.recipients[0]?.vars ?? {};
    return Object.keys(PLACEHOLDER_LABELS).filter(k => (sample[k] ?? '') !== '' || k === 'event');
  }, [deduped.recipients]);

  // ── Review helpers ──
  const visibleRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return deduped.recipients;
    return deduped.recipients.filter(r =>
      r.email.toLowerCase().includes(q)
      || r.name.toLowerCase().includes(q)
      || (r.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [deduped.recipients, recipientSearch]);

  const allVisibleSelected = visibleRecipients.length > 0 && visibleRecipients.every(r => selected.has(r.key));
  const toggleOne = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleVisible = () => setSelected(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) visibleRecipients.forEach(r => next.delete(r.key));
    else visibleRecipients.forEach(r => next.add(r.key));
    return next;
  });

  const composeProblem: string | null = !smtpReady
    ? 'Configure SMTP in Settings to enable sending'
    : !subject.trim()
      ? 'Add a subject line'
      : !fields.message.trim()
        ? 'Add a message'
        : deduped.recipients.length === 0
          ? 'No one in this view has an email address'
          : null;

  const goToReview = () => {
    if (composeProblem) { setValidationError(composeProblem); return; }
    setValidationError('');
    setStep('review');
  };

  // ── Sending ──
  const sendOne = async (item: SendItem, recipient: BulkRecipient, sentBy: string | null) => {
    setItemsSafe(prev => prev.map(i => i.key === item.key ? { ...i, status: 'sending', error: null } : i));
    const trackingId = generateTrackingId();
    const vars = varsFor(recipient);
    const subjectResolved = mergePlaceholders(subject, vars);
    const html = renderAdminEmailHtml(fields, vars, { trackingId });
    try {
      const { data, error } = await supabase.functions.invoke('send-ticket-email', {
        body: {
          mode: 'raw-html',
          to: recipient.email,
          subject: subjectResolved,
          html,
          smtpConfig: {
            host: settings.smtpHost || 'smtp.ionos.com',
            port: Number(settings.smtpPort || 587),
            user: settings.smtpUser,
            pass: settings.smtpPass,
            fromName: settings.emailFromName || '',
          },
        },
      });
      if (error) {
        const failure = classifyEmailFailure(await extractInvokeError(error));
        // Past a quota or credentials rejection every remaining recipient
        // fails identically — stop rather than flood the run with one error.
        if (shouldAbortBulkSend(failure.kind)) { cancelRef.current = true; setAbortNotice(failure.message); }
        throw new Error(failure.message);
      }
      if ((data as any)?.error) {
        const failure = classifyEmailFailure(String((data as any).error));
        if (shouldAbortBulkSend(failure.kind)) { cancelRef.current = true; setAbortNotice(failure.message); }
        throw new Error(failure.message);
      }
      sentAnyRef.current = true;
      setItemsSafe(prev => prev.map(i => i.key === item.key ? { ...i, status: 'sent', error: null } : i));
      // Best-effort analytics — a logging hiccup must not mark a delivered email failed.
      try {
        await logEmailSend({
          trackingId,
          recipientEmail: recipient.email,
          recipientUserId: recipient.userId ?? null,
          recipientAttendeeId: recipient.attendeeId ?? null,
          subject: subjectResolved,
          templateKey: template,
          formId: eventForm?.id ?? null,
          eventName: vars.event || null,
          sentBy,
          metadata: {
            source: `bulk-${audience}`,
            campaignId: campaignIdRef.current,
            audience: audienceLabel,
            heading: fields.heading,
            ctaLabel: fields.ctaLabel,
            ctaUrl: fields.ctaUrl,
          },
        });
      } catch { /* analytics logging is best-effort */ }
    } catch (e: any) {
      setItemsSafe(prev => prev.map(i => i.key === item.key ? { ...i, status: 'failed', error: e?.message || 'Send failed' } : i));
    }
  };

  const runChunk = async (chunk: SendItem[], byKey: Map<string, BulkRecipient>, sentBy: string | null, concurrency: number) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, chunk.length) }, async () => {
      while (true) {
        if (cancelRef.current) return;
        const idx = cursor++;
        if (idx >= chunk.length) return;
        const item = chunk[idx];
        const recipient = byKey.get(item.key);
        if (!recipient) {
          setItemsSafe(prev => prev.map(i => i.key === item.key ? { ...i, status: 'skipped', error: 'Recipient no longer in the list' } : i));
          continue;
        }
        await sendOne(item, recipient, sentBy);
      }
    });
    await Promise.all(workers);
  };

  const startSend = async (retryOnly: boolean) => {
    const byKey = new Map(selectedRecipients.map(r => [r.key, r] as const));
    const queueSource: SendItem[] = retryOnly
      ? items.filter(i => i.status === 'failed' || i.status === 'pending')
      : selectedRecipients.map(r => ({ key: r.key, email: r.email, name: r.name, subtitle: r.subtitle, status: 'pending' as ItemStatus }));
    if (!retryOnly) setItems(queueSource);
    else setItems(prev => prev.map(i => (i.status === 'failed' ? { ...i, status: 'pending', error: null } : i)));

    setStep('send');
    setArmed(false);
    setRunning(true);
    setFinished(false);
    setAbortNotice(null);
    cancelRef.current = false;

    let sentBy: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      sentBy = user?.id ?? null;
    } catch { /* logged without a sender */ }

    const size = Math.max(1, Math.min(batchSize, 500));
    const pauseMs = Math.max(0, pauseSeconds) * 1000;
    const concurrency = Math.min(3, size);

    for (let i = 0; i < queueSource.length; i += size) {
      if (cancelRef.current) break;
      await runChunk(queueSource.slice(i, i + size), byKey, sentBy, concurrency);
      const hasMore = i + size < queueSource.length;
      if (hasMore && !cancelRef.current && pauseMs > 0) {
        for (let s = Math.ceil(pauseMs / 1000); s > 0; s--) {
          if (cancelRef.current) break;
          if (mountedRef.current) setCountdown(s);
          await sleep(1000);
        }
        if (mountedRef.current) setCountdown(0);
      }
    }
    if (!mountedRef.current) return;
    setRunning(false);
    setFinished(true);
    setCountdown(0);
    if (sentAnyRef.current) onSent?.();
  };

  const counts = useMemo(() => {
    const c = { total: items.length, sent: 0, failed: 0, skipped: 0, pending: 0, sending: 0 };
    for (const i of items) {
      if (i.status === 'sent') c.sent++;
      else if (i.status === 'failed') c.failed++;
      else if (i.status === 'skipped') c.skipped++;
      else if (i.status === 'sending') c.sending++;
      else c.pending++;
    }
    return c;
  }, [items]);
  const progressPct = counts.total === 0 ? 0 : Math.round(((counts.sent + counts.failed + counts.skipped) / counts.total) * 100);

  const requestClose = () => {
    if (running) {
      const ok = window.confirm('Emails are still sending. Closing now stops the run after the emails already in flight. Close anyway?');
      if (!ok) return;
      cancelRef.current = true;
    }
    onClose();
  };

  // ── UI ──
  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm transition';
  const STEPS: Array<{ key: Step; label: string }> = [
    { key: 'compose', label: 'Compose' },
    { key: 'review', label: 'Review recipients' },
    { key: 'send', label: 'Send' },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);
  const selectedCount = selectedRecipients.length;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={requestClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="bulk-email-modal">
        {/* Header */}
        <div className="text-white" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 55%, #2260a1 100%)' }}>
          <div className="px-6 pt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-white/15 rounded-lg shrink-0"><Mail className="w-5 h-5" /></div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight">Email {deduped.recipients.length} {deduped.recipients.length === 1 ? 'person' : 'people'}</h2>
                <p className="text-xs text-white/85 mt-0.5 truncate" title={audienceLabel}>
                  <Users className="w-3 h-3 inline -mt-0.5 mr-1" />{audienceLabel}
                </p>
              </div>
            </div>
            <button onClick={requestClose} className="p-1.5 rounded-full hover:bg-white/20 transition shrink-0" aria-label="Close"><X className="w-5 h-5 text-white" /></button>
          </div>
          <div className="px-6 mt-3 pb-3 flex items-center gap-2 text-[11px] font-semibold">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <span className={`px-2.5 py-1 rounded-full ${i === stepIndex ? 'bg-white text-indigo-700' : i < stepIndex ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70'}`}>
                  {i < stepIndex ? <CheckCircle2 className="w-3 h-3 inline mr-1 -mt-0.5" /> : null}{s.label}
                </span>
                {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-white/50" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {step === 'compose' && (
            <>
              <div className="lg:hidden px-4 pt-3">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  {(['compose', 'preview'] as const).map(v => (
                    <button key={v} onClick={() => setMobileView(v)} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${mobileView === v ? 'bg-white shadow text-indigo-700' : 'text-gray-500'}`}>
                      {v === 'compose' ? 'Compose' : 'Preview'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 overflow-hidden min-h-0">
                <div className={`${mobileView === 'compose' ? '' : 'hidden'} lg:block lg:col-span-2 overflow-y-auto px-6 py-5 space-y-4 border-r border-gray-100`}>
                  <div>
                    <label className={labelCls}>Template</label>
                    <div className="relative">
                      <select value={template} onChange={e => seedTemplate(e.target.value as AdminEmailTemplateKey)} className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer font-medium`}>
                        {templateOptions.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                      {templateOptions.find(t => t.key === template)?.description}. The branded shell is applied automatically; placeholders fill in per person.
                    </p>
                  </div>

                  <div>
                    <label className={labelCls}>
                      <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" /> Event <span className="normal-case tracking-normal text-gray-400 font-normal">— used for {'{{event}}'}</span></span>
                    </label>
                    <div className="relative">
                      <select value={eventFormId} onChange={e => setEventFormId(e.target.value)} className={`${inputCls} pr-10 appearance-none bg-white cursor-pointer`}>
                        <option value="">Each person's own registration</option>
                        {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Subject</label>
                    <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} placeholder="Subject line (recipients see this)" />
                  </div>
                  <div>
                    <label className={labelCls}>Heading</label>
                    <input type="text" value={fields.heading} onChange={e => setField('heading', e.target.value)} className={inputCls} placeholder="Large heading at the top of the email body" />
                  </div>
                  <div>
                    <label className={labelCls}>Message</label>
                    <textarea value={fields.message} onChange={e => setField('message', e.target.value)} rows={8} className={`${inputCls} leading-relaxed`} placeholder="Use blank lines for paragraph breaks. Plain text — no HTML." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>CTA button label</label>
                      <input type="text" value={fields.ctaLabel} onChange={e => setField('ctaLabel', e.target.value)} className={inputCls} placeholder="View details" />
                    </div>
                    <div>
                      <label className={labelCls}>CTA button URL</label>
                      <input type="text" value={fields.ctaUrl} onChange={e => setField('ctaUrl', e.target.value)} className={inputCls} placeholder="{{portal_url}}" />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 -mt-2">Leave both CTA fields empty to omit the button.</p>
                  <div>
                    <label className={labelCls}>Footer note (small)</label>
                    <textarea value={fields.footerNote} onChange={e => setField('footerNote', e.target.value)} rows={2} className={inputCls} placeholder="Small note shown below the button" />
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Placeholders</div>
                    <p className="text-[11px] text-gray-500 mt-0.5">Filled in for each person from their record.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {availablePlaceholders.map(k => (
                        <code key={k} className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-gray-100 text-gray-700 border border-gray-200" title={PLACEHOLDER_LABELS[k]}>
                          {'{{'}{k}{'}}'}
                        </code>
                      ))}
                    </div>
                  </div>

                  {validationError && (
                    <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{validationError}</div>
                  )}
                </div>

                <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex lg:col-span-3 bg-gray-100 flex-col min-h-0`}>
                  <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Eye className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider shrink-0">Preview as</span>
                      <select
                        value={previewRecipient?.key ?? ''}
                        onChange={e => setPreviewKey(e.target.value)}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white max-w-[260px] truncate"
                        aria-label="Preview as recipient"
                      >
                        {deduped.recipients.map(r => (
                          <option key={r.key} value={r.key}>{r.name || r.email} &lt;{r.email}&gt;</option>
                        ))}
                      </select>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate max-w-[45%]" title={renderedSubject}>
                      Subject: <span className="font-medium text-gray-700">{renderedSubject || <em className="text-gray-400">(empty)</em>}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <iframe title="Email preview" srcDoc={renderedHtml} sandbox="" scrolling="no" className="w-full h-full bg-white border-0 block" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
                <p className="text-[11px] text-gray-500">
                  {deduped.recipients.length} {deduped.recipients.length === 1 ? 'address' : 'addresses'}
                  {deduped.duplicates.length > 0 && <> · {deduped.duplicates.length} duplicate{deduped.duplicates.length > 1 ? 's' : ''} merged</>}
                  {deduped.invalid.length > 0 && <> · {deduped.invalid.length} without an email</>}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={requestClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">Cancel</button>
                  <button
                    onClick={goToReview}
                    disabled={!!composeProblem}
                    title={composeProblem ?? 'Review who will receive this'}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Review recipients <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {(deduped.duplicates.length > 0 || deduped.invalid.length > 0) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
                    {deduped.duplicates.length > 0 && (
                      <p><strong>{deduped.duplicates.length}</strong> row{deduped.duplicates.length > 1 ? 's' : ''} shared an address with another row — each inbox gets one email.</p>
                    )}
                    {deduped.invalid.length > 0 && (
                      <p><strong>{deduped.invalid.length}</strong> row{deduped.invalid.length > 1 ? 's have' : ' has'} no email address and will be skipped: {deduped.invalid.slice(0, 5).map(r => r.name || r.key).join(', ')}{deduped.invalid.length > 5 ? '…' : ''}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                    {allVisibleSelected ? 'Deselect' : 'Select'} {recipientSearch ? 'matching' : 'all'}
                  </label>
                  <span className="text-xs text-gray-500">{selectedCount} of {deduped.recipients.length} selected</span>
                  <div className="relative flex-1 min-w-[200px] ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} placeholder="Find a recipient…" className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-full" aria-label="Search recipients" />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white">
                  {visibleRecipients.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">No recipients match.</div>
                  )}
                  {visibleRecipients.map(r => {
                    const on = selected.has(r.key);
                    return (
                      <label key={r.key} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition ${on ? 'bg-white hover:bg-indigo-50/40' : 'bg-gray-50 text-gray-400'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleOne(r.key)} className="w-4 h-4 rounded border-gray-300 text-indigo-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium truncate ${on ? 'text-gray-900' : ''}`}>{r.name || <span className="italic">no name</span>}</div>
                          <div className="text-xs truncate">{r.email}</div>
                        </div>
                        {r.subtitle && <span className="text-[11px] text-gray-500 shrink-0 max-w-[45%] truncate" title={r.subtitle}>{r.subtitle}</span>}
                      </label>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">Emails per batch</span>
                    <input type="number" min={1} max={500} value={batchSize} onChange={e => setBatchSize(Number(e.target.value) || 1)} className={inputCls} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">Pause between batches (seconds)</span>
                    <input type="number" min={0} max={600} value={pauseSeconds} onChange={e => setPauseSeconds(Number(e.target.value) || 0)} className={inputCls} />
                  </label>
                  <p className="sm:col-span-2 text-[11px] text-gray-500">
                    Sends go out a few at a time with a pause between batches so the mail provider treats them as normal traffic. You can cancel at any point; what has already gone out is logged.
                  </p>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
                <button onClick={() => { setArmed(false); setStep('compose'); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">
                  <ArrowLeft className="w-4 h-4" /> Back to compose
                </button>
                {armed ? (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className="text-sm text-gray-700">Send <strong>{selectedCount}</strong> email{selectedCount !== 1 ? 's' : ''} now?</span>
                    <button onClick={() => setArmed(false)} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">Not yet</button>
                    <button
                      onClick={() => startSend(false)}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm"
                      data-testid="bulk-email-confirm"
                    >
                      <SendIcon className="w-4 h-4" /> Yes, send now
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setArmed(true)}
                    disabled={selectedCount === 0}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="bulk-email-send"
                  >
                    <SendIcon className="w-4 h-4" /> Send to {selectedCount} {selectedCount === 1 ? 'person' : 'people'}
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'send' && (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Sent" value={counts.sent} tone="emerald" />
                  <Stat label="Failed" value={counts.failed} tone={counts.failed > 0 ? 'red' : 'gray'} />
                  <Stat label="Remaining" value={counts.pending + counts.sending} tone="indigo" />
                  <Stat label="Skipped" value={counts.skipped} tone="gray" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>
                      {running
                        ? countdown > 0
                          ? `Pausing ${countdown}s before the next batch…`
                          : `Sending… ${counts.sent + counts.failed + counts.skipped} of ${counts.total}`
                        : finished
                          ? counts.failed > 0
                            ? `Done — ${counts.sent} sent, ${counts.failed} failed`
                            : `Done — ${counts.sent} sent`
                          : ''}
                    </span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full transition-all ${counts.failed > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                {abortNotice && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div><strong>Stopped.</strong> {abortNotice} Fix that, then use Retry failed.</div>
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white">
                  {items.map(i => (
                    <div key={i.key} className="flex items-center gap-3 px-4 py-2 text-sm">
                      {i.status === 'sent' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {i.status === 'failed' && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      {i.status === 'skipped' && <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                      {i.status === 'sending' && <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />}
                      {i.status === 'pending' && <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900">{i.name || i.email}</span>
                        <span className="text-gray-500 text-xs ml-2">{i.email}</span>
                      </div>
                      {i.error && <span className="text-[11px] text-red-700 truncate max-w-[50%]" title={i.error}>{i.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
                <p className="text-[11px] text-gray-500">Every sent email is logged with open / click tracking under this run.</p>
                <div className="flex items-center gap-2">
                  {running ? (
                    <button onClick={() => { cancelRef.current = true; }} className="px-4 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition">
                      Stop after current batch
                    </button>
                  ) : (
                    <>
                      {finished && counts.failed > 0 && (
                        <button onClick={() => startSend(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition">
                          <RefreshCw className="w-4 h-4" /> Retry failed ({counts.failed})
                        </button>
                      )}
                      <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition">Close</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'red' | 'indigo' | 'gray' }) {
  const cls = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</div>
      <div className="text-2xl font-bold leading-none mt-1">{value}</div>
    </div>
  );
}
