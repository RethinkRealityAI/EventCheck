import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Attendee, Form, SeatingTable } from '../types';
import { User, Users, UserPlus, Search, X, Edit3, Trash2, CheckCircle, Clock, Mail, Check, QrCode, Calendar, CreditCard, Armchair, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { updateAttendee, deleteAttendee, getSettings, getAttendee } from '../services/storageService';
import { supabase } from '../services/supabaseClient';
import { useNotifications } from './NotificationSystem';
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { CURRENT_SITE } from '../config/sites';
import {
  type AttendeeCategory,
  getCategoryOptionsForSite,
  CATEGORY_META,
  resolveAttendeeCategory,
} from '../utils/attendeeCategories';

interface AttendeeModalProps {
  attendee: Attendee;
  forms: Form[];
  seatingTables: SeatingTable[];
  attendees?: Attendee[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onOpenAttendee?: (attendee: Attendee) => void;
}

const AttendeeModal: React.FC<AttendeeModalProps> = ({ attendee, forms, seatingTables, attendees, onClose, onDelete, onOpenAttendee }) => {
  const [resending, setResending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Attendee>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'responses'>('details');
  const [localAttendee, setLocalAttendee] = useState(attendee);
  const [purchaser, setPurchaser] = useState<Attendee | null>(null);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingLinkIds, setPendingLinkIds] = useState<Set<string>>(new Set());
  const [localGuestIds, setLocalGuestIds] = useState<string[]>(() =>
    (attendees || []).filter(a => a.primaryAttendeeId === attendee.id).map(a => a.id)
  );
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [unlinkingIds, setUnlinkingIds] = useState<Set<string>>(new Set());
  const { showNotification } = useNotifications();

  // Re-sync when the parent swaps in a different attendee (e.g. clicking
  // "View purchaser" jumps from a guest row to the primary's row without
  // unmounting the modal).
  useEffect(() => {
    setLocalAttendee(attendee);
    setIsEditing(false);
    setActiveTab('details');
    setShowLinkPanel(false);
    setPendingLinkIds(new Set());
    setSearchQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setLocalGuestIds((attendees || []).filter(a => a.primaryAttendeeId === attendee.id).map(a => a.id));
  }, [attendee.id]);

  // For guest rows, look up the purchaser so we can show their name and offer
  // a "view purchaser" affordance.
  useEffect(() => {
    if (localAttendee.isPrimary !== false || !localAttendee.primaryAttendeeId) {
      setPurchaser(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await getAttendee(localAttendee.primaryAttendeeId!);
        if (!cancelled) setPurchaser(p ?? null);
      } catch (err) {
        console.warn('Failed to load purchaser for guest', err);
      }
    })();
    return () => { cancelled = true; };
  }, [localAttendee.primaryAttendeeId, localAttendee.isPrimary]);

  const isPendingClaimGuest = localAttendee.guestType === 'pending-claim'
    || localAttendee.guestType === 'exhibitor-staff-pending'
    || localAttendee.guestType === 'staff-pending';

  const handleResendEmail = async () => {
    setResending(true);
    try {
      // Pending-claim guests need the claim-invitation email (with their
      // completion URL), not a ticket. Use the same edge function the Live
      // tab's GuestActions chip uses so the two paths stay in sync.
      if (isPendingClaimGuest) {
        const { error } = await supabase.functions.invoke('send-ticket-email', {
          body: { mode: 'group-invite', attendeeId: localAttendee.id, origin: window.location.origin },
        });
        if (error) throw error;
        showNotification(`Claim invitation re-sent to ${localAttendee.email}`, 'success');
      } else {
        const settings = await getSettings();
        if (!settings.smtpUser || !settings.smtpPass) {
          throw new Error('SMTP is not configured. Set it up in Settings before resending tickets.');
        }
        const form = forms.find(f => f.id === localAttendee.formId);
        const origin = window.location.origin;

        // Reconstruct this primary's guests from the dashboard's in-memory list
        // so a table purchaser gets the EXACT email they received at checkout:
        // their own ticket plus every guest's PDF, plus the per-guest claim
        // links for any seats that haven't been claimed yet. Guest rows (not
        // primaries) just resend their own single ticket.
        const guests = localAttendee.isPrimary !== false
          ? (attendees || []).filter(a => a.primaryAttendeeId === localAttendee.id)
          : [];

        const safe = (n: string) => n.replace(/[^a-zA-Z0-9 ]/g, '_') || 'Ticket';
        const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

        const primaryDoc = await generateTicketPDF(localAttendee, settings, form);
        attachments.push({
          filename: `${safe(localAttendee.name)}_Ticket.pdf`,
          content: arrayBufferToBase64(primaryDoc.output('arraybuffer')),
          contentType: 'application/pdf',
        });

        const claimLinks: Array<{ name: string; url: string }> = [];
        for (let i = 0; i < guests.length; i++) {
          const g = guests[i];
          const isPending = g.guestType === 'pending-claim';
          // Pending-claim seats carry a registration URL so the recipient can
          // self-claim; claimed/named guests just get their entry ticket.
          const registrationUrl = isPending ? `${origin}/#/form/${g.formId}?ref=${g.id}` : undefined;
          const guestDoc = await generateTicketPDF(g, settings, form, registrationUrl);
          const isPlaceholder = g.name.includes('Guest Ticket #');
          attachments.push({
            filename: `${isPlaceholder ? `Guest_${i + 2}` : safe(g.name)}_Ticket.pdf`,
            content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
            contentType: 'application/pdf',
          });
          if (registrationUrl) claimLinks.push({ name: g.name, url: registrationUrl });
        }

        // Same claim-links block the checkout flow appends to the purchaser email.
        const claimLinksBlock = claimLinks.length > 0
          ? `<div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border-left:3px solid #4f46e5;border-radius:4px;">
               <p style="margin:0 0 8px;font-weight:600;">Registration links for your guests</p>
               <p style="margin:0 0 10px;font-size:13px;color:#475569;">Forward a link below to each guest so they can complete their own details. Each link claims one seat.</p>
               <ol style="margin:0;padding-left:20px;line-height:1.8;font-size:13px;">
                 ${claimLinks.map(g => `<li><strong>${g.name}</strong> — <a href="${g.url}">Claim / register</a><br><span style="color:#64748b;font-size:12px;">${g.url}</span></li>`).join('')}
               </ol>
             </div>`
          : '';

        // Table/group purchasers get the dedicated table-purchaser template;
        // solo tickets get the standard one — mirrors PublicRegistration.
        const isTable = guests.length > 0;
        const subjectTpl = isTable
          ? (settings.emailTablePurchaserSubject || settings.emailSubject || 'Your ticket for {{event}}')
          : (settings.emailSubject || 'Your ticket for {{event}}');
        const bodyTpl = isTable
          ? (settings.emailTablePurchaserBody || settings.emailBodyTemplate || '<p>Thank you for registering for <strong>{{event}}</strong>.</p>')
          : (settings.emailBodyTemplate || '<p>Thank you for registering for <strong>{{event}}</strong>.</p>');
        const render = (s: string) => s
          .replace(/\{\{event\}\}/g, localAttendee.formTitle || form?.title || '')
          .replace(/\{\{name\}\}/g, localAttendee.name || '')
          .replace(/\{\{id\}\}/g, localAttendee.id || '')
          .replace(/\{\{invoiceId\}\}/g, localAttendee.invoiceId || '')
          .replace(/\{\{amount\}\}/g, localAttendee.paymentAmount || '');

        await sendTicketEmail(settings, {
          to: localAttendee.email,
          subject: render(subjectTpl),
          name: localAttendee.name,
          title: localAttendee.formTitle || form?.title || undefined,
          message: render(bodyTpl) + claimLinksBlock,
          attachments,
        });

        // Stamp the guests too so the dashboard "Sent" status stays accurate
        // for the whole table (the primary is stamped by the shared block below).
        if (guests.length > 0) {
          try {
            const ts = new Date().toISOString();
            await Promise.all(guests.map(g => updateAttendee(g.id, { lastTicketEmailAt: ts })));
          } catch (err) {
            console.warn('Failed to stamp lastTicketEmailAt on table guests', err);
          }
        }

        showNotification(
          isTable
            ? `Ticket email (with ${guests.length} guest ticket${guests.length !== 1 ? 's' : ''}) resent to ${localAttendee.email}`
            : `Ticket resent to ${localAttendee.email}`,
          'success',
        );
      }
      // Stamp send-time on the attendee record so the dashboard reflects
      // "Sent" without forcing a page refresh. Best-effort — the email is
      // already out the door, this is just metadata.
      const stampedAt = new Date().toISOString();
      try {
        await updateAttendee(localAttendee.id, { lastTicketEmailAt: stampedAt });
        setLocalAttendee({ ...localAttendee, lastTicketEmailAt: stampedAt });
      } catch (err) {
        console.warn('Failed to stamp lastTicketEmailAt on resend', err);
      }
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to resend email: ${err.message}`, 'error');
    } finally {
      setResending(false);
    }
  };

  const handleUpdateAttendee = async (id: string, updates: Partial<Attendee>) => {
    await updateAttendee(id, updates);
    setLocalAttendee({ ...localAttendee, ...updates });
    setIsEditing(false);
    showNotification('Attendee updated', 'success');
  };

  const handleDeleteAttendee = async (id: string) => {
    // Detect linked BOGO free guest so we can warn before cascade-delete.
    const linkedFree = attendees?.find(
      a => a.isBogoClaim && a.bogoSourceAttendeeId === id,
    );
    const confirmMsg = linkedFree
      ? `This ticket has 1 free guest paired with it (${linkedFree.name} — ${linkedFree.email}).\n\n` +
        `Deleting will also delete that free guest's ticket and send them a "withdrawn" notification email. This cannot be undone.\n\nContinue?`
      : 'Are you sure you want to delete this registration? This cannot be undone.';
    if (!window.confirm(confirmMsg)) return;

    // Route through admin-cancel-attendee so the BOGO cascade + notification
    // email runs server-side. Fall back to direct delete only if the cascade
    // endpoint is unreachable (e.g. local dev without functions running).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('admin-cancel-attendee', {
        body: { attendeeId: id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw new Error((data as any)?.error || error.message || 'Cancel failed');
      onDelete(id);
      showNotification(
        linkedFree
          ? 'Registration and linked free guest deleted'
          : 'Registration deleted',
        'info',
      );
    } catch (e: any) {
      console.error('admin-cancel-attendee failed, falling back to direct delete', e);
      await deleteAttendee(id);
      onDelete(id);
      showNotification('Registration deleted (cascade fallback)', 'info');
    }
  };

  const handleTableAssignment = async (tableId: string | null) => {
    const updates: Partial<Attendee> = { assignedTableId: tableId, assignedSeat: null };
    await updateAttendee(localAttendee.id, updates);
    setLocalAttendee({ ...localAttendee, ...updates });
    showNotification(tableId ? 'Assigned to table' : 'Removed from table', 'success');
  };

  const handleToggleCheckIn = async () => {
    const newCheckedIn = localAttendee.checkedInAt ? null : new Date().toISOString();
    await updateAttendee(localAttendee.id, { checkedInAt: newCheckedIn });
    setLocalAttendee({ ...localAttendee, checkedInAt: newCheckedIn });
    showNotification(newCheckedIn ? 'Checked in successfully!' : 'Check-in undone', newCheckedIn ? 'success' : 'info');
  };

  const handleSaveLinks = async () => {
    if (pendingLinkIds.size === 0) return;
    setIsSavingLinks(true);
    try {
      await Promise.all([...pendingLinkIds].map(id =>
        updateAttendee(id, { primaryAttendeeId: localAttendee.id, isPrimary: false, guestType: 'adult' })
      ));
      setLocalGuestIds(prev => [...prev, ...[...pendingLinkIds]]);
      setShowLinkPanel(false);
      setPendingLinkIds(new Set());
      setSearchQuery('');
      showNotification(`${pendingLinkIds.size} guest${pendingLinkIds.size !== 1 ? 's' : ''} linked`, 'success');
    } catch (err: any) {
      showNotification(`Failed to link guests: ${err.message}`, 'error');
    } finally {
      setIsSavingLinks(false);
    }
  };

  const handleUnlinkGuest = async (guestId: string) => {
    setUnlinkingIds(prev => new Set(prev).add(guestId));
    try {
      await updateAttendee(guestId, { primaryAttendeeId: undefined, isPrimary: true, guestType: undefined });
      setLocalGuestIds(prev => prev.filter(id => id !== guestId));
      showNotification('Guest unlinked', 'success');
    } catch (err: any) {
      showNotification(`Failed to unlink guest: ${err.message}`, 'error');
    } finally {
      setUnlinkingIds(prev => { const next = new Set(prev); next.delete(guestId); return next; });
    }
  };

  // Find the form for this attendee to resolve field labels
  const form = forms.find(f => f.id === localAttendee.formId);

  const resolveFieldLabel = (fieldId: string): string => {
    if (!form) return fieldId.replace('field_', '').replace(/_/g, ' ');
    const field = form.fields.find(f => f.id === fieldId);
    return field ? field.label : fieldId.replace('field_', '').replace(/_/g, ' ');
  };

  // Internal metadata keys that should never render as cards in the Responses
  // tab. `_purchaser_filled` is a redundant nested snapshot — the same data
  // already appears as `_guest_name`, `_guest_email`, etc., and the dashboard
  // already surfaces the "Purchaser Filled" pill on these rows, so showing
  // the raw object was both confusing and visually broken (rendered as
  // `[object Object]`).
  const HIDDEN_ANSWER_KEYS = new Set(['_purchaser_filled']);
  const answersEntries = localAttendee.answers
    ? Object.entries(localAttendee.answers).filter(([key]) => !HIDDEN_ANSWER_KEYS.has(key))
    : [];

  // Defensive value-to-string for the Responses cards. `String(val)` on an
  // object produces "[object Object]"; we never want that to leak into the
  // UI again if a new metadata field is introduced without a corresponding
  // HIDDEN_ANSWER_KEYS entry.
  const renderAnswerValue = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return '—';
    if (Array.isArray(val)) return val.length === 0 ? '—' : val.join(', ');
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return '—'; }
    }
    return String(val);
  };

  const existingGuests = (attendees || []).filter(a => localGuestIds.includes(a.id));
  // Build the set of IDs that are already someone's primary — linking these
  // would orphan their own sub-guests, so exclude them.
  const idsWithSubGuests = new Set(
    (attendees || []).filter(a => a.primaryAttendeeId).map(a => a.primaryAttendeeId!)
  );
  const eligibleCandidates = (attendees || []).filter(a =>
    a.id !== localAttendee.id &&
    a.isPrimary !== false &&
    !localGuestIds.includes(a.id) &&
    a.formId === localAttendee.formId &&
    !a.isTest &&
    !idsWithSubGuests.has(a.id)
  );
  const filteredCandidates = searchQuery.trim()
    ? eligibleCandidates.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : eligibleCandidates;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm bg-black/20 p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-white/80 backdrop-blur-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/60 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-7 sm:py-5 border-b border-white/40 flex justify-between items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 flex-shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="absolute -right-8 -top-8 opacity-10 pointer-events-none">
            <User strokeWidth={1} className="w-40 h-40 text-white" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 relative z-10 min-w-0 flex-1">
            <div className="bg-white/20 backdrop-blur-md p-2 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-lg border border-white/10 flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-xl font-extrabold text-white flex items-center gap-2 drop-shadow-sm truncate">
                <span className="truncate">{localAttendee.name}</span>
                {localAttendee.isTest && (
                  <span className="px-2 py-0.5 bg-orange-400/20 text-orange-200 text-[10px] rounded-full font-bold border border-orange-300/30 uppercase tracking-wider flex-shrink-0">TEST</span>
                )}
              </h3>
              <p className="text-xs sm:text-sm text-indigo-200 font-medium truncate">{localAttendee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1.5 relative z-10 flex-shrink-0">
            <button
              onClick={() => {
                setEditData(localAttendee);
                setIsEditing(true);
              }}
              className="p-2 sm:p-2.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              title="Edit Attendee"
            >
              <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => handleDeleteAttendee(localAttendee.id)}
              className="p-2 sm:p-2.5 text-white/80 hover:text-red-300 hover:bg-white/10 rounded-xl transition-all"
              title="Delete Attendee"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="hidden sm:block w-px h-6 bg-white/20 mx-1"></div>
            <button
              onClick={() => { onClose(); }}
              className="p-2 sm:p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Tabs - only visible when not editing */}
        {!isEditing && (
          <div className="px-4 sm:px-7 pt-2 sm:pt-3 flex gap-2 bg-white/60 backdrop-blur-md border-b border-white/40 flex-shrink-0">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-all border-b-2 ${activeTab === 'details' ? 'border-indigo-600 text-indigo-600 bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${activeTab === 'responses' ? 'border-indigo-600 text-indigo-600 bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Responses {answersEntries.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{answersEntries.length}</span>}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 custom-scrollbar overscroll-contain">
          {isEditing ? (
            <div className="space-y-5">
              <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60 shadow-sm">
                <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Edit3 className="w-3 h-3" /> Edit Registration
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                    <input
                      className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                      value={editData.name || ''}
                      placeholder="John Doe"
                      onChange={e => setEditData({ ...editData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Address *</label>
                    <input
                      className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                      value={editData.email || ''}
                      placeholder="john@example.com"
                      onChange={e => setEditData({ ...editData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ticket Type</label>
                    <input
                      className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                      value={editData.ticketType || ''}
                      placeholder="Select ticket type..."
                      onChange={e => setEditData({ ...editData, ticketType: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</label>
                    <select
                      className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                      value={editData.paymentStatus || ''}
                      onChange={e => setEditData({ ...editData, paymentStatus: e.target.value as any })}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  {/* Attendee category — drives the dashboard pill, attendee
                      modal badge, and 3D seating scene label. Speaker is
                      GANSID-only; Speaker selection also stamps
                      guest_type='speaker' for the legacy Speakers tab. */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Attendee Category <span className="text-[9px] font-normal text-slate-400">(optional pill)</span>
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                      value={editData.attendeeCategory ?? ''}
                      onChange={e => {
                        const val = (e.target.value || null) as AttendeeCategory | null;
                        setEditData(prev => ({
                          ...prev,
                          attendeeCategory: val,
                          // Mirror the legacy `guest_type='speaker'` stamp so
                          // the Speakers tab + promo filters keep working.
                          guestType: val === 'speaker'
                            ? 'speaker'
                            : (prev.guestType === 'speaker' ? undefined : prev.guestType),
                        }));
                      }}
                    >
                      <option value="">— None (regular attendee) —</option>
                      {getCategoryOptionsForSite(CURRENT_SITE.portalEnabled).map(c => (
                        <option key={c.id} value={c.id}>{c.icon}  {c.label}</option>
                      ))}
                    </select>
                    {editData.attendeeCategory && CATEGORY_META[editData.attendeeCategory] && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORY_META[editData.attendeeCategory].pillBg} ${CATEGORY_META[editData.attendeeCategory].pillText} ${CATEGORY_META[editData.attendeeCategory].pillBorder}`}>
                          {CATEGORY_META[editData.attendeeCategory].icon} {CATEGORY_META[editData.attendeeCategory].shortLabel}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-2">preview</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Form field answers editing — same HIDDEN_ANSWER_KEYS filter
                  as the read view so internal metadata (_purchaser_filled) is
                  never editable in the UI. */}
              {editData.answers && Object.entries(editData.answers).filter(([k]) => !HIDDEN_ANSWER_KEYS.has(k)).length > 0 && (
                <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60 shadow-sm">
                  <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3">Form Fields</h4>
                  <div className="space-y-3">
                    {Object.entries(editData.answers).filter(([k]) => !HIDDEN_ANSWER_KEYS.has(k)).map(([key, val]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{resolveFieldLabel(key)} *</label>
                        <input
                          className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          value={renderAnswerValue(val) === '—' ? '' : renderAnswerValue(val)}
                          onChange={e => setEditData({
                            ...editData,
                            answers: {
                              ...editData.answers,
                              [key]: e.target.value
                            }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}


              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 bg-white/60 border border-white/60 rounded-lg font-bold text-slate-600 hover:bg-white/80 transition-all shadow-sm text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateAttendee(localAttendee.id, editData)}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg font-bold hover:from-indigo-500 hover:to-indigo-600 transition-all shadow-lg shadow-indigo-500/20 text-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : activeTab === 'details' ? (
            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
              {/* Left Column - QR & Quick Info */}
              <div className="flex flex-col items-center space-y-2.5">
                <div className="bg-white p-4 border border-white/60 rounded-2xl shadow-lg shadow-indigo-500/5 w-full flex justify-center">
                  <QRCode value={localAttendee.qrPayload} size={160} />
                </div>

                <div className="w-full space-y-2">
                  {/* Check In / Undo Button */}
                  <button
                    onClick={handleToggleCheckIn}
                    className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                      localAttendee.checkedInAt
                        ? 'bg-white/60 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-emerald-500/10'
                        : 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400 shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/30'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    {localAttendee.checkedInAt ? 'Undo Check-In' : 'Check In Now'}
                  </button>

                  {/* Status card */}
                  <div className="bg-white/60 p-3 rounded-xl border border-white/60 flex justify-between items-center text-sm shadow-sm">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Status</span>
                    {localAttendee.checkedInAt ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-100 px-3 py-1 rounded-xl text-xs border border-emerald-200/50">
                        <CheckCircle className="w-3.5 h-3.5" /> Checked In
                      </span>
                    ) : (
                      <span className="text-slate-600 font-bold bg-slate-100 px-3 py-1 rounded-xl text-xs border border-slate-200/50">Not Yet</span>
                    )}
                  </div>

                  {/* Payment card */}
                  <div className="bg-white/60 p-3 rounded-xl border border-white/60 flex justify-between items-center text-sm shadow-sm">
                    <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Payment</span>
                    <span className={`font-bold capitalize px-3 py-1 rounded-xl flex items-center gap-1.5 text-xs border ${localAttendee.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200/50' : 'bg-slate-100 text-slate-700 border-slate-200/50'
                      }`}>
                      {localAttendee.paymentStatus || 'Free'}
                    </span>
                  </div>

                  {/* Seating assignment — table only. Driven by the Seating Chart admin
                      page; assignment here syncs back to the chart in real time via
                      assignedTableId. Always visible so admins know where to manage it. */}
                  <div className="bg-white/60 p-2.5 rounded-xl border border-white/60 text-sm shadow-sm space-y-1.5">
                    <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">Seating Table</span>
                    {seatingTables.length > 0 ? (
                      <>
                        <select
                          value={localAttendee.assignedTableId || ''}
                          onChange={e => handleTableAssignment(e.target.value || null)}
                          className="w-full px-3 py-2 bg-white/80 backdrop-blur-sm border border-white/60 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        >
                          <option value="">Unassigned</option>
                          {seatingTables.map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.capacity} seats)</option>
                          ))}
                        </select>
                        {localAttendee.assignedTableId && (() => {
                          const t = seatingTables.find(t => t.id === localAttendee.assignedTableId);
                          return t ? (
                            <div className="text-[11px] text-slate-500">
                              Currently at <span className="font-bold text-amber-700">{t.name}</span>. Use the Seating Chart admin to rearrange the room.
                            </div>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500 leading-snug">
                        No tables defined yet. Add tables in the <span className="font-semibold">Seating Chart</span> admin page, then return here to assign one.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleResendEmail}
                    disabled={resending}
                    className="w-full py-2.5 bg-white/60 border border-indigo-200/60 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50/60 transition-all flex items-center justify-center gap-2 shadow-sm text-xs"
                  >
                    <Mail className="w-4 h-4" />
                    {resending
                      ? 'Sending...'
                      : isPendingClaimGuest ? 'Resend Claim Invitation' : 'Resend Ticket Email'}
                  </button>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="space-y-3">
                <div className="bg-white/60 rounded-xl p-4 border border-white/60 shadow-sm">
                  <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Registration Details
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Registration ID</label>
                      <div className="text-[11px] font-mono bg-white/70 px-3 py-1.5 rounded-lg text-slate-600 select-all border border-white/60 shadow-sm">
                        {localAttendee.id}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Ticket Type</label>
                        <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shadow-indigo-300"></div> {localAttendee.ticketType}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Event Name</label>
                        <div className="text-sm font-semibold text-slate-700">{localAttendee.formTitle}</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Registered</label>
                        <div className="text-xs text-slate-800 font-bold">{format(new Date(localAttendee.registeredAt), 'PPP')}</div>
                      </div>
                      {localAttendee.checkedInAt && (
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-emerald-500 uppercase block mb-1 tracking-wider">Checked In</label>
                          <div className="text-xs text-emerald-700 font-bold">{format(new Date(localAttendee.checkedInAt), 'p')}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment / Transaction details */}
                {(localAttendee.invoiceId || localAttendee.transactionId) && (
                  <div className="bg-white/60 rounded-xl p-4 border border-white/60 shadow-sm">
                    <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                      <CreditCard className="w-3 h-3" /> Payment Info
                    </h4>
                    <div className="space-y-2">
                      {localAttendee.invoiceId && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 tracking-wider">Invoice ID</label>
                          <div className="text-xs font-medium text-slate-700">{localAttendee.invoiceId}</div>
                        </div>
                      )}
                      {localAttendee.transactionId && (
                        <div>
                          <label className="text-[10px] font-bold text-blue-500 uppercase block mb-1.5 tracking-wider">PayPal Transaction</label>
                          <div className="text-xs font-mono font-bold text-blue-700 select-all bg-blue-50/60 px-3 py-2 rounded-xl border border-blue-100/60">{localAttendee.transactionId}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Donated Seats/Tables Info */}
                {((localAttendee.donatedSeats && localAttendee.donatedSeats > 0) || (localAttendee.donatedTables && localAttendee.donatedTables > 0)) && (
                  <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200/40 shadow-sm">
                    <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.15em] mb-2 flex items-center gap-2">
                      <Armchair className="w-3 h-3" />
                      {localAttendee.donationType === 'table' ? 'Donated Tables' : 'Donated Seats'}
                    </h4>
                    <div className="text-sm font-bold text-emerald-700">
                      {localAttendee.donationType === 'table' && (localAttendee.donatedTables || 0) > 0
                        ? `${localAttendee.donatedTables} table${(localAttendee.donatedTables || 0) !== 1 ? 's' : ''} (${localAttendee.donatedSeats} seat${(localAttendee.donatedSeats || 0) !== 1 ? 's' : ''})`
                        : `${localAttendee.donatedSeats} seat${(localAttendee.donatedSeats || 0) !== 1 ? 's' : ''}`
                      }
                    </div>
                    <div className="text-xs text-emerald-600/80 mt-1 font-medium">
                      {localAttendee.donationType === 'table'
                        ? 'Full table(s) donated for others to attend'
                        : 'Extra tickets donated for others to attend'
                      }
                    </div>
                  </div>
                )}

                {/* Dietary Preferences */}
                {localAttendee.dietaryPreferences && (
                  <div className="bg-white/60 rounded-xl p-4 border border-white/60 shadow-sm">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 tracking-wider">Dietary Preferences</label>
                    <div className="text-sm font-semibold text-slate-700">{localAttendee.dietaryPreferences}</div>
                  </div>
                )}

                {/* Presenter type — surfaces the GANSID `_present` question on
                    the modal for at-a-glance "is this a speaker?" lookups.
                    Tolerates the per-form id suffix (f_${timestamp}_present)
                    by matching any key that ends in "_present". */}
                {(() => {
                  const answers = (localAttendee.answers ?? {}) as Record<string, any>;
                  const presentKey = Object.keys(answers).find(k => k === 'f_present' || k.endsWith('_present'));
                  const raw = presentKey ? answers[presentKey] : null;
                  if (!raw || typeof raw !== 'string') return null;
                  const isYes = raw.toLowerCase().startsWith('yes');
                  return (
                    <div className={`rounded-xl p-3 border shadow-sm ${isYes ? 'bg-amber-50/60 border-amber-200' : 'bg-white/60 border-white/60'}`}>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] mb-1">
                        <span>{isYes ? '🎤' : '🧑‍🎓'}</span>
                        <span className={isYes ? 'text-amber-700' : 'text-slate-600'}>Presenter type</span>
                      </div>
                      <div className="text-sm text-slate-800">{raw}</div>
                      {isYes && localAttendee.guestType !== 'speaker' && (
                        <div className="text-[11px] text-amber-700 mt-1">
                          Marked as presenting — consider tagging this row as a Speaker.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* BOGO panel — context-sensitive: paid source shows linked free guest;
                    free claim row shows source. Read-only summary; lifecycle actions
                    (send/resend/edit/dismiss) live in the user's portal "My Tickets". */}
                {(() => {
                  if (!attendees) return null;
                  // Free claim row → show its source.
                  if (localAttendee.isBogoClaim) {
                    const src = attendees.find(a => a.id === localAttendee.bogoSourceAttendeeId);
                    return (
                      <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200 shadow-sm">
                        <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.15em] mb-2">
                          🎁 BOGO Free Ticket
                        </h4>
                        {src ? (
                          <div className="text-sm text-emerald-900">
                            <div>Source: <strong>{src.name}</strong> ({src.email})</div>
                            {src.ticketType && <div className="text-xs text-emerald-700 mt-0.5">{src.ticketType}</div>}
                            <button
                              type="button"
                              onClick={() => onOpenAttendee?.(src)}
                              className="mt-2 text-xs underline text-emerald-700 hover:text-emerald-900"
                            >Open source record →</button>
                          </div>
                        ) : (
                          <div className="text-sm text-amber-700">
                            Source attendee not found (may have been deleted).
                          </div>
                        )}
                      </div>
                    );
                  }
                  // Paid row → show linked free guest if any.
                  const linkedFree = attendees.find(
                    a => a.isBogoClaim && a.bogoSourceAttendeeId === localAttendee.id,
                  );
                  if (linkedFree) {
                    return (
                      <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200 shadow-sm">
                        <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.15em] mb-2">
                          🎁 Free Guest Paired
                        </h4>
                        <div className="text-sm text-emerald-900">
                          <strong>{linkedFree.name}</strong> ({linkedFree.email})
                          {linkedFree.guestType === 'pending-claim' && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">PENDING CLAIM</span>
                          )}
                          {linkedFree.guestType === 'claimed' && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-emerald-700">CLAIMED</span>
                          )}
                          {linkedFree.bogoDismissedByPayerAt && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-slate-500">HIDDEN BY PAYER</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenAttendee?.(linkedFree)}
                            className="block mt-2 text-xs underline text-emerald-700 hover:text-emerald-900"
                          >Open guest record →</button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Linked Guests — manage guest pairings for primary attendees */}
                {localAttendee.isPrimary !== false && attendees && (
                  <div className="bg-white/60 rounded-xl p-4 border border-white/60 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.15em] flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        Linked Guests
                        {localGuestIds.length > 0 && (
                          <span className="bg-indigo-100 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{localGuestIds.length}</span>
                        )}
                      </h4>
                      {!showLinkPanel && (
                        <button
                          onClick={() => setShowLinkPanel(true)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-indigo-50/60 transition-all"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Link Guest
                        </button>
                      )}
                    </div>

                    {/* Existing linked guests */}
                    {existingGuests.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {existingGuests.map(g => (
                          <div key={g.id} className="flex items-center justify-between bg-indigo-50/60 px-3 py-2 rounded-xl border border-indigo-100/60 group">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <User className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-bold text-slate-800 truncate block">{g.name}</span>
                                <span className="text-[11px] text-slate-500 truncate block">{g.email}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {onOpenAttendee && (
                                <button
                                  onClick={() => onOpenAttendee(g)}
                                  className="text-[11px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-100/60 transition-all opacity-0 group-hover:opacity-100"
                                  title="Open this guest's record"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => handleUnlinkGuest(g.id)}
                                disabled={unlinkingIds.has(g.id)}
                                className="text-[11px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
                                title="Remove guest link"
                              >
                                {unlinkingIds.has(g.id) ? <span className="text-slate-400">…</span> : <X className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty state */}
                    {existingGuests.length === 0 && !showLinkPanel && (
                      <div className="text-center py-3">
                        <Users className="w-6 h-6 text-slate-200 mx-auto mb-1.5" />
                        <p className="text-xs text-slate-400 font-medium">No guests linked yet.</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">Use "Link Guest" to group attendees together for viewing.</p>
                      </div>
                    )}

                    {/* Search + select panel */}
                    {showLinkPanel && (
                      <div className="space-y-3 mt-1">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            autoFocus
                            className="w-full pl-9 pr-3 py-2 bg-white/80 border border-white/60 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            placeholder="Search by name or email…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-xl border border-white/60 bg-white/40 p-1">
                          {filteredCandidates.length === 0 ? (
                            <div className="py-5 text-center">
                              <p className="text-xs text-slate-400 font-medium">
                                {eligibleCandidates.length === 0
                                  ? 'No available attendees on this form'
                                  : 'No results — try a different name or email'}
                              </p>
                              {eligibleCandidates.length === 0 && (
                                <p className="text-[11px] text-slate-300 mt-1">
                                  Attendees already linked as guests elsewhere are not shown.
                                </p>
                              )}
                            </div>
                          ) : (
                            filteredCandidates.map(candidate => {
                              const checked = pendingLinkIds.has(candidate.id);
                              return (
                                <label
                                  key={candidate.id}
                                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${checked ? 'bg-indigo-50/80 border border-indigo-200/60' : 'hover:bg-white/70 border border-transparent'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setPendingLinkIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(candidate.id)) next.delete(candidate.id);
                                        else next.add(candidate.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 w-4 h-4"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-bold text-slate-800 block truncate">{candidate.name}</span>
                                    <span className="text-[11px] text-slate-500 block truncate">{candidate.email}</span>
                                  </div>
                                  {checked && <Check className="w-4 h-4 text-indigo-500 flex-shrink-0" />}
                                </label>
                              );
                            })
                          )}
                        </div>

                        {/* Selected confirmation chips */}
                        {pendingLinkIds.size > 0 && (
                          <div className="bg-indigo-50/60 rounded-xl p-2.5 border border-indigo-100/60">
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Selected to link</p>
                            <div className="flex flex-wrap gap-1.5">
                              {[...pendingLinkIds].map(id => {
                                const a = eligibleCandidates.find(c => c.id === id);
                                return a ? (
                                  <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200/60 shadow-sm">
                                    {a.name}
                                    <button
                                      onClick={() => setPendingLinkIds(prev => { const next = new Set(prev); next.delete(id); return next; })}
                                      className="text-indigo-400 hover:text-indigo-700 transition-colors"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { setShowLinkPanel(false); setPendingLinkIds(new Set()); setSearchQuery(''); }}
                            className="flex-1 py-2.5 bg-white/60 border border-white/60 rounded-xl font-bold text-slate-600 hover:bg-white/80 transition-all text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveLinks}
                            disabled={pendingLinkIds.size === 0 || isSavingLinks}
                            className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold hover:from-indigo-500 hover:to-indigo-600 transition-all shadow-lg shadow-indigo-500/20 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingLinks
                              ? 'Saving…'
                              : pendingLinkIds.size === 0
                                ? 'Select guests above'
                                : `Link ${pendingLinkIds.size} Guest${pendingLinkIds.size !== 1 ? 's' : ''}`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Guest panel — claim state + linked purchaser */}
                {localAttendee.isPrimary === false && (
                  <div className="bg-purple-50/60 rounded-xl p-4 border border-purple-200/40 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200/50">Guest Ticket</span>
                      {isPendingClaimGuest ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200/50">Pending Claim</span>
                      ) : localAttendee.guestType === 'claimed'
                        || localAttendee.guestType === 'staff-claimed'
                        || localAttendee.guestType === 'exhibitor-staff-claimed' ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200/50">Self-Completed</span>
                      ) : localAttendee.answers?._purchaser_filled ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200/50">Pre-filled by Purchaser</span>
                      ) : null}
                    </div>
                    {localAttendee.primaryAttendeeId && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-600">
                          <span className="text-slate-400 font-bold uppercase tracking-wider mr-2">Purchaser</span>
                          <span className="font-bold text-slate-700">{purchaser?.name || `${localAttendee.primaryAttendeeId.substring(0, 8)}…`}</span>
                          {purchaser?.email && <span className="text-slate-500"> · {purchaser.email}</span>}
                        </div>
                        {purchaser && onOpenAttendee && (
                          <button
                            onClick={() => onOpenAttendee(purchaser)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                            title="Open the purchaser's record"
                          >
                            View purchaser <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Responses Tab */
            <div>
              {answersEntries.length > 0 ? (
                <div className="space-y-3">
                  {answersEntries.map(([key, val]) => (
                    <div key={key} className="bg-white/60 p-3.5 rounded-xl border border-white/60 shadow-sm hover:shadow-md transition-all">
                      <span className="text-[10px] font-bold text-indigo-500 block mb-2 uppercase tracking-widest">{resolveFieldLabel(key)}</span>
                      <span className="text-sm text-slate-800 font-bold block break-words">
                        {renderAnswerValue(val)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400">
                  <div className="w-16 h-16 mx-auto mb-4 bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 flex items-center justify-center shadow-lg shadow-indigo-500/5">
                    <Mail className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-500">No form responses recorded</p>
                  <p className="text-xs mt-1.5 text-slate-400 font-medium">This attendee has no custom form answers on file.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AttendeeModal;
