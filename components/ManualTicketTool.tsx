import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Loader2, User, Search, RefreshCw, QrCode, Mail, FileText } from 'lucide-react';
import { Attendee, AppSettings, Form } from '../types';
import { getAttendees, saveAttendee, getSettings, getForms } from '../services/storageService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';

type Mode = 'existing' | 'new';
type PreviewTab = 'email' | 'ticket';

const defaultSubjectForNew = (formTitle?: string) =>
  `Your Ticket for ${formTitle || 'the event'}`;

const defaultMessageForNew = (formTitle?: string) =>
  `Your ticket has been manually issued for ${formTitle || 'the event'}. Attached is your PDF ticket — please bring it with you (or scan the QR code on your phone) to the event for check-in.`;

const defaultSubjectForResend = (formTitle?: string) =>
  `Your Ticket for ${formTitle || 'the event'}`;

const defaultMessageForResend = (formTitle?: string) =>
  `As requested, here is your ticket for ${formTitle || 'the event'}. Attached is your PDF ticket — please bring it with you (or scan the QR code on your phone) to the event for check-in.`;

/**
 * Mirrors the branded HTML wrapper that `send-ticket-email` applies server-side,
 * so the admin sees the same layout they'll actually send. Kept in sync with
 * `generateEmailTemplate` in supabase/functions/send-ticket-email/index.ts.
 */
