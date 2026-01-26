import React, { useState, useEffect } from 'react';
import { Send, Check, Loader2, User, Search, RefreshCw, QrCode } from 'lucide-react';
import { Attendee, AppSettings } from '../types';
import { getAttendees, saveAttendee, getSettings } from '../services/storageService';
import { QRCodeSVG } from 'qrcode.react';

const ManualTicketTool: React.FC = () => {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New user form state
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '' });
  
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    setAttendees(getAttendees());
    setSettings(getSettings());
  }, []);

  const filteredAttendees = attendees.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    
    // Create new attendee manually
    const id = Math.random().toString(36).substr(2, 9).toUpperCase();
    const newAttendee: Attendee = {
      id,
      formId: 'manual',
      formTitle: 'Manual Entry',
      name: `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
      ticketType: 'Manual Issue',
      registeredAt: new Date().toISOString(),
      qrPayload: JSON.stringify({ id, action: 'checkin' })
    };

    // Simulate async
    setTimeout(() => {
        saveAttendee(newAttendee);
        setAttendees(getAttendees()); // refresh list
        setSelectedAttendee(newAttendee);
        setLoading(false);
        setSuccessMsg('Ticket Generated Successfully');
    }, 600);
  };

  const handleResend = () => {
    if (!selectedAttendee) return;
    setLoading(true);
    setSuccessMsg('');
    
    setTimeout(() => {
      setLoading(false);
      setSuccessMsg(`Email sent to ${selectedAttendee.email}`);
    }, 1000);
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
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[500px] flex flex-col">
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
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredAttendees.map(att => (
                <div 
                  key={att.id}
                  onClick={() => { setSelectedAttendee(att); setSuccessMsg(''); }}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    selectedAttendee?.id === att.id 
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' 
                    : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-gray-900">{att.name}</p>
                  <p className="text-xs text-gray-500">{att.email}</p>
                  {att.isTest && <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded">TEST</span>}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                </div>
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input required type="email" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition flex justify-center items-center gap-2">
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                Generate Ticket
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
              <span className={`text-xs px-2 py-1 rounded-full ${selectedAttendee.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {selectedAttendee.paymentStatus === 'paid' ? 'PAID' : 'STANDARD'}
              </span>
            </div>
            
            <div className="flex justify-center mb-6">
              <QRCodeSVG value={selectedAttendee.qrPayload} size={180} />
            </div>

            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">{selectedAttendee.name}</h3>
              <p className="text-gray-500 text-sm">{selectedAttendee.email}</p>
              <p className="text-xs font-mono text-gray-400 mt-2">{selectedAttendee.id}</p>
            </div>

            {successMsg && (
               <div className="mb-4 bg-green-50 text-green-700 p-2 rounded-lg text-sm text-center font-medium flex items-center justify-center gap-2 animate-fade-in">
                 <Check className="w-4 h-4" /> {successMsg}
               </div>
            )}

            <button 
              onClick={handleResend}
              disabled={loading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Send className="w-4 h-4" />}
              {successMsg ? 'Resend Email' : 'Send Ticket Email'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-gray-300" />
            </div>
            <p>Select an attendee or create a new one<br/>to generate a QR code ticket.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualTicketTool;