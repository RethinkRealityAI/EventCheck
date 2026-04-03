import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Attendee, Form, SeatingTable } from '../types';
import { User, X, Edit3, Trash2, CheckCircle, Clock, Mail, Check, QrCode, Calendar, CreditCard, Armchair } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { updateAttendee, deleteAttendee, getSettings } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import { sendEmail } from '../services/emailService';
import { generateEmailHtml } from '../utils/emailTemplates';

interface AttendeeModalProps {
  attendee: Attendee;
  forms: Form[];
  seatingTables: SeatingTable[];
  onClose: () => void;
  onDelete: (id: string) => void;
}

const AttendeeModal: React.FC<AttendeeModalProps> = ({ attendee, forms, seatingTables, onClose, onDelete }) => {
  const [resending, setResending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Attendee>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'responses'>('details');
  const [localAttendee, setLocalAttendee] = useState(attendee);
  const { showNotification } = useNotifications();

  const handleResendEmail = async () => {
    setResending(true);
    try {
      const settings = await getSettings();
      const html = generateEmailHtml(settings, settings.emailBodyTemplate, localAttendee);
      await sendEmail(localAttendee.email, settings.emailSubject, html);
      showNotification(`Ticket resent to ${localAttendee.email}`, 'success');
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
    if (window.confirm("Are you sure you want to delete this registration? This cannot be undone.")) {
      await deleteAttendee(id);
      onDelete(id);
      showNotification('Registration deleted', 'info');
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

  // Find the form for this attendee to resolve field labels
  const form = forms.find(f => f.id === localAttendee.formId);

  const resolveFieldLabel = (fieldId: string): string => {
    if (!form) return fieldId.replace('field_', '').replace(/_/g, ' ');
    const field = form.fields.find(f => f.id === fieldId);
    return field ? field.label : fieldId.replace('field_', '').replace(/_/g, ' ');
  };

  const answersEntries = localAttendee.answers ? Object.entries(localAttendee.answers) : [];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm bg-black/20 p-4 sm:p-6" onClick={onClose}>
      <div
        className="bg-white/80 backdrop-blur-3xl rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/60 w-full max-w-5xl overflow-hidden flex flex-col max-h-[98vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 py-5 border-b border-white/40 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-700 flex-shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="absolute -right-8 -top-8 opacity-10 pointer-events-none">
            <User strokeWidth={1} className="w-40 h-40 text-white" />
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="bg-white/20 backdrop-blur-md p-2.5 rounded-2xl shadow-lg border border-white/10">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2 drop-shadow-sm">
                {localAttendee.name}
                {localAttendee.isTest && (
                  <span className="px-2 py-0.5 bg-orange-400/20 text-orange-200 text-[10px] rounded-full font-bold border border-orange-300/30 uppercase tracking-wider">TEST</span>
                )}
              </h3>
              <p className="text-sm text-indigo-200 font-medium">{localAttendee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 relative z-10">
            <button
              onClick={() => {
                setEditData(localAttendee);
                setIsEditing(true);
              }}
              className="p-2.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              title="Edit Attendee"
            >
              <Edit3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleDeleteAttendee(localAttendee.id)}
              className="p-2.5 text-white/80 hover:text-red-300 hover:bg-white/10 rounded-xl transition-all"
              title="Delete Attendee"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-white/20 mx-1"></div>
            <button
              onClick={() => { onClose(); }}
              className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs - only visible when not editing */}
        {!isEditing && (
          <div className="px-7 pt-3 flex gap-2 bg-white/60 backdrop-blur-md border-b border-white/40 flex-shrink-0">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 ${activeTab === 'details' ? 'border-indigo-600 text-indigo-600 bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${activeTab === 'responses' ? 'border-indigo-600 text-indigo-600 bg-white/60' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              Responses {answersEntries.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{answersEntries.length}</span>}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
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
                </div>
              </div>

              {/* Form field answers editing */}
              {editData.answers && Object.entries(editData.answers).length > 0 && (
                <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60 shadow-sm">
                  <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3">Form Fields</h4>
                  <div className="space-y-3">
                    {Object.entries(editData.answers).map(([key, val]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{resolveFieldLabel(key)} *</label>
                        <input
                          className="w-full px-3 py-2 bg-white/80 border border-white/60 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium text-slate-800 shadow-sm"
                          value={Array.isArray(val) ? val.join(', ') : String(val || '')}
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

                  {/* Seating assignment */}
                  {seatingTables.length > 0 && (
                    <div className="bg-white/60 p-2.5 rounded-xl border border-white/60 text-sm shadow-sm space-y-1.5">
                      <span className="text-slate-500 font-bold text-[10px] uppercase tracking-wider block">Seating Table</span>
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
                    </div>
                  )}

                  <button
                    onClick={handleResendEmail}
                    disabled={resending}
                    className="w-full py-2.5 bg-white/60 border border-indigo-200/60 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50/60 transition-all flex items-center justify-center gap-2 shadow-sm text-xs"
                  >
                    <Mail className="w-4 h-4" /> {resending ? 'Sending...' : 'Resend Ticket Email'}
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

                {/* Guest badge */}
                {localAttendee.isPrimary === false && (
                  <div className="bg-purple-50/60 rounded-xl p-3 border border-purple-200/40 flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200/50">Guest Ticket</span>
                    {localAttendee.primaryAttendeeId && (
                      <span className="text-[11px] text-indigo-600 font-bold">
                        Linked to: {localAttendee.primaryAttendeeId.substring(0, 8)}...
                      </span>
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
                      <span className="text-sm text-slate-800 font-bold block">
                        {Array.isArray(val) ? val.join(', ') : String(val)}
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
