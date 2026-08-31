// The India registration gate.
//
// Indian attendees paying USD through PayPal get INSTRUMENT_DECLINED almost
// every time (RBI restrictions on international online card use), so India
// registrations are collected in ₹ by our local partner TSCS on THEIR page
// (tscsindia.org/gansid-registration) via their Razorpay account. This gate
// asks the one routing question up front and, for India, embeds the partner
// page instead of our form. Ticketing for those payments is driven by the
// tscs-email-ingest pipeline server-side — nothing else in our checkout runs.
//
// The gate must NEVER appear on invite/claim flows (free tickets, guest
// claims, staff claims): those carry a token, involve no payment, and an
// extra screen there would strand people. The host component guards that.

import React, { useState } from 'react';
import { ExternalLink, ArrowLeft, Globe2, IndianRupee } from 'lucide-react';
import type { IndiaPartnerConfig } from '../../utils/indiaPartner';

export { resolveIndiaPartner, type IndiaPartnerConfig } from '../../utils/indiaPartner';

/** Step 0: "Where are you registering from?" */
export const IndiaGateChooser: React.FC<{
  eventName: string;
  partnerName: string;
  onChoose: (choice: 'india' | 'international') => void;
}> = ({ eventName, partnerName, onChoose }) => (
  <div className="max-w-xl w-full mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden relative z-10 border border-white/20">
    <div className="px-8 py-6 text-center bg-gansid-primary-gradient">
      <h1 className="text-2xl font-black text-white mb-1">{eventName}</h1>
      <p className="text-white/90 text-sm font-medium">One quick question before you register</p>
    </div>
    <div className="p-8 space-y-4">
      <h2 className="text-lg font-bold text-gray-900 text-center">Are you registering from India?</h2>
      <p className="text-sm text-gray-500 text-center -mt-2">
        This decides how you pay — Indian cards and UPI work best through our local partner.
      </p>
      <button
        type="button"
        data-testid="india-gate-yes"
        onClick={() => onChoose('india')}
        className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition text-left"
      >
        <span className="shrink-0 w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center">
          <IndianRupee className="w-5 h-5 text-orange-600" />
        </span>
        <span>
          <span className="block font-bold text-gray-900">Yes — I'm registering from India</span>
          <span className="block text-sm text-gray-500 mt-0.5">
            Pay in ₹ by UPI, Indian card or net-banking via {partnerName}, our official local partner.
          </span>
        </span>
      </button>
      <button
        type="button"
        data-testid="india-gate-no"
        onClick={() => onChoose('international')}
        className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition text-left"
      >
        <span className="shrink-0 w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center">
          <Globe2 className="w-5 h-5 text-blue-600" />
        </span>
        <span>
          <span className="block font-bold text-gray-900">No — I'm registering from another country</span>
          <span className="block text-sm text-gray-500 mt-0.5">
            Continue to the standard registration and pay in USD.
          </span>
        </span>
      </button>
    </div>
  </div>
);

/** The India path: the partner's registration page, embedded. */
export const IndiaPartnerEmbed: React.FC<{
  config: IndiaPartnerConfig;
  eventName: string;
  onBack: () => void;
}> = ({ config, eventName, onBack }) => {
  const [frameLoaded, setFrameLoaded] = useState(false);
  return (
    <div className="w-full max-w-4xl mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden relative z-10 border border-white/20 flex flex-col">
      <div className="px-6 py-4 bg-gansid-primary-gradient flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white">{eventName} — India Registration</h1>
          <p className="text-white/90 text-xs font-medium">
            Handled by {config.partnerName} · pay in ₹ (UPI / card / net-banking)
          </p>
        </div>
        <button
          type="button"
          data-testid="india-gate-back"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-semibold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Not in India?
        </button>
      </div>

      <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-900 flex items-center justify-between gap-3 flex-wrap">
        <span>
          We've partnered with the <strong>Thalassemia and Sickle Cell Society (TSCS)</strong> to
          enable smoother payments in India. Complete the form and payment below — your congress
          ticket is emailed to you once the payment is confirmed, so{' '}
          <strong>use the same email address everywhere</strong>.
        </span>
        <a
          href={config.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="india-open-new-tab"
          className="inline-flex items-center gap-1.5 shrink-0 font-semibold text-blue-700 hover:text-blue-900 underline"
        >
          Open in a new tab <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="relative bg-gray-50" style={{ minHeight: '75vh' }}>
        {!frameLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-sm gap-2 p-8 text-center">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p>Loading the {config.partnerName} registration page…</p>
            <p className="text-xs text-gray-400">
              If it doesn't appear, use the "Open in a new tab" link above — it's the same page.
            </p>
          </div>
        )}
        {/* No sandbox attribute: the page runs Razorpay checkout, which needs
            full script/navigation capability. allow="payment" is required for
            the payment request inside a cross-origin frame. */}
        <iframe
          src={config.pageUrl}
          title={`${config.partnerName} — GANSID India registration`}
          data-testid="india-partner-iframe"
          onLoad={() => setFrameLoaded(true)}
          allow="payment *"
          className="relative w-full border-0"
          style={{ height: '75vh', minHeight: 620 }}
        />
      </div>
    </div>
  );
};