function renderEmailPreviewHtml(args: {
  greeting: string;
  message: string;
  attachmentNote?: string;
}) {
  const { greeting, message, attachmentNote } = args;
  return `
    <div style="background-color:#f4f6f9;padding:40px 20px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <div style="max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);background:#fff;">
        <div style="background:linear-gradient(135deg,#1a73e8,#0052cc);padding:40px 40px 30px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:0.5px;">Event Registration</h1>
          <div style="width:50px;height:3px;background:rgba(255,255,255,0.5);margin:16px auto 0;border-radius:2px;"></div>
        </div>
        <div style="padding:40px;">
          <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#1a1a2e;">${escapeHtml(greeting)},</p>
          <div style="font-size:15px;line-height:1.7;color:#444;white-space:pre-wrap;">${escapeHtml(message)}</div>
          ${attachmentNote
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background-color:#f0f7ff;border-radius:8px;border:1px solid #d4e5f7;"><tr><td style="padding:16px 20px;"><p style="margin:0;font-size:14px;color:#1a73e8;font-weight:600;">&#128206; ${escapeHtml(attachmentNote)}</p></td></tr></table>`
      : ''}
        </div>
        <div style="background-color:#f8f9fb;padding:24px 40px;text-align:center;border-top:1px solid #eaedf0;">
          <p style="margin:0;font-size:12px;color:#8c95a1;">This email was sent by SCAGO Event Management.</p>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ManualTicketTool: React.FC = () => {
  const [mode, setMode] = useState<Mode>('existing');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    formId: '',
    ticketType: '',
    paymentStatus: 'free',
    guestType: 'adult',
  });

  // Customizable email fields — driven by the selected attendee / form
  const [customSubject, setCustomSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  // Track whether the user has manually edited the email fields; if yes, stop
  // auto-resetting them when the underlying attendee/form changes, so their
  // edits aren't silently wiped.
  const [subjectEdited, setSubjectEdited] = useState(false);
  const [messageEdited, setMessageEdited] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('email');
  const [ticketPdfUrl, setTicketPdfUrl] = useState<string | null>(null);
  const [ticketPdfLoading, setTicketPdfLoading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const [attendeeData, settingsData, formsData] = await Promise.all([
        getAttendees(),
        getSettings(),
        getForms(),
      ]);
      setAttendees(attendeeData);
      setSettings(settingsData);
      setForms(formsData.filter(f => f.status === 'active'));
    };
    fetch();
  }, []);

  const filteredAttendees = attendees.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedForm = forms.find(f => f.id === formData.formId);
  const ticketField = selectedForm?.fields.find(f => f.type === 'ticket');
  const availableTicketTypes = ticketField?.ticketConfig?.items || [];

  const ticketTypeNames = availableTicketTypes.map(t => t.name).join(',');
  useEffect(() => {
    if (availableTicketTypes.length > 0 && !formData.ticketType) {
      setFormData(prev => ({ ...prev, ticketType: availableTicketTypes[0].name }));
    }
  }, [ticketTypeNames, formData.ticketType]);

  // --- Preview attendee: what we show in the PDF preview + feed into emails ---
  const previewAttendee: Attendee | null = useMemo(() => {
    if (mode === 'existing') return selectedAttendee;
    if (!formData.formId) return null;
    const name = `${formData.firstName} ${formData.lastName}`.trim() || 'Attendee Name';
    const id = 'PREVIEW-ID';
    return {
      id,
      formId: formData.formId,
      formTitle: selectedForm?.title || 'Manual Entry',
      name,
      email: formData.email || 'preview@example.com',
      ticketType: formData.ticketType || 'General Admission',
      registeredAt: new Date().toISOString(),
      qrPayload: JSON.stringify({ id, formId: formData.formId, action: 'checkin' }),
      paymentStatus: formData.paymentStatus as any,
      isPrimary: true,
      guestType: formData.guestType as any,
    };
  }, [mode, selectedAttendee, formData, selectedForm]);

  const previewForm: Form | undefined = useMemo(() => {
    if (mode === 'new') return selectedForm;
    if (!selectedAttendee) return undefined;
    return forms.find(f => f.id === selectedAttendee.formId);
  }, [mode, selectedAttendee, selectedForm, forms]);

  // --- Default subject/message whenever the target attendee/form changes ---
  const defaultSubject = mode === 'existing'
    ? defaultSubjectForResend(previewAttendee?.formTitle)
    : defaultSubjectForNew(selectedForm?.title);
  const defaultMessage = mode === 'existing'
    ? defaultMessageForResend(previewAttendee?.formTitle)
    : defaultMessageForNew(selectedForm?.title);

  useEffect(() => {
    if (!subjectEdited) setCustomSubject(defaultSubject);
  }, [defaultSubject, subjectEdited]);
  useEffect(() => {
    if (!messageEdited) setCustomMessage(defaultMessage);
  }, [defaultMessage, messageEdited]);

  // --- Regenerate the ticket-preview PDF whenever the target attendee changes ---
  useEffect(() => {
    let cancelled = false;
    const regenerate = async () => {
      if (!previewAttendee || !settings) {
        setTicketPdfUrl(null);
        return;
      }
      setTicketPdfLoading(true);
      try {
        const doc = await generateTicketPDF(previewAttendee, settings, previewForm);
        if (cancelled) return;
        const url = doc.output('bloburl').toString();
        setTicketPdfUrl(prev => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        console.error('Failed to generate ticket preview', e);
        if (!cancelled) setTicketPdfUrl(null);
      } finally {
        if (!cancelled) setTicketPdfLoading(false);
      }
    };
    regenerate();
    return () => { cancelled = true; };
    // Only regenerate on fields that actually change the rendered ticket.
  }, [
    settings,
    previewForm?.id,
    previewAttendee?.id,
    previewAttendee?.name,
    previewAttendee?.email,
    previewAttendee?.ticketType,
    previewAttendee?.paymentStatus,
    previewAttendee?.guestType,
    previewAttendee?.qrPayload,
  ]);

  // Clean up the blob URL on unmount — use a ref so the closure reads the
  // *current* url at teardown, not the null value captured at mount time.
  const ticketPdfUrlRef = useRef<string | null>(null);
  ticketPdfUrlRef.current = ticketPdfUrl;
  useEffect(() => () => {
    const u = ticketPdfUrlRef.current;
    if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
  }, []);

  const resetEmailToDefaults = () => {
    setSubjectEdited(false);
    setMessageEdited(false);
    setCustomSubject(defaultSubject);
    setCustomMessage(defaultMessage);
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.formId || !formData.ticketType) return;
    if (!customSubject.trim() || !customMessage.trim()) {
      setSuccessMsg('failed: subject and message are required');
      return;
    }

    setLoading(true);
    setSuccessMsg('');

    const id = crypto.randomUUID();
    const newAttendee: Attendee = {
      id,
      formId: formData.formId,
      formTitle: selectedForm?.title || 'Manual Entry',
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      email: formData.email,
      ticketType: formData.ticketType,
      registeredAt: new Date().toISOString(),
      qrPayload: JSON.stringify({ id, formId: formData.formId, action: 'checkin' }),
      paymentStatus: formData.paymentStatus as any,
      isPrimary: true,
      guestType: formData.guestType as any,
    };

    // Save first; if this fails the attendee was never created so we stop.
    try {
      await saveAttendee(newAttendee);
    } catch (err: any) {
      console.error(err);
      setSuccessMsg(`failed: could not save attendee: ${err?.message || 'unknown error'}`);
      setLoading(false);
      return;
    }

    // Attendee exists in the DB from this point — refresh the list and flip
    // the UI to "existing" mode so the admin can see / resend, even if the
    // email step fails below.
    const updatedAttendees = await getAttendees();
    setAttendees(updatedAttendees);
    setSelectedAttendee(newAttendee);
    setMode('existing');
    setFormData(prev => ({ ...prev, firstName: '', lastName: '', email: '' }));

    if (settings && settings.smtpUser && settings.smtpPass) {
      try {
        const doc = await generateTicketPDF(newAttendee, settings, selectedForm!);
        await sendTicketEmail(settings, {
          to: formData.email,
          subject: customSubject,
          name: newAttendee.name,
          message: customMessage,
          attachments: [{
            filename: `${newAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
            content: arrayBufferToBase64(doc.output('arraybuffer')),
            contentType: 'application/pdf',
          }],
        });
        setSuccessMsg('Ticket generated and email dispatched successfully');
      } catch (err: any) {
        console.error(err);
        setSuccessMsg(`failed: ticket saved but email failed — ${err?.message || 'unknown error'}. Use "Send Ticket Email" to retry.`);
      }
    } else {
      setSuccessMsg('Ticket generated (email bypassed — SMTP not configured)');
    }

    resetEmailToDefaults();
    setLoading(false);
  };

  const handleResend = async () => {
    if (!selectedAttendee) return;
    if (!customSubject.trim() || !customMessage.trim()) {
      setSuccessMsg('failed: subject and message are required');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    try {
      if (!settings || !settings.smtpUser || !settings.smtpPass) {
        setSuccessMsg('Cannot send email - SMTP not configured.');
        return;
      }
      const form = previewForm || (await getForms()).find(f => f.id === selectedAttendee.formId);
      if (!form) throw new Error('Form not found for this ticket.');
      const doc = await generateTicketPDF(selectedAttendee, settings, form);
      await sendTicketEmail(settings, {
        to: selectedAttendee.email,
        subject: customSubject,
        name: selectedAttendee.name,
        message: customMessage,
        attachments: [{
          filename: `${selectedAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
          content: arrayBufferToBase64(doc.output('arraybuffer')),
          contentType: 'application/pdf',
        }],
      });
      setSuccessMsg(`Email dispatched successfully to ${selectedAttendee.email}`);
    } catch (err: any) {
      console.error(err);
      setSuccessMsg(`failed: ${err?.message || 'error sending email'}`);
    } finally {
      setLoading(false);
    }
  };

  const emailPreviewHtml = useMemo(() => {
    const greeting = `Hello ${previewAttendee?.name || formData.firstName || 'Guest'}`;
    return renderEmailPreviewHtml({
      greeting,
      message: customMessage || '(message body is empty)',
      attachmentNote: 'Attachment included — please review the PDF.',
    });
  }, [customMessage, previewAttendee, formData.firstName]);

  const canSend = mode === 'existing'
    ? !!selectedAttendee
    : !!(formData.formId && formData.firstName && formData.lastName && formData.email && formData.ticketType);

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        {/* Mode Toggle */}
        <div className="bg-white p-1 rounded-lg border border-gray-200 inline-flex shadow-sm">
          <button
            type="button"
            onClick={() => { setMode('existing'); setSuccessMsg(''); resetEmailToDefaults(); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${mode === 'existing' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Existing Attendee
          </button>
          <button
            type="button"
            onClick={() => { setMode('new'); setSelectedAttendee(null); setSuccessMsg(''); resetEmailToDefaults(); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${mode === 'new' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Issue New Ticket
          </button>
        </div>

        {/* Existing User Search */}
        {mode === 'existing' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[420px] flex flex-col">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-600" /> Find Registered User
            </h3>
            <input
              type="text"
              placeholder="Search by name or email..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {filteredAttendees.map(att => (
                <div
                  key={att.id}
                  onClick={() => { setSelectedAttendee(att); setSuccessMsg(''); resetEmailToDefaults(); }}
                  className={`p-3 rounded-lg border cursor-pointer transition ${selectedAttendee?.id === att.id
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                    : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  <p className="font-medium text-gray-900">{att.name}</p>
                  <p className="text-xs text-gray-500">{att.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{att.formTitle}</span>
                    {att.isTest && <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded">TEST</span>}
                  </div>
                </div>
              ))}
              {filteredAttendees.length === 0 && <p className="text-center text-gray-400 mt-8">No attendees found.</p>}
            </div>
          </div>
        )}

        {/* New User Form */}
        {mode === 'new' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600" /> Manual Entry Details
            </h3>
            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Event Form</label>
                <select
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  value={formData.formId}
                  onChange={e => {
                    const newFormId = e.target.value;
                    const newForm = forms.find(f => f.id === newFormId);
                    const newTicketField = newForm?.fields.find(f => f.type === 'ticket');
                    const newTicketTypes = newTicketField?.ticketConfig?.items || [];
                    setFormData({
                      ...formData,
                      formId: newFormId,
                      ticketType: newTicketTypes.length > 0 ? newTicketTypes[0].name : 'Manual Issue',
                    });
                  }}
                >
                  <option value="" disabled>Select a form...</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>

              {formData.formId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Type</label>
                    {availableTicketTypes.length > 0 ? (
                      <select
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        value={formData.ticketType}
                        onChange={e => setFormData({ ...formData, ticketType: e.target.value })}
                      >
                        {availableTicketTypes.map(t => <option key={t.name} value={t.name}>{t.name} ({t.seats} seats)</option>)}
                      </select>
                    ) : (
                      <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        value={formData.ticketType} onChange={e => setFormData({ ...formData, ticketType: e.target.value })}
                        placeholder="e.g. Manual Issue" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      value={formData.paymentStatus}
                      onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}
                    >
                      <option value="free">Free / Comped</option>
                      <option value="paid">Paid Manually</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input required type="email" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>

              {ticketField?.ticketConfig?.enableAgeGroups && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guest Type</label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={formData.guestType === 'adult'} onChange={() => setFormData({ ...formData, guestType: 'adult' })} className="text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                      <span className="text-sm text-gray-700">Adult</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={formData.guestType === 'child'} onChange={() => setFormData({ ...formData, guestType: 'child' })} className="text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                      <span className="text-sm text-gray-700">Child</span>
                    </label>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Email composer — shared by both modes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" /> Email Message
            </h3>
            {(subjectEdited || messageEdited) && (
              <button
                type="button"
                onClick={resetEmailToDefaults}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Reset to default
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              value={customSubject}
              onChange={e => { setCustomSubject(e.target.value); setSubjectEdited(true); }}
              placeholder="Subject line"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Message body</label>
            <textarea
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              value={customMessage}
              onChange={e => { setCustomMessage(e.target.value); setMessageEdited(true); }}
              placeholder="Message body the recipient will see"
            />
          </div>

          <button
            type="button"
            onClick={mode === 'existing' ? handleResend : handleCreateNew as any}
            disabled={loading || !canSend}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : (mode === 'existing' ? <Send className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />)}
            {mode === 'existing' ? 'Send Ticket Email' : 'Generate & Dispatch Ticket'}
          </button>

          {successMsg && (
            <div className={`p-3 rounded-lg text-sm font-medium ${successMsg.startsWith('failed')
              ? 'bg-amber-50 text-amber-800 border border-amber-100'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}`}>
              {successMsg.replace(/^failed:\s*/, '')}
            </div>
          )}
        </div>
      </div>

      {/* Preview Panel */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-4 pt-3 flex gap-1">
          <button
            type="button"
            onClick={() => setPreviewTab('email')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md flex items-center gap-2 transition border-b-2 ${previewTab === 'email'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            <Mail className="w-4 h-4" /> Email Preview
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab('ticket')}
            className={`px-4 py-2 text-sm font-medium rounded-t-md flex items-center gap-2 transition border-b-2 ${previewTab === 'ticket'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            <FileText className="w-4 h-4" /> Ticket PDF
          </button>
        </div>

        <div className="flex-1 min-h-[620px] bg-gray-100 flex flex-col">
          {previewTab === 'email' && (
            previewAttendee ? (
              <iframe
                title="Email preview"
                srcDoc={emailPreviewHtml}
                sandbox=""
                className="w-full flex-1 bg-white"
              />
            ) : (
              <EmptyPreview message={mode === 'existing' ? 'Select an attendee to preview the email.' : 'Fill the form to preview the email.'} />
            )
          )}

          {previewTab === 'ticket' && (
            ticketPdfUrl ? (
              <div className="relative flex-1 flex flex-col">
                {ticketPdfLoading && (
                  <div className="absolute top-2 right-2 z-10 bg-white/90 px-2 py-1 rounded text-[11px] text-gray-600 flex items-center gap-1 shadow-sm">
                    <Loader2 className="w-3 h-3 animate-spin" /> Rebuilding…
                  </div>
                )}
                <iframe
                  title="Ticket PDF preview"
                  src={ticketPdfUrl}
                  className="w-full flex-1 bg-white"
                />
              </div>
            ) : ticketPdfLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Generating ticket preview…
              </div>
            ) : (
              <EmptyPreview message={mode === 'existing' ? 'Select an attendee to preview the ticket.' : 'Fill the form to preview the ticket.'} />
            )
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyPreview: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-8">
    <div>
      <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
        <QrCode className="w-10 h-10 text-gray-300" />
      </div>
      <p>{message}</p>
    </div>
  </div>
);

export default ManualTicketTool;
