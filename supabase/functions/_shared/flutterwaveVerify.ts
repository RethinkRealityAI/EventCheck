// Flutterwave v3 server-side transaction verification.
//
// Mirrors the role of the inlined PayPal OAuth+capture block in
// verify-payment/index.ts, but is far simpler: Flutterwave Standard completes
// the charge on the client (card / bank transfer / mobile money / USSD), so the
// server only RE-QUERIES the transaction to confirm it before giving value.
// A single authenticated GET — no OAuth token exchange.
//
// Security model (per Flutterwave's own guidance):
//   - Trust ONLY the server-confirmed `data.id` as the transaction id / dedupe
//     key, never the client-supplied id.
//   - The caller (verify-payment) re-validates amount + currency against the
//     server-recomputed expected values; this module does NOT compute expected.
//
// Uses only fetch + Deno.env (present in the edge runtime). Keep it dependency
// free so it stays easy to reason about and test.

const FLW_VERIFY_BASE = 'https://api.flutterwave.com/v3/transactions';

export interface FlwVerifyResult {
  ok: true;
  transactionId: string; // Flutterwave data.id (numeric → string) — the dedupe key
  txRef: string; // data.tx_ref
  amountMajorUnits: number; // data.amount — Flutterwave returns MAJOR units
  currency: string; // data.currency
}

export interface FlwVerifyError {
  ok: false;
  status: number; // HTTP status the caller should surface
  error: string;
}

export async function verifyFlutterwaveTransaction(args: {
  flwTransactionId: string; // from the client callback (resp.transaction_id)
  // Server-derived token (e.g. a formId fragment) that the AUTHENTICATED
  // data.tx_ref must contain. Unlike trusting the client's echoed tx_ref, this
  // binds the verified transaction to the registration's form: a replayed
  // transaction id from a different form (hence different tx_ref) is rejected.
  requireTxRefContains?: string;
  useTestMode: boolean;
}): Promise<FlwVerifyResult | FlwVerifyError> {
  const flwTransactionId = String(args.flwTransactionId || '').trim();
  if (!flwTransactionId) {
    return { ok: false, status: 400, error: 'flwTransactionId required' };
  }

  // Test-mode keys are prefixed FLWSECK_TEST. Fall back to the live secret so a
  // single-key setup still works.
  const secret = (
    args.useTestMode
      ? (Deno.env.get('FLW_TEST_SECRET_KEY') || Deno.env.get('FLW_SECRET_KEY'))
      : Deno.env.get('FLW_SECRET_KEY')
  )?.trim();

  if (!secret) {
    return { ok: false, status: 500, error: 'Flutterwave secret key not configured on server' };
  }

  let resp: Response;
  try {
    resp = await fetch(
      `${FLW_VERIFY_BASE}/${encodeURIComponent(flwTransactionId)}/verify`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
  } catch (e) {
    return { ok: false, status: 502, error: `Flutterwave verify request failed: ${(e as Error).message}` };
  }

  let json: any;
  try {
    json = await resp.json();
  } catch {
    return { ok: false, status: 502, error: 'Flutterwave verify returned a non-JSON response' };
  }

  const d = json?.data;
  if (!resp.ok || json?.status !== 'success' || !d) {
    return { ok: false, status: 502, error: `Flutterwave verify failed: ${json?.message ?? 'unknown error'}` };
  }

  // The charge itself must have succeeded.
  if (d.status !== 'successful') {
    return { ok: false, status: 402, error: `Payment not successful (status=${d.status ?? 'unknown'})` };
  }

  // Defensive: a successful transaction must carry an id (our dedupe key).
  if (d.id === undefined || d.id === null || d.id === '') {
    return { ok: false, status: 502, error: 'Flutterwave verify returned no transaction id' };
  }

  // Bind the authenticated transaction to this registration's form. We check
  // the tx_ref FROM THE VERIFY RESPONSE (not the client's echo), so a replayed
  // id created for a different form is rejected.
  if (args.requireTxRefContains && !String(d.tx_ref ?? '').includes(args.requireTxRefContains)) {
    return { ok: false, status: 422, error: 'Transaction does not belong to this registration' };
  }

  return {
    ok: true,
    transactionId: String(d.id),
    txRef: String(d.tx_ref ?? ''),
    amountMajorUnits: Number(d.amount),
    currency: String(d.currency ?? ''),
  };
}
