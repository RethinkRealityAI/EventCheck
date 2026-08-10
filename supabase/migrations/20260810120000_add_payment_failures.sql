-- Durable record of checkout failures.
--
-- WHY
-- A registrant reported completing PayPal ("Thank you for your payment"), no
-- money leaving her account, no confirmation email — and there was NOTHING to
-- investigate with. `logPaymentFailure` posted diagnostics to verify-payment,
-- which only console.logged them into edge-function logs that nobody reads and
-- that age out. Worse, the post-approval path (PayPal approved → our capture or
-- insert failed) did not report at all: no attendee row, no diagnostic, no
-- trace. The buyer is left believing they paid.
--
-- This table makes those failures visible and, critically, keeps the PayPal
-- order id so an admin can look the order up and capture or void it.
--
-- Not payment data: no card details, no tokens. Just enough to trace an
-- attempt back to a person and an order.

CREATE TABLE IF NOT EXISTS public.payment_failures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  provider     text,
  -- Where in the flow it broke: 'paypal-onerror' (SDK/order-create) vs
  -- 'capture-failed' (approved but our server never completed it — the
  -- dangerous one, because the buyer thinks they paid).
  stage        text,
  form_id      text,
  -- PayPal order id / Flutterwave transaction id. The recovery key.
  order_ref    text,
  amount       text,
  currency     text,
  reference    text,
  message      text,
  email        text,
  attendee_name text,
  page_url     text,
  user_agent   text,
  embedded     boolean,
  resolved_at  timestamptz,
  resolved_note text
);

CREATE INDEX IF NOT EXISTS idx_payment_failures_occurred
  ON public.payment_failures (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_failures_unresolved
  ON public.payment_failures (occurred_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.payment_failures ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Writes come from verify-payment via the service role, which
-- bypasses RLS — deliberately NO anon insert policy, so the table can't be
-- spammed with forged rows from the public bundle.
DROP POLICY IF EXISTS payment_failures_admin_read ON public.payment_failures;
CREATE POLICY payment_failures_admin_read ON public.payment_failures
  FOR SELECT TO authenticated
  USING (public.is_portal_admin());

DROP POLICY IF EXISTS payment_failures_admin_update ON public.payment_failures;
CREATE POLICY payment_failures_admin_update ON public.payment_failures
  FOR UPDATE TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
