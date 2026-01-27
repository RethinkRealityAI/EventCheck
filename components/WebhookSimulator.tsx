import React, { useState } from 'react';
import { Webhook, Send, Check, Loader2 } from 'lucide-react';
import { Attendee } from '../types';
import QRCode from 'react-qr-code';

interface WebhookSimulatorProps {
  onRegister: (data: Omit<Attendee, 'registeredAt' | 'checkedInAt' | 'qrPayload'>) => void;
}

const WebhookSimulator: React.FC<WebhookSimulatorProps> = ({ onRegister }) => {
  const [formData, setFormData] = useState({
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    ticketType: 'VIP Admission'
  });
  const [loading, setLoading] = useState(false);
  const [lastTicket, setLastTicket] = useState<Attendee | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate Network Latency
    setTimeout(() => {
      const submissionID = crypto.randomUUID();
      const newAttendee = {
        id: submissionID,
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        ticketType: formData.ticketType,
      };

      onRegister(newAttendee);

      // We reconstruct the full attendee object here just for the preview
      setLastTicket({
        ...newAttendee,
        registeredAt: new Date().toISOString(),
        checkedInAt: null,
        qrPayload: JSON.stringify({ id: submissionID, action: 'checkin' })
      });

      setLoading(false);
    }, 1500);
  };

  const handleSendEmail = () => {
    alert(`Email simulated! Sent to ${formData.email} with ticket #${lastTicket?.id}`);
    setLastTicket(null); // Reset for next
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="mb-6 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Webhook className="w-5 h-5" />
            <h2 className="font-semibold text-lg">Jotform Webhook Simulator</h2>
          </div>
          <p className="text-sm text-gray-500">
            In a real scenario, Jotform sends a POST request to your backend.
            This form simulates receiving that payload.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Type</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              value={formData.ticketType}
              onChange={e => setFormData({ ...formData, ticketType: e.target.value })}
            >
              <option>General Admission</option>
              <option>VIP Admission</option>
              <option>Student</option>
              <option>Staff</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition flex justify-center items-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
            {loading ? 'Processing...' : 'Simulate Submission'}
          </button>
        </form>
      </div>

      {/* Result / Email Preview */}
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col items-center justify-center text-center">
        {lastTicket ? (
          <div className="w-full max-w-sm bg-white p-6 rounded-xl shadow-lg border border-gray-100 transform transition-all animate-fade-in-up">
            <div className="mb-4 text-green-500 flex justify-center">
              <div className="p-3 bg-green-100 rounded-full">
                <Check className="w-8 h-8" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Registration Complete</h3>
            <p className="text-gray-500 text-sm mb-6">Automated email ready to send.</p>

            <div className="border-t border-b border-dashed border-gray-300 py-6 mb-6">
              <div className="flex justify-center mb-4">
                <QRCode value={lastTicket.qrPayload} size={160} />
              </div>
              <p className="text-lg font-bold text-gray-900">{lastTicket.name}</p>
              <p className="text-sm text-indigo-600 font-medium">{lastTicket.ticketType}</p>
              <p className="text-xs text-gray-400 mt-2 font-mono">ID: {lastTicket.id}</p>
            </div>

            <button
              onClick={handleSendEmail}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Send Ticket Email
            </button>
          </div>
        ) : (
          <div className="text-gray-400">
            <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <Webhook className="w-6 h-6" />
            </div>
            <p>Waiting for webhook event...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebhookSimulator;