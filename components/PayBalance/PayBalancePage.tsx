import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { getSettings } from '../../services/storageService';
import { extractInvokeError } from '../../utils/emailSendErrors';

// Same env resolution PublicRegistration uses (its helper is component-local).
const getEnvVar = (name: string): string => {
  try {
    return (import.meta as any).env[name] || '';
  } catch {
    return '';
  }
};

// Standalone balance payment — /#/pay?token=…
//
// The recipient is ALREADY registered and ticketed; only money is outstanding.
// So this page shows the amount and a PayPal button and nothing else. No form
// fields, no login — the signed token is the credential, and the server
// re-verifies the amount against the attendee ROW at capture (the client total
// is never trusted).

type Resolved =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'settled'; message: string; eventTitle?: string }
  | { state: 'payable'; name: string | null; eventTitle: string; ticketType: string | null; amountCents: number; currency: string }
  | { state: 'paid-now'; transactionId: string };

export const PayBalancePage: React.FC = () => {
  const location = useLocation();
  // HashRouter: params live inside location.search AS SEEN BY the router
  // (never window.location.search, which is empty under a hash router).
  const token = useMemo(
    () => new URLSearchParams(location.search).get('token') ?? '',
    [location.search],
  );

  const [resolved, setResolved] = useState<Resolved>({ state: 'loading' });
  const [paypalClientId, setPaypalClientId] = useState('');
  const [payError, setPayError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setResolved({ state: 'error', message: 'This payment link is incomplete. Please use the link from your email.' });
        return;
      }
      // Same client-id resolution as PublicRegistration: env first, settings fallback.
      try {
        const settings = await getSettings();
        const env = (getEnvVar('VITE_PAYPAL_ENV') || 'live').toLowerCase();
        const id = (env === 'sandbox'
          ? (getEnvVar('VITE_PAYPAL_SANDBOX_CLIENT_ID') || getEnvVar('VITE_PAYPAL_CLIENT_ID'))
          : getEnvVar('VITE_PAYPAL_CLIENT_ID')) || settings?.paypalClientId || '';
        if (!cancelled) setPaypalClientId(id);
      } catch { /* PayPal button simply won't render; the error copy below covers it */ }

      const { data, error } = await supabase.functions.invoke('pay-balance', {
        body: { action: 'resolve', token },
      });
      if (cancelled) return;
      if (error) {
        setResolved({ state: 'error', message: await extractInvokeError(error) });
        return;
      }
      if (data?.status === 'payable') {
        setResolved({
          state: 'payable',
          name: data.name ?? null,
          eventTitle: data.eventTitle ?? 'the event',
          ticketType: data.ticketType ?? null,
          amountCents: Number(data.amountCents),
          currency: String(data.currency ?? 'USD'),
        });
      } else {
        // already-paid / free / cheque / external / not-found — all end states.
        setResolved({ state: 'settled', message: String(data?.message ?? 'There is nothing to pay.'), eventTitle: data?.eventTitle });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const amountLabel = resolved.state === 'payable'
    ? `${(resolved.amountCents / 100).toFixed(2)} ${resolved.currency}`
    : '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gansid-primary-gradient px-6 py-5">
          <h1 className="text-white font-semibold text-lg">
            {resolved.state === 'payable' ? resolved.eventTitle : 'Payment'}
          </h1>
          {resolved.state === 'payable' && (
            <p className="text-white/85 text-sm mt-0.5">Complete your registration payment</p>
          )}
        </div>

        <div className="p-6">
          {resolved.state === 'loading' && (
            <div className="py-10 text-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin inline" />
            </div>
          )}

          {resolved.state === 'error' && (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700">{resolved.message}</p>
            </div>
          )}

          {resolved.state === 'settled' && (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700">{resolved.message}</p>
            </div>
          )}

          {resolved.state === 'paid-now' && (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <h2 className="font-semibold text-gray-900 mb-1">Payment received — you're all set</h2>
              <p className="text-sm text-gray-600">
                Your registration is fully confirmed. A record of this payment has been attached to it.
              </p>
              <p className="text-xs text-gray-400 mt-3 font-mono">Ref: {resolved.transactionId}</p>
            </div>
          )}

          {resolved.state === 'payable' && (
            <>
              {resolved.name && (
                <p className="text-sm text-gray-600 mb-1">Registered to <strong>{resolved.name}</strong></p>
              )}
              {resolved.ticketType && (
                <p className="text-sm text-gray-600 mb-4">{resolved.ticketType}</p>
              )}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 mb-5 text-center">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Amount due</p>
                <p className="text-3xl font-bold text-gray-900">{amountLabel}</p>
              </div>

              {payError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 mb-4">{payError}</p>
              )}

              {paypalClientId ? (
                // key = clientId ONLY (standing rule): keying on anything
                // volatile hard-remounts the SDK and destroys an in-progress
                // card entry form.
                <div key={paypalClientId}>
                  <PayPalScriptProvider options={{ clientId: paypalClientId, currency: resolved.currency }}>
                    <PayPalButtons
                      style={{ layout: 'vertical', label: 'pay' }}
                      createOrder={(_d, actions) => actions.order.create({
                        intent: 'CAPTURE',
                        purchase_units: [{
                          amount: {
                            currency_code: resolved.currency,
                            value: (resolved.amountCents / 100).toFixed(2),
                          },
                          description: `${resolved.eventTitle} — registration balance`,
                        }],
                      })}
                      onApprove={async (approveData) => {
                        setPayError('');
                        const { data, error } = await supabase.functions.invoke('pay-balance', {
                          body: { action: 'capture', token, paypalOrderId: approveData.orderID },
                        });
                        if (error) {
                          setPayError(await extractInvokeError(error));
                          return;
                        }
                        if (data?.ok) {
                          setResolved({ state: 'paid-now', transactionId: String(data.transactionId ?? '') });
                        } else {
                          setPayError(String(data?.error ?? 'The payment could not be completed.'));
                        }
                      }}
                      onError={() => setPayError('PayPal could not start the payment. Please try again, or contact the organizers if it persists.')}
                    />
                  </PayPalScriptProvider>
                </div>
              ) : (
                <p className="text-sm text-gray-600 text-center">
                  Online payment is not available right now. Please contact the organizers.
                </p>
              )}

              <p className="text-xs text-gray-400 mt-4 text-center">
                Already paid? Don't pay twice — reply to the email this link came from and we'll reconcile it.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayBalancePage;
