import React, { useMemo, useState } from 'react';
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

function applyPlaceholders(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? '');
  }
  return out;
}

export default function SendUserEmailModal({ user, settings, forms, onClose }: Props) {
  const [template, setTemplate] = useState<TemplateKey>(
    user.draft ? 'reminder' : user.hasPaidTicket ? 'blank' : 'invitation',
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Placeholder variables resolved for THIS user. Used for preview + final send.
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

  // Seed subject/body whenever the template selection changes so the admin sees
  // the admin-editable default from Settings, then can tweak per-send if needed.
  const seedTemplate = (key: TemplateKey) => {
    if (key === 'reminder') {
      setSubject(applyPlaceholders(settings.emailReminderSubject || '', vars));
      setBody(applyPlaceholders(settings.emailReminderBody || '', vars));
    } else if (key === 'invitation') {
      setSubject(applyPlaceholders(settings.emailInvitationSubject || '', vars));
      setBody(applyPlaceholders(settings.emailInvitationBody || '', vars));
    } else {
      setSubject('');
      setBody('');
    }
  };

  // Initial seed on first render
  React.useEffect(() => { seedTemplate(template); /* eslint-disable-next-line */ }, []);

  const handleTemplateChange = (key: TemplateKey) => {
    setTemplate(key);
    seedTemplate(key);
  };

  const handleSend = async () => {
    setError('');
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are both required.');
      return;
    }
    setSending(true);
    try {
      await sendTicketEmail(settings, {
        to: user.email,
        subject: applyPlaceholders(subject, vars),
        name: user.fullName || 'there',
        message: applyPlaceholders(body, vars),
      });
      setSent(true);
      setTimeout(() => { onClose(); }, 1200);
    } catch (e: any) {
      setError(e?.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  // Render via portal so ancestor `backdrop-filter`/`transform` containers
  // (common in the admin dashboard surfaces) don't clip the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
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

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {/* Template selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Template</label>
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
            <p className="text-[11px] text-gray-500 mt-1.5">
              Placeholders are resolved on send — you can tweak the copy below.
              Available: <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{event}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{resume_url}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{signup_url}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{step}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{total_steps}}'}</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Body (HTML)
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono text-xs leading-relaxed"
            />
          </div>

          {/* Live preview */}
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Preview</div>
            <div
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: applyPlaceholders(body, vars) || '<em style="color:#9ca3af;">Body is empty</em>' }}
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

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
