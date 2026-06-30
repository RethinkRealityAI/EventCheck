-- 20260629120000_allow_flutterwave_payment_method.sql
--
-- @check-constraint: probed
--
-- Adds Flutterwave as a second online payment provider alongside PayPal.
-- verify-payment now stamps payment_method = 'flutterwave' on rows paid via
-- Flutterwave (card / bank transfer / mobile money / USSD), but
-- attendees_payment_method_check (last set in 20260613000000) only allowed
-- {card, paypal, cheque, external, promo, bogo}. A Flutterwave INSERT would
-- therefore violate the constraint and 500 the checkout.
--
-- This change is PURELY ADDITIVE: the new allow-list is a strict superset of
-- the previous one, so no existing row — whatever its current payment_method —
-- can fail the new constraint. (Live distinct-value probe was unavailable this
-- session due to MCP read restrictions; additivity makes the probe moot here,
-- since a superset constraint cannot reject any row the prior constraint
-- already accepted.)

-- @destructive: confirmed
ALTER TABLE public.attendees DROP CONSTRAINT IF EXISTS attendees_payment_method_check;

ALTER TABLE public.attendees ADD CONSTRAINT attendees_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (ARRAY['card', 'paypal', 'flutterwave', 'cheque', 'external', 'promo', 'bogo']::text[])
  );
