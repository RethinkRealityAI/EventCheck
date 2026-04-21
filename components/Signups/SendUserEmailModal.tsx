import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send as SendIcon, Loader2 } from 'lucide-react';
import { sendTicketEmail } from '../../services/smtpService';
import type { PortalUser } from '../../services/storageService';
import type { AppSettings, Form } from '../../types';

type TemplateKey = 'reminder' | 'invitation' | 'blank';

interface Props {
  user: PortalUser;
  settings: AppSettings;
  forms: Form[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Structured email fields
// ---------------------------------------------------------------------------
//
// We deliberately DO NOT expose raw HTML in this modal. Admins edit
// friendly structured fields (heading, message, CTA label + URL, footer
// note); on render / send we merge them into the baseline GANSID email
// shell. The raw-HTML templates themselves are edited in
// Settings → Email tab so a designer can safely restyle the shell
// without risking that a send operator pastes broken markup at 2 AM.

interface EmailFields {
  heading: string;
  message: string; // plain-text; blank lines → paragraph breaks on render
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

// Stock structured defaults per template. The RAW HTML defaults in
// app_settings are still the source of truth for tickets/confirmations;
// these are the human-editable analogues used by this modal only.
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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function applyPlaceholders(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? '');
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain-text message → HTML. Blank lines become paragraph breaks; single
// newlines inside a paragraph become <br>. Everything is HTML-escaped so
// operators can't accidentally inject tags.
function messageToHtml(plain: string): string {
  const trimmed = (plain || '').trim();
  if (!trimmed) return '';
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map(p => escapeHtml(p.trim()).replace(/\n/g, '<br>'))
    .filter(Boolean);
  return paragraphs.map(p => `<p>${p}</p>`).join('\n      ');
}

// Baseline GANSID email HTML. Colors, header image, footer copy, gradients
// are all the standard across authentication / signup / ticketing so every
// email the attendee receives looks consistent.
function renderEmailHtml(fields: EmailFields, vars: Record<string, string>): string {
  const heading = escapeHtml(applyPlaceholders(fields.heading || '', vars));
  const bodyHtml = messageToHtml(applyPlaceholders(fields.message || '', vars));
  const ctaLabel = escapeHtml(applyPlaceholders(fields.ctaLabel || '', vars));
  const ctaUrl = applyPlaceholders(fields.ctaUrl || '', vars);
  const footerNote = escapeHtml(applyPlaceholders(fields.footerNote || '', vars));

  const ctaBlock = ctaLabel && ctaUrl
    ? `<p style="text-align: center;"><a href="${escapeHtml(ctaUrl)}" class="button">${ctaLabel}</a></p>`
    : '';
  const footerNoteBlock = footerNote
    ? `<p style="font-size: 13px; opacity: 0.6;">${footerNote}</p>`
    : '';
  const headingBlock = heading ? `<h2>${heading}</h2>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background: #f9f9f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1c1c; }
    .container { max-width: 560px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .body { padding: 40px 32px; }
    .body h2 { font-size: 22px; margin: 0 0 16px; color: #1a1c1c; }
    .body p { font-size: 16px; line-height: 1.6; color: #1a1c1c; opacity: 0.8; margin: 0 0 24px; }
    .button { display: inline-block; background: linear-gradient(135deg, #ba0028, #E0243C); color: white !important; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .footer { padding: 28px 32px; background: linear-gradient(135deg, #ba0028 0%, #E0243C 60%, #2260a1 100%); text-align: center; font-size: 12px; color: rgba(255,255,255,0.92); }
    .footer a { color: white; text-decoration: underline; }
    .footer-brand { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: white; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://gticuvgclbvhwvpzkuez.supabase.co/storage/v1/object/public/portal-assets/email/registration-email-header.png" alt="GANSID Congress 2026" width="560" style="display:block; width:100%; max-width:560px; height:auto; border:0;">
    <div class="body">
      ${headingBlock}
      ${bodyHtml}
      ${ctaBlock}
      ${footerNoteBlock}
    </div>
    <div class="footer">
      <div class="footer-brand">GANSID '26</div>
      Hyderabad, India &middot; October 23–25, 2026<br><br>
      Questions? <a href="mailto:congress@inheritedblooddisorders.world">congress@inheritedblooddisorders.world</a>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SendUserEmailModal({ user, settings, forms, onClose }: Props) {
  const [template, setTemplate] = useState<TemplateKey>(
    user.draft ? 'reminder' : user.hasPaidTicket ? 'blank' : 'invitation',
  );
  const [subject, setSubject] = useState('');
  const [fields, setFields] = useState<EmailFields>(EMPTY_FIELDS);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const vars = useMemo<Record<string, string>>(() => {
    const origin = window.location.origin;
    const draftForm = forms.find(f => f.id === user.draft?.formId);
    const ticketForm = forms.find(f => f.id === user.mostRecentTicketFormId);
    const eventForm = draftForm || ticketForm || forms[0];
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
  }, [user, forms]);

  const seedTemplate = (key: TemplateKey) => {
    const d = DEFAULTS[key];
    setSubject(d.subject);
    setFields({ ...d.fields });
  };

  // Initial seed on first render only
  useEffect(() => { seedTemplate(template); /* eslint-disable-next-line */ }, []);

  const handleTemplateChange = (key: TemplateKey) => {
    setTemplate(key);
    seedTemplate(key);
  };

  // Rendered HTML — recomputed on every field change for live preview + used at send time.
  const renderedHtml = useMemo(() => renderEmailHtml(fields, vars), [fields, vars]);
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
      await sendTicketEmail(settings, {
        to: user.email,
        subject: renderedSubject,
        name: user.fullName || 'there',
        message: renderedHtml, // full HTML shell, not just the inner copy
      });
      setSent(true);
      setTimeout(() => { onClose(); }, 1200);
    } catch (e: any) {
      setError(e?.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const setField = <K extends keyof EmailFields>(k: K, v: EmailFields[K]) =>
    setFields(prev => ({ ...prev, [k]: v }));

  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm';

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Send email</h2>
            <p className="text-xs text-gray-500">
              To <span className="font-medium">{user.fullName || user.email}</span>{' '}
              <span className="text-gray-400">&lt;{user.email}&gt;</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Two-column body: editor left, live preview right */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 overflow-hidden">
          {/* Editor */}
          <div className="lg:col-span-2 overflow-y-auto px-6 py-5 space-y-4 border-r border-gray-100">
            <div>
              <label className={labelCls}>Template</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  ['reminder', 'Registration Reminder'],
                  ['invitation', 'Invitation / Marketing'],
                  ['blank', 'Blank / Custom'],
                ] as Array<[TemplateKey, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => handleTemplateChange(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${template === key ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Edit the friendly fields below — the branded shell (header image, colours, footer)
                is applied automatically. To customise the shell itself, use <strong>Settings →
                Email templates</strong>.
              </p>
            </div>

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

            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Placeholders (resolved on send): <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{event}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{resume_url}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{signup_url}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{step}}'}</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{total_steps}}'}</code>.
              </p>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Live preview */}
          <div className="lg:col-span-3 bg-gray-100 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Live preview</div>
              <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={renderedSubject}>
                Subject: <span className="font-medium text-gray-700">{renderedSubject || <em className="text-gray-400">(empty)</em>}</span>
              </div>
            </div>
            <iframe
              title="Email preview"
              srcDoc={renderedHtml}
              sandbox=""
              className="flex-1 w-full bg-white border-0"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition ${sent ? 'bg-emerald-600' : sending ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {sent ? 'Sent!' : sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><SendIcon className="w-4 h-4" /> Send</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
