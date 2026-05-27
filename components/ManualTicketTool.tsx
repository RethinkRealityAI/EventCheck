import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Loader2, User, Search, RefreshCw, QrCode, Mail, FileText, Users, Heart } from 'lucide-react';
import { Attendee, AppSettings, Form } from '../types';
import { getAttendees, saveAttendee, getSettings, getForms, updateAttendee } from '../services/storageService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';
import { computeDonationPool } from '../utils/donationPool';
import { CURRENT_SITE } from '../config/sites';
import {
  type AttendeeCategory,
  getCategoryOptionsForSite,
  CATEGORY_META,
} from '../utils/attendeeCategories';

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
  // Donated-seat claim flag for the new-ticket path. When true, every issued
  // ticket (primary + placeholders for a multi-ticket batch) is marked as
  // a donated-seat claim and the dashboard pool decrements by the batch size.
  // Forces paymentStatus to 'free' since the recipient doesn't pay for a
  // donated seat.
  const [markAsDonatedClaim, setMarkAsDonatedClaim] = useState(false);
  // Role/category tag — drives the dashboard pill, GuestSidebar badge, and
  // 3D scene label. Stored in attendees.attendee_category. "speaker" is the
  // legacy GANSID-only value and ALSO writes guest_type='speaker' for
  // backward compat with the existing Speakers tab + promo flow.
  const [attendeeCategory, setAttendeeCategory] = useState<AttendeeCategory | ''>('');
  const categoryOptions = getCategoryOptionsForSite(CURRENT_SITE.portalEnabled);

  // Multi-ticket controls. Useful when an admin needs to manually issue a
  // full table (e.g. 8 seats) to one buyer: each seat becomes its own
  // scannable attendee row, and all PDFs go out in a single email to the
  // buyer. Defaults to off; auto-enables and sets the quantity when the
  // selected ticket type has `seats > 1` (i.e. it's a table-style ticket).
  const [multiTicketEnabled, setMultiTicketEnabled] = useState(false);
  const [ticketQuantity, setTicketQuantity] = useState(1);

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

  // Live donated-seat pool computed from the in-memory attendee list. Drives
  // the pool badge + the new-mode "donated claim" checkbox copy.
  const donationPool = useMemo(() => computeDonationPool(attendees), [attendees]);
  const ticketField = selectedForm?.fields.find(f => f.type === 'ticket');
  const availableTicketTypes = ticketField?.ticketConfig?.items || [];
  const selectedTicketItem = availableTicketTypes.find(t => t.name === formData.ticketType);
  const seatsForSelectedTicket = (selectedTicketItem?.seats && selectedTicketItem.seats > 1)
    ? selectedTicketItem.seats
    : 0;

  // Whenever the selected ticket type changes, auto-enable the multi-ticket
  // flow with the right default quantity for table-style tickets. The admin
  // can still uncheck it or override the quantity. We don't override after
  // they've started editing — gate on whether the selected ticket actually
  // has multi-seat semantics.
  useEffect(() => {
    if (seatsForSelectedTicket > 1) {
      setMultiTicketEnabled(true);
      setTicketQuantity(seatsForSelectedTicket);
    } else {
      setMultiTicketEnabled(false);
      setTicketQuantity(1);
    }
  }, [seatsForSelectedTicket]);

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

    // Resolve the effective quantity. Multi-ticket mode is for the
    // "send a full table to one buyer" case: we create N attendee rows so
    // each seat has its own QR (one for the buyer + N-1 placeholder guests
    // linked back to them). All PDFs are then bundled into a single email
    // to the buyer's address.
    const requestedQty = multiTicketEnabled ? Math.max(1, Math.min(20, Math.floor(ticketQuantity || 1))) : 1;
    const buyerName = `${formData.firstName} ${formData.lastName}`.trim();

    // Block over-claiming the donated pool. Each issued ticket in the batch
    // counts as one claim, so a 5-ticket multi-batch needs 5 available seats.
    if (markAsDonatedClaim && donationPool.available < requestedQty) {
      setSuccessMsg(
        `failed: only ${donationPool.available} donated seat${donationPool.available !== 1 ? 's' : ''} available, but ${requestedQty} requested. Uncheck the donated-seat option or reduce quantity.`,
      );
      return;
    }
    const primaryId = crypto.randomUUID();
    // Donated-seat claims are always free to the recipient. Honor the form's
    // selected payment status only when this is NOT a donated claim.
    const effectivePaymentStatus = markAsDonatedClaim ? 'free' : (formData.paymentStatus as any);
    const primary: Attendee = {
      id: primaryId,
      formId: formData.formId,
      formTitle: selectedForm?.title || 'Manual Entry',
      name: buyerName,
      email: formData.email,
      ticketType: formData.ticketType,
      registeredAt: new Date().toISOString(),
      qrPayload: JSON.stringify({ id: primaryId, formId: formData.formId, action: 'checkin' }),
      paymentStatus: effectivePaymentStatus,
      isPrimary: true,
      // Role/category tag (attendee_category column). Speaker is legacy
      // and ALSO stamps guest_type='speaker' so the existing Speakers tab
      // + promo-stamped speaker rows behave identically. The other five
      // categories only write to attendee_category.
      guestType: (attendeeCategory === 'speaker' ? 'speaker' : formData.guestType) as any,
      attendeeCategory: attendeeCategory || null,
      isDonatedSeatClaim: markAsDonatedClaim,
    };

    // Each additional ticket is a placeholder guest row tied back to the
    // primary so the dashboard can see "John Smith — table host (8 seats)"
    // and each seat is independently scannable and claimable. Names follow
    // the "OrgName - Guest Ticket #N" convention used by the public table
    // purchase path so the existing claim UX picks them up without
    // changes.
    const placeholderGuests: Attendee[] = [];
    for (let i = 1; i < requestedQty; i++) {
      const guestId = crypto.randomUUID();
      placeholderGuests.push({
        id: guestId,
        formId: formData.formId,
        formTitle: selectedForm?.title || 'Manual Entry',
        name: `${buyerName || 'Table'} - Guest Ticket #${i}`,
        email: `guest-${guestId}@placeholder.invalid`,
        ticketType: `Guest of ${buyerName || 'table host'}`,
        registeredAt: new Date().toISOString(),
        qrPayload: JSON.stringify({ id: guestId, formId: formData.formId, action: 'checkin' }),
        paymentStatus: 'free',
        isPrimary: false,
        primaryAttendeeId: primaryId,
        guestType: 'pending-claim',
        // Each placeholder counts as its own donated-seat claim — issuing a
        // 5-ticket batch as donated consumes 5 from the pool, matching the
        // pre-save validation above.
        isDonatedSeatClaim: markAsDonatedClaim,
      });
    }

    // Save attendees first; if any save fails we surface it and stop so the
    // admin can decide whether to retry. We persist sequentially rather
    // than in parallel so a mid-batch failure leaves a coherent partial
    // state (primary + however many guests succeeded).
    try {
      await saveAttendee(primary);
      for (const g of placeholderGuests) {
        await saveAttendee(g);
      }
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
    setSelectedAttendee(primary);
    setMode('existing');
    setFormData(prev => ({ ...prev, firstName: '', lastName: '', email: '' }));

    if (settings && settings.smtpUser && settings.smtpPass) {
      try {
        // Generate PDF for the primary plus each placeholder. Placeholders
        // get a registration URL so the recipient can self-claim their
        // seat — the PDF generator now suppresses the registration QR for
        // anyone who's already claimed, so this is safe.
        const origin = window.location.origin;
        const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
        const primaryDoc = await generateTicketPDF(primary, settings, selectedForm!);
        attachments.push({
          filename: `${primary.name.replace(/[^a-zA-Z0-9 ]/g, '_') || 'Ticket'}_Ticket.pdf`,
          content: arrayBufferToBase64(primaryDoc.output('arraybuffer')),
          contentType: 'application/pdf',
        });
        for (let i = 0; i < placeholderGuests.length; i++) {
          const g = placeholderGuests[i];
          const claimUrl = `${origin}/#/form/${formData.formId}?ref=${g.id}`;
          const guestDoc = await generateTicketPDF(g, settings, selectedForm!, claimUrl);
          attachments.push({
            filename: `Guest_${i + 2}_Ticket.pdf`,
            content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
            contentType: 'application/pdf',
          });
        }
        await sendTicketEmail(settings, {
          to: formData.email,
          subject: customSubject,
          name: primary.name,
          title: selectedForm?.title || undefined,
          message: customMessage,
          attachments,
        });
        // Stamp lastTicketEmailAt across the whole batch. Best-effort —
        // errors here don't undo the send.
        const stampedAt = new Date().toISOString();
        try {
          await Promise.all([
            updateAttendee(primary.id, { lastTicketEmailAt: stampedAt }),
            ...placeholderGuests.map(g => updateAttendee(g.id, { lastTicketEmailAt: stampedAt })),
          ]);
        } catch (err) {
          console.warn('Failed to stamp lastTicketEmailAt on some rows', err);
        }
        if (requestedQty > 1) {
          setSuccessMsg(`${requestedQty} tickets generated and emailed to ${formData.email}`);
        } else {
          setSuccessMsg('Ticket generated and email dispatched successfully');
        }
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
        title: form.title || undefined,
        message: customMessage,
        attachments: [{
          filename: `${selectedAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
          content: arrayBufferToBase64(doc.output('arraybuffer')),
          contentType: 'application/pdf',
        }],
      });
      // Stamp send-time so the dashboard reflects "Sent". Errors here are
      // metadata-only; the user already got the email.
      try {
        await updateAttendee(selectedAttendee.id, { lastTicketEmailAt: new Date().toISOString() });
      } catch (err) {
        console.warn('Failed to stamp lastTicketEmailAt for resend', err);
      }
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
        {/* Donated-seat pool badge — always visible at the top so admins
            issuing tickets know how many free claim slots are available,
            even before opening the new-ticket form. */}
        {donationPool.donated > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50/40 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Heart className="w-4 h-4 fill-emerald-600" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Donated Seats Pool</div>
                <div className="text-sm font-bold text-emerald-900">
                  {donationPool.available} available
                  <span className="font-medium text-emerald-700/70"> · {donationPool.claimed}/{donationPool.donated} claimed</span>
                </div>
              </div>
            </div>
            {donationPool.available > 0 && (
              <span className="hidden sm:inline-flex shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white">
                Ready to issue
              </span>
            )}
          </div>
        )}

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

              {/* Multi-ticket controls — for table buyers. When the selected
                  ticket type carries multiple seats (e.g. a "Table of 8") we
                  auto-enable this and prefill the quantity, so the admin can
                  issue a full table to one buyer in one shot. Otherwise it's
                  an explicit opt-in. */}
              {formData.formId && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiTicketEnabled}
                      onChange={e => {
                        const enabled = e.target.checked;
                        setMultiTicketEnabled(enabled);
                        if (!enabled) {
                          setTicketQuantity(1);
                        } else if (ticketQuantity < 2) {
                          setTicketQuantity(seatsForSelectedTicket > 1 ? seatsForSelectedTicket : 2);
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Send multiple tickets to this guest
                      </div>
                      <div className="text-xs text-indigo-700/80 mt-0.5">
                        {seatsForSelectedTicket > 1
                          ? `This ticket type covers ${seatsForSelectedTicket} seats — issuing ${seatsForSelectedTicket} scannable tickets, all emailed to the buyer.`
                          : 'Issues N scannable ticket rows to the same buyer. Useful when one person is paying for a group.'}
                      </div>
                    </div>
                  </label>
                  {multiTicketEnabled && (
                    <div className="mt-3 flex items-center gap-3 pl-7">
                      <label className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={ticketQuantity}
                        onChange={e => setTicketQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                        className="w-20 px-2 py-1.5 border border-indigo-200 rounded-md text-sm text-center outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                      <span className="text-xs text-indigo-600">{ticketQuantity > 1 ? 'tickets' : 'ticket'} (max 20)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Donated-seat claim toggle — sits above the buyer fields so
                  the admin can opt in before typing the recipient's name. The
                  hint copy reflects the live pool so they know whether the
                  pool has room for the requested batch. */}
              {formData.formId && (
                <div
                  className={`rounded-lg border p-3 transition-all ${
                    markAsDonatedClaim ? 'border-emerald-300 bg-emerald-50/70' : 'border-emerald-200 bg-emerald-50/30'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsDonatedClaim}
                      onChange={e => setMarkAsDonatedClaim(e.target.checked)}
                      disabled={donationPool.available <= 0 && !markAsDonatedClaim}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-emerald-900 flex items-center gap-1.5">
                        <Heart className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                        Mark as donated seat claim
                      </div>
                      <div className="text-xs text-emerald-800/80 mt-0.5">
                        {donationPool.donated === 0 ? (
                          <>No donated seats pledged yet. Once a donor registers and donates seats, you'll be able to issue them here.</>
                        ) : donationPool.available <= 0 ? (
                          <>All <strong>{donationPool.donated}</strong> donated seats are already claimed ({donationPool.claimed}/{donationPool.donated}).</>
                        ) : (
                          <>
                            <strong>{donationPool.available}</strong> donated seat{donationPool.available !== 1 ? 's' : ''} available ({donationPool.claimed}/{donationPool.donated} claimed).
                            {markAsDonatedClaim && (multiTicketEnabled ? ticketQuantity > 1 : false) && (
                              <> This batch will consume <strong>{ticketQuantity}</strong>.</>
                            )}
                            {markAsDonatedClaim && ' Ticket will be issued as free.'}
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Category dropdown — tags the issued row with an
                  attendee_category for the dashboard pill, GuestSidebar
                  badge, and 3D scene label. Speaker is GANSID-only and
                  also stamps guest_type='speaker' for the legacy Speakers
                  tab + promo flow. */}
              {formData.formId && (
                <div className={`rounded-lg border p-3 transition-all ${attendeeCategory ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                  <label className="block">
                    <div className="text-sm font-semibold text-slate-800 mb-0.5">
                      Attendee category <span className="text-xs font-normal text-slate-500">(optional)</span>
                    </div>
                    <div className="text-xs text-slate-600 mb-2">
                      Tags this ticket with a role pill that surfaces on the dashboard, attendee modal, and seating configurator. Leave as "None" for regular attendees.
                    </div>
                    <select
                      value={attendeeCategory}
                      onChange={e => setAttendeeCategory((e.target.value || '') as AttendeeCategory | '')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">— None (regular attendee) —</option>
                      {categoryOptions.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.icon}  {c.label}
                        </option>
                      ))}
                    </select>
                    {attendeeCategory && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_META[attendeeCategory].pillBg} ${CATEGORY_META[attendeeCategory].pillText} ${CATEGORY_META[attendeeCategory].pillBorder}`}>
                          {CATEGORY_META[attendeeCategory].icon} {CATEGORY_META[attendeeCategory].shortLabel}
                        </span>
                        <span className="text-[11px] text-slate-500">preview</span>
                      </div>
                    )}
                  </label>
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
