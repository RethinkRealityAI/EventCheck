-- 20260613000000_allow_bogo_payment_method.sql
--
-- @check-constraint: probed
--
-- Root cause of "BOGO send returns a non-2xx error": every BOGO free row is
-- built with payment_method = 'bogo' (see _shared/bogoRowBuilder.ts, the
-- documented canonical value in types.ts), but attendees_payment_method_check
-- only allowed {card, paypal, cheque, external, promo}. The free-row INSERT
-- therefore violated the constraint and 500'd on BOTH at-checkout
-- (verify-payment) and portal (bogo-send) paths — BOGO never created a row
-- (count = 0 on both tenants).
--
-- Probed distinct values 2026-06-12 (CLAUDE.md §16 rule 3):
--   GANSID (gticuvgclbvhwvpzkuez): {promo, NULL}
--   SCAGO  (iigbgbgakevcgilucvbs): {cheque, NULL}
-- Both are subsets of the existing allow-list, so adding 'bogo' is purely
-- additive — no existing row can fail the new constraint.

-- @destructive: confirmed
ALTER TABLE public.attendees DROP CONSTRAINT IF EXISTS attendees_payment_method_check;

ALTER TABLE public.attendees ADD CONSTRAINT attendees_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (ARRAY['card', 'paypal', 'cheque', 'external', 'promo', 'bogo']::text[])
  );
