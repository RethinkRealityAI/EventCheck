// services/paymentDiagnosticsService.ts
//
// Durable trail for checkout failures that happen BEFORE our server is ever
// involved — a rejected PayPal order-create, a card flow the buyer's browser
// couldn't complete, a Flutterwave modal that errored. Those used to land in
// the buyer's console and nowhere else, so a report of "PayPal isn't working"
// left nothing to trace.
//
// The payload is posted to the existing `verify-payment` function, which logs
// it (no DB write, no value given) so it shows up in the project's edge
// function logs alongside the capture-side failures already logged there.
// Strictly best-effort: a diagnostic must never surface an error of its own or
// block a retry.

import { supabase } from './supabaseClient';

export interface PaymentFailureReport {
  provider: 'paypal' | 'flutterwave';
  /**
   * Where in the flow it broke.
   *  - 'paypal-onerror' / 'flutterwave-onerror' — the SDK failed before we were
   *    ever involved. No money moved.
   *  - 'capture-failed' — the buyer APPROVED and our server then failed to
   *    capture or insert. This is the dangerous one: the buyer has seen a
   *    PayPal confirmation and believes they paid, while we hold no record.
   *    Always carries `orderRef` so an admin can find the order in PayPal and
   *    capture or void it.
   */
  stage: string;
  formId?: string | null;
  amount?: string | null;
  currency?: string | null;
  /** PayPal order id / Flutterwave transaction id — the recovery key. */
  orderRef?: string | null;
  /** PayPal debug_id / issue code when the SDK exposed one. */
  reference?: string | null;
  message?: string | null;
  /** Who it was, so the admin can reach them without guessing. */
  email?: string | null;
  attendeeName?: string | null;
}

export async function logPaymentFailure(report: PaymentFailureReport): Promise<void> {
  try {
    await supabase.functions.invoke('verify-payment', {
      body: {
        mode: 'log-payment-error',
        provider: report.provider,
        stage: report.stage,
        formId: report.formId ?? null,
        amount: report.amount ?? null,
        currency: report.currency ?? null,
        orderRef: report.orderRef ?? null,
        reference: report.reference ?? null,
        message: report.message ?? null,
        email: report.email ?? null,
        attendeeName: report.attendeeName ?? null,
        // Context that decides whether a failure is environmental: the card
        // flow behaves differently inside the cross-origin Congress embed.
        embedded: typeof window !== 'undefined' ? window.top !== window.self : null,
        pageUrl: typeof window !== 'undefined' ? window.location.href.slice(0, 300) : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      },
    });
  } catch (e) {
    console.warn('payment diagnostic post failed', e);
  }
}
