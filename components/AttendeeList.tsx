import React, { useState } from 'react';
import { Attendee } from '../types';
import { CheckCircle, Clock, Search, Calendar, Eye, X, Mail, Tag, User } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';

interface AttendeeListProps {
  attendees: Attendee[];
}

const AttendeeList: React.FC<AttendeeListProps> = ({ attendees }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'test'>('live');
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [resending, setResending] = useState(false);

  // Filter logic
  const filtered = attendees.filter(a => {
    const matchesSearch = 
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const isTest = !!a.isTest;
    const matchesTab = activeTab === 'test' ? isTest : !isTest;

    return matchesSearch && matchesTab;
  });

  const handleResendEmail = () => {
    setResending(true);
    // Simulate API call
    setTimeout(() => {
      alert(`Ticket resent to ${selectedAttendee?.email}`);
      setResending(false);
    }, 1000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Header & Tabs */}
      <div className="p-4 border-b border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-semibold text-lg text-gray-900">Registered Attendees</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search attendees..." 
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Live Attendees
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              activeTab === 'test' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Test / Previews
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-900 font-medium">
            <tr>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Event/Form</th>
              <th className="px-6 py-3">Ticket Type</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Registered</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  <User className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                  <p>No {activeTab} attendees found.</p>
                </td>
              </tr>
            ) : (
              filtered.map((attendee) => (
                <tr key={attendee.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{attendee.name}</div>
                    <div className="text-gray-400 text-xs">{attendee.email}</div>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-1.5 text-gray-700">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        <span className="truncate max-w-[150px] block" title={attendee.formTitle}>
                          {attendee.formTitle || 'Unknown Event'}
                        </span>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {attendee.ticketType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {attendee.checkedInAt ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-medium">
                        <CheckCircle className="w-4 h-4" /> Checked In
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="w-4 h-4" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                    {format(new Date(attendee.registeredAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedAttendee(attendee)}
                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-2 rounded-lg transition"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex justify-between">
         <span>Showing {filtered.length} records</span>
         {activeTab === 'test' && <span className="text-orange-600 font-medium">Test Data Mode</span>}
      </div>

      {/* Detail Modal */}
      {selectedAttendee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  {selectedAttendee.name}
                  {selectedAttendee.isTest && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">TEST</span>
                  )}
                </h3>
                <p className="text-sm text-gray-500">{selectedAttendee.email}</p>
              </div>
              <button 
                onClick={() => setSelectedAttendee(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Ticket & QR */}
                <div className="flex flex-col items-center space-y-6">
                   <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                      <QRCode value={selectedAttendee.qrPayload} size={180} />
                   </div>
                   <div className="w-full space-y-3">
                      <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                        <span className="text-gray-500">Status</span>
                        {selectedAttendee.checkedInAt ? (
                          <span className="text-green-600 font-bold flex items-center gap-1">
                             <CheckCircle className="w-4 h-4" /> Checked In
                          </span>
                        ) : (
                          <span className="text-gray-500 font-medium">Not Checked In</span>
                        )}
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                        <span className="text-gray-500">Payment</span>
                        <span className={`font-bold capitalize ${
                          selectedAttendee.paymentStatus === 'paid' ? 'text-green-600' : 'text-gray-700'
                        }`}>
                          {selectedAttendee.paymentStatus || 'Free'}
                        </span>
                      </div>
                      <button 
                        onClick={handleResendEmail}
                        disabled={resending}
                        className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                      >
                         <Mail className="w-4 h-4" /> {resending ? 'Sending...' : 'Resend Ticket Email'}
                      </button>
                   </div>
                </div>

                {/* Right Column: Details */}
                <div className="space-y-6">
                   <div>
                     <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Registration Details</h4>
                     <div className="space-y-3">
                        <div className="group">
                           <label className="text-xs text-gray-500 block mb-1">Registration ID</label>
                           <div className="text-sm font-mono bg-gray-50 px-2 py-1 rounded text-gray-700 select-all">
                             {selectedAttendee.id}
                           </div>
                        </div>
                        <div>
                           <label className="text-xs text-gray-500 block mb-1">Ticket Type</label>
                           <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                             <Tag className="w-4 h-4 text-indigo-500" /> {selectedAttendee.ticketType}
                           </div>
                        </div>
                        <div>
                           <label className="text-xs text-gray-500 block mb-1">Event</label>
                           <div className="text-sm text-gray-900">{selectedAttendee.formTitle}</div>
                        </div>
                        <div>
                           <label className="text-xs text-gray-500 block mb-1">Registered At</label>
                           <div className="text-sm text-gray-900">{format(new Date(selectedAttendee.registeredAt), 'PPpp')}</div>
                        </div>
                        {selectedAttendee.invoiceId && (
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Invoice ID</label>
                            <div className="text-sm font-mono text-gray-700">{selectedAttendee.invoiceId}</div>
                          </div>
                        )}
                     </div>
                   </div>

                   {/* Custom Answers */}
                   {selectedAttendee.answers && Object.keys(selectedAttendee.answers).length > 0 && (
                     <div>
                       <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 pt-4 border-t border-gray-100">Form Responses</h4>
                       <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
                          {Object.entries(selectedAttendee.answers).map(([key, val]) => (
                             <div key={key}>
                               <span className="text-xs text-gray-500 block mb-0.5 capitalize">{key.replace('field_', '').replace(/_/g, ' ')}</span>
                               <span className="text-sm text-gray-900 block bg-gray-50 px-2 py-1.5 rounded">
                                 {Array.isArray(val) ? val.join(', ') : String(val)}
                               </span>
                             </div>
                          ))}
                       </div>
                     </div>
                   )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendeeList;