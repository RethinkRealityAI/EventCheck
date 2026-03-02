import React, { useState, useEffect } from 'react';
import { Send, Check, Loader2, User, Search, RefreshCw, QrCode } from 'lucide-react';
import { Attendee, AppSettings, Form } from '../types';
import { getAttendees, saveAttendee, getSettings, getForms } from '../services/storageService';
import { QRCodeSVG } from 'qrcode.react';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';

const ManualTicketTool: React.FC = () => {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // New user form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    formId: '',
    ticketType: '',
    paymentStatus: 'free',
    guestType: 'adult'
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const attendeeData = await getAttendees();
      setAttendees(attendeeData);

      const settingsData = await getSettings();
      setSettings(settingsData);

      const formsData = await getForms();
      setForms(formsData.filter(f => f.status === 'active'));
    };
    fetch();
  }, []);

  const filteredAttendees = attendees.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedForm = forms.find(f => f.id === formData.formId);
  const ticketField = selectedForm?.fields.find(f => f.type === 'ticket');
  const availableTicketTypes = ticketField?.ticketConfig?.items || [];

  // Auto-select first ticket type if available and none selected
  const ticketTypeNames = availableTicketTypes.map(t => t.name).join(',');
  useEffect(() => {
    if (availableTicketTypes.length > 0 && !formData.ticketType) {
      setFormData(prev => ({ ...prev, ticketType: availableTicketTypes[0].name }));
    }
  }, [ticketTypeNames, formData.ticketType]);

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.formId || !formData.ticketType) {
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

    try {
      await saveAttendee(newAttendee);
      const updatedAttendees = await getAttendees();
      setAttendees(updatedAttendees);
      setSelectedAttendee(newAttendee);

      if (settings && settings.smtpUser && settings.smtpPass) {
        const doc = generateTicketPDF(newAttendee, settings, selectedForm!);
        await sendTicketEmail(settings, {
          to: formData.email,
          subject: `Your Ticket for ${selectedForm?.title}`,
          name: newAttendee.name,
          message: `Your ticket has been manually issued for ${selectedForm?.title}. Attached is your PDF ticket.`,
          attachments: [{
            filename: `${newAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
            content: arrayBufferToBase64(doc.output('arraybuffer')),
            contentType: 'application/pdf'
          }]
        });
        setSuccessMsg('Ticket Generated and Email Dispatched Successfully');
      } else {
        setSuccessMsg('Ticket Generated successfully (Email bypassed - SMTP not configured)');
      }
    } catch (err) {
      console.error(err);
      setSuccessMsg('Ticket Generated but encountered an error sending email');
    } finally {
      setLoading(false);
      // Reset form but keep the form selection
      setFormData(prev => ({ ...prev, firstName: '', lastName: '', email: '' }));
    }
  };

  const handleResend = async () => {
    if (!selectedAttendee) return;
    setLoading(true);
    setSuccessMsg('');

    try {
      if (settings && settings.smtpUser && settings.smtpPass) {
        const form = (await getForms()).find(f => f.id === selectedAttendee.formId);
        if (!form) throw new Error("Form not found for this ticket.");
        const doc = generateTicketPDF(selectedAttendee, settings, form);
        await sendTicketEmail(settings, {
          to: selectedAttendee.email,
          subject: `Your Ticket for ${selectedAttendee.formTitle}`,
          name: selectedAttendee.name,
          message: `Here is your requested ticket for ${selectedAttendee.formTitle}. Attached is your PDF ticket.`,
          attachments: [{
            filename: `${selectedAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
            content: arrayBufferToBase64(doc.output('arraybuffer')),
            contentType: 'application/pdf'
          }]
        });
        setSuccessMsg(`Email dispatched successfully to ${selectedAttendee.email}`);
      } else {
        setSuccessMsg(`Cannot send email - SMTP not configured.`);
      }
    } catch (err) {
      console.error(err);
      setSuccessMsg(`Failed to send email.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        {/* Toggle */}
        <div className="bg-white p-1 rounded-lg border border-gray-200 inline-flex shadow-sm">
          <button
            onClick={() => { setMode('existing'); setSelectedAttendee(null); setSuccessMsg(''); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${mode === 'existing' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Existing Attendee
          </button>
          <button
            onClick={() => { setMode('new'); setSelectedAttendee(null); setSuccessMsg(''); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${mode === 'new' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Issue New Ticket
          </button>
        </div>

        {/* Existing User Search */}
        {mode === 'existing' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[650px] flex flex-col">
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
                  onClick={() => { setSelectedAttendee(att); setSuccessMsg(''); }}
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
                      ticketType: newTicketTypes.length > 0 ? newTicketTypes[0].name : 'Manual Issue'
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

              <button type="submit" disabled={loading || !formData.formId} className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4">
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                Generate & Dispatch Ticket
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Preview Panel */}
      <div className="bg-gray-50 p-8 rounded-xl border border-gray-200 flex flex-col items-center justify-center relative">
        {selectedAttendee ? (
          <div className="w-full max-w-sm bg-white p-6 rounded-xl shadow-lg border border-gray-100 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
              <h4 className="font-bold text-gray-900">Ticket Preview</h4>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${selectedAttendee.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : selectedAttendee.paymentStatus === 'free' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                {(selectedAttendee.paymentStatus || 'free').toUpperCase()}
              </span>
            </div>

            <div className="flex justify-center mb-6">
              <QRCodeSVG value={selectedAttendee.qrPayload} size={180} />
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">{selectedAttendee.name}</h3>
              <p className="text-gray-500 text-sm">{selectedAttendee.email}</p>
              <div className="flex gap-2 justify-center mt-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-widest uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{selectedAttendee.ticketType}</span>
                {selectedAttendee.guestType === 'child' && <span className="text-[10px] font-bold tracking-widest uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded">CHILD</span>}
                {selectedAttendee.guestType === 'adult' && <span className="text-[10px] font-bold tracking-widest uppercase bg-slate-100 text-slate-700 px-2 py-0.5 rounded">ADULT</span>}
              </div>
              <p className="text-[10px] font-mono text-gray-400 mt-2">{selectedAttendee.id}</p>
            </div>

            {successMsg && (
              <div dangerouslySetInnerHTML={{ __html: successMsg.includes('failed') || successMsg.includes('bypassed') ? `<span class="text-amber-700"><svg class="inline w-4 h-4 mr-1 pb-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>${successMsg}</span>` : `<span class="text-emerald-700"><svg class="inline w-4 h-4 mr-1 pb-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>${successMsg}</span>` }} className={`mb-4 ${successMsg.includes('failed') || successMsg.includes('bypassed') ? 'bg-amber-50' : 'bg-emerald-50'} p-3 rounded-lg text-xs text-center font-medium animate-fade-in`}>
              </div>
            )}

            <button
              onClick={handleResend}
              disabled={loading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Send className="w-4 h-4" />}
              {successMsg ? 'Resend Email PDF' : 'Send Ticket Email PDF'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-gray-300" />
            </div>
            <p>Select an attendee or submit the form<br />to generate a new manual ticket.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualTicketTool;