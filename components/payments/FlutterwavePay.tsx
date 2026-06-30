import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

// Flutterwave inline checkout (v3.js). We load the official script on demand
// and call the global `FlutterwaveCheckout` rather than pulling in
// `flutterwave-react-v3`, which has flaky React 19 peer support. This keeps the
// dependency footprint at zero and mirrors the raw-integration style the rest
// of the payment stack already uses.
//
// The charge completes inside Flutterwave's modal (card / bank transfer /
// mobile money / USSD). On success the callback hands us a `transaction_id`
// which the caller forwards to the `verify-payment` edge function — the server
// re-queries Flutterwave to confirm before giving value. Nothing here is
// trusted as proof of payment on its own.

const FLW_SCRIPT_SRC = 'https://checkout.flutterwave.com/v3.js';

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: Record<string, any>) => { close: () => void };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadFlutterwaveScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.FlutterwaveCheckout) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FLW_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.FlutterwaveCheckout) { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => {
        // A previously-failed tag never fires load again — drop it and reset so
        // the next call appends a fresh script rather than wedging forever.
        existing.remove();
        scriptPromise = null;
        reject(new Error('Failed to load Flutterwave checkout'));
      });
      return;
    }
    const script = document.createElement('script');
    script.src = FLW_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptPromise = null; // allow a retry on the next click
      reject(new Error('Failed to load Flutterwave checkout'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface FlutterwavePayProps {
  publicKey: string;
  /** Major currency units, e.g. 100.50 — same value shown in the order summary. */
  amount: number;
  currency: string;
  /** Prefix for the generated transaction reference (e.g. site/form key). */
  txRefPrefix?: string;
  customerEmail?: string;
  customerName?: string;
  title?: string;
  description?: string;
  /**
   * Optional comma-separated payment_options. When omitted, Flutterwave shows
   * every method enabled on the merchant account.
   */
  paymentOptions?: string;
  disabled?: boolean;
  label?: string;
  onSuccess: (transactionId: string, txRef: string) => void;
  onError: (message: string) => void;
  onClose?: () => void;
}

export const FlutterwavePay: React.FC<FlutterwavePayProps> = ({
  publicKey,
  amount,
  currency,
  txRefPrefix,
  customerEmail,
  customerName,
  title,
  description,
  paymentOptions,
  disabled,
  label = 'Pay with card / mobile money',
  onSuccess,
  onError,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    // Fresh, unique reference per attempt — the server cross-checks this.
    const txRef = `${txRefPrefix ? `${txRefPrefix}-` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await loadFlutterwaveScript();
      if (!window.FlutterwaveCheckout) {
        throw new Error('Flutterwave checkout unavailable');
      }
      const modal = window.FlutterwaveCheckout({
        public_key: publicKey,
        tx_ref: txRef,
        amount,
        currency,
        ...(paymentOptions ? { payment_options: paymentOptions } : {}),
        customer: {
          email: customerEmail || 'guest@example.com',
          name: customerName || undefined,
        },
        customizations: {
          title: title || 'Event Registration',
          description: description || 'Event Registration',
        },
        callback: (response: any) => {
          try {
            modal.close();
          } catch {
            /* modal may already be closed */
          }
          const status = String(response?.status || '').toLowerCase();
          const transactionId = response?.transaction_id ?? response?.transactionId;
          const succeeded = status === 'successful' || status === 'completed' || status === 'success';
          if (succeeded && transactionId) {
            onSuccess(String(transactionId), String(response?.tx_ref ?? txRef));
          } else if (succeeded && !transactionId) {
            // Charge looks successful but we got no id to verify with — the money
            // may have moved, so do NOT tell them to simply retry.
            onError('Your payment may have gone through but we could not confirm it. Please contact the event organizer before trying again.');
          } else {
            onError('Payment was not completed. Please try again.');
          }
        },
        onclose: () => {
          // Fires after the callback (on success) or when the user dismisses
          // the modal — the only correct place to re-enable the button, since
          // FlutterwaveCheckout() returns synchronously while the modal is open.
          setLoading(false);
          onClose?.();
        },
      });
    } catch (e) {
      // Only reset here: a synchronous failure to OPEN the modal. On the happy
      // path the button stays disabled until onclose, preventing a second modal.
      setLoading(false);
      onError((e as Error).message || 'Could not start the payment. Please try again.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#f5a623] px-4 py-3 font-semibold text-[#1a1a2e] transition hover:bg-[#e69612] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
      {loading ? 'Opening secure checkout…' : label}
    </button>
  );
};

export default FlutterwavePay;
