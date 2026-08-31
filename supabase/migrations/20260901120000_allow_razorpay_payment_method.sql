-- 20260901120000_allow_razorpay_payment_method.sql
--
-- @check-constraint: probed
--
-- India congress registrations are collected in INR on the TSCS partner page
-- via THEIR Razorpay account; the tscs-email-ingest pipeline creates the
-- attendee rows on our side and stamps payment_method = 'razorpay'.
-- attendees_payment_method_check (last set in 20260629120000) only allowed
-- {card, paypal, flutterwave, cheque, external, promo, bogo}, so an ingest
-- INSERT would violate the constraint and fail the pipeline.
--
-- This change is PURELY ADDITIVE: the new allow-list is a strict superset of
-- the previous one, so no existing row — whatever its current payment_method —
-- can fail the new constraint (a superset constraint cannot reject any row the
-- prior constraint already accepted, making a live distinct-value probe moot).

-- @destructive: confirmed
ALTER TABLE public.attendees DROP CONSTRAINT IF EXISTS attendees_payment_method_check;

ALTER TABLE public.attendees ADD CONSTRAINT attendees_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (ARRAY['card', 'paypal', 'flutterwave', 'razorpay', 'cheque', 'external', 'promo', 'bogo']::text[])
  );
