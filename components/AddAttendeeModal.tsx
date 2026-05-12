import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Attendee, Form } from '../types';
import { X, UserPlus, Loader2, Calendar, CreditCard } from 'lucide-react';
import { saveAttendee } from '../services/storageService';
import { useNotifications } from './NotificationSystem';

interface AddAttendeeModalProps {
  forms: Form[];
  selectedFormId?: string;
  onClose: () => void;
  onAdded: () => void;
}

const AddAttendeeModal: React.FC<AddAttendeeModalProps> = ({ forms, selectedFormId, onClose, onAdded }) => {
  const { showNotification } = useNotifications();
  const [saving, setSaving] = useState(false);

  const [formId, setFormId] = useState(selectedFormId && selectedFormId !== '_all' ? selectedFormId : (forms[0]?.id || ''));
  const [ticketType, setTicketType] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'paid' | 'pending'>('free');
  const [isTest, setIsTest] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const selectedForm = useMemo(() => forms.find(f => f.id === formId), [forms, formId]);

  // Get ticket options from form
  const ticketField = selectedForm?.fields.find(f => f.type === 'ticket');
  const ticketOptions = ticketField?.ticketConfig?.items || [];

  // Non-ticket fields for dynamic rendering. The form is the canonical source
  // of name/email so we don't ask for them twice — pull whichever field looks
  // like the name and email at submit time (same heuristic the public form
  // uses so admin-added rows match registrant-created rows).
  const dynamicFields = useMemo(() => {
    if (!selectedForm) return [];
    return selectedForm.fields.filter(f => f.type !== 'ticket');
  }, [selectedForm]);

  const nameField = useMemo(
    () => selectedForm?.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name')),
    [selectedForm],
  );
  const emailField = useMemo(
    () => selectedForm?.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email')),
    [selectedForm],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId) {
      showNotification('Please select a form', 'warning');
      return;
    }
    // Pull name/email from the form's own fields rather than asking for them
    // twice. Same heuristic as PublicRegistration so admin-created rows look
    // identical to registrant-created ones.
    const resolvedName = String((nameField && answers[nameField.id]) || '').trim();
    const resolvedEmail = String((emailField && answers[emailField.id]) || '').trim();
    if (!resolvedName) {
      showNotification(`Please fill in "${nameField?.label || 'name'}" — that's how the attendee will appear on the ticket.`, 'warning');
      return;
    }
    if (!resolvedEmail) {
      showNotification(`Please fill in "${emailField?.label || 'email'}" — required so we can deliver their ticket.`, 'warning');
      return;
    }

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const qrPayload = JSON.stringify({ id, invoiceId });

      const attendee: Attendee = {
        id,
        formId,
        formTitle: selectedForm?.title || 'Unknown Form',
        name: resolvedName,
        email: resolvedEmail,
        ticketType: ticketType || 'Manual Entry',
        registeredAt: new Date().toISOString(),
        checkedInAt: null,
        qrPayload,
        paymentStatus,
        invoiceId,
        answers,
        isTest,
        isPrimary: true,
        donationType: 'none',
        donatedTables: 0,
        donatedSeats: 0,
      };

      await saveAttendee(attendee);
      showNotification(`${resolvedName} registered successfully`, 'success');
      onAdded();
      onClose();
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to add attendee: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAnswer = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm bg-black/20 p-4 sm:p-6 animate-fade-in">
      <div className="bg-white/80 backdrop-blur-3xl rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/60 w-full max-w-5xl overflow-hidden flex flex-col max-h-[98vh]">
        {/* Header */}
        <div className="px-7 py-5 border-b border-white/40 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-700 relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="bg-white/20 backdrop-blur-md p-2.5 rounded-2xl shadow-lg border border-white/10">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white drop-shadow-sm">Add Attendee</h3>
              <p className="text-sm text-indigo-200 font-medium">Manually register a new attendee</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all relative z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
          <div className="space-y-4">

            {/* Event Selector Card */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-sm">
              <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Event Selection
              </h4>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Form / Event</label>
                <select
                  value={formId}
                  onChange={e => { setFormId(e.target.value); setTicketType(''); setAnswers({}); }}
                  className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                >
                  {forms.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ticket & Payment Card */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-sm">
              <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CreditCard className="w-3 h-3" /> Ticket & Payment
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ticket Type</label>
                  {ticketOptions.length > 0 ? (
                    <select
                      value={ticketType}
                      onChange={e => setTicketType(e.target.value)}
                      className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                    >
                      <option value="">Select ticket type...</option>
                      {ticketOptions.map(t => (
                        <option key={t.id} value={t.name}>{t.name} - {t.price > 0 ? `$${t.price}` : 'Free'}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={ticketType}
                      onChange={e => setTicketType(e.target.value)}
                      className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm placeholder:text-slate-300"
                      placeholder="General Admission"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value as any)}
                    className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                  >
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dynamic form fields Card */}
            {dynamicFields.length > 0 && (
              <div className="bg-white/60 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-sm">
                <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-4">Form Fields</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dynamicFields.map(field => (
                    <div key={field.id} className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {field.label} {field.required && <span className="text-red-400">*</span>}
                      </label>
                      {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number') && (
                        <input
                          type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                          value={answers[field.id] || ''}
                          onChange={e => updateAnswer(field.id, e.target.value)}
                          placeholder={field.placeholder || ''}
                          className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          required={field.required}
                        />
                      )}
                      {field.type === 'textarea' && (
                        <textarea
                          value={answers[field.id] || ''}
                          onChange={e => updateAnswer(field.id, e.target.value)}
                          placeholder={field.placeholder || ''}
                          className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          rows={3}
                          required={field.required}
                        />
                      )}
                      {field.type === 'address' && (
                        <textarea
                          value={answers[field.id] || ''}
                          onChange={e => updateAnswer(field.id, e.target.value)}
                          placeholder={field.placeholder || 'Enter address...'}
                          className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          rows={2}
                          required={field.required}
                        />
                      )}
                      {field.type === 'select' && (
                        <select
                          value={answers[field.id] || ''}
                          onChange={e => updateAnswer(field.id, e.target.value)}
                          className="w-full px-4 py-3 bg-white/80 border border-white/60 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          required={field.required}
                        >
                          <option value="">Select...</option>
                          {(field.options || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      {field.type === 'radio' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {(field.options || []).map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer bg-white/70 border border-white/60 px-3 py-2 rounded-xl hover:bg-indigo-50 transition-all">
                              <input type="radio" name={field.id} value={opt} checked={answers[field.id] === opt} onChange={() => updateAnswer(field.id, opt)} className="text-indigo-600" />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                      {field.type === 'checkbox' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {(field.options || []).map(opt => (
                            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer bg-white/70 border border-white/60 px-3 py-2 rounded-xl hover:bg-indigo-50 transition-all">
                              <input type="checkbox" checked={(answers[field.id] || []).includes(opt)} onChange={e => { const c: string[] = answers[field.id] || []; updateAnswer(field.id, e.target.checked ? [...c, opt] : c.filter((v: string) => v !== opt)); }} className="rounded text-indigo-600" />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                      {field.type === 'boolean' && (
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer bg-white/70 border border-white/60 px-3 py-2 rounded-xl w-fit hover:bg-indigo-50 transition-all">
                          <input type="checkbox" checked={!!answers[field.id]} onChange={e => updateAnswer(field.id, e.target.checked)} className="rounded text-indigo-600" />
                          Yes
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test toggle */}
            <div className="bg-orange-50/60 backdrop-blur-md rounded-2xl px-5 py-3.5 border border-orange-200/40 flex items-center gap-3">
              <input type="checkbox" id="markAsTest" checked={isTest} onChange={e => setIsTest(e.target.checked)} className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500" />
              <label htmlFor="markAsTest" className="text-sm text-orange-700 font-bold cursor-pointer select-none">Mark as test record</label>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-3 bg-white/60 border border-white/60 rounded-xl font-bold text-slate-600 hover:bg-white/80 transition-all shadow-sm text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-bold hover:from-indigo-500 hover:to-indigo-600 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-60 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Add Attendee'}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddAttendeeModal;

