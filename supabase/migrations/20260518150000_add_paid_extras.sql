-- Paid additional booth staff for sponsor_exhibitor registrations.
--
-- Sponsors and exhibitors get tier/booth-allotted staff for free, but may now
-- purchase additional booth staff at $50 USD each (cap 10 per registration),
-- paid online via PayPal alongside the existing sponsor PayPal pattern.
--
-- The actual PayPal capture + attendee insert happens in the existing
-- `verify-payment` edge function. This migration only adds the dashboard
-- flag that distinguishes paid extras from tier-allotted staff.
--
-- `payment_method='paypal'` is already a valid value (see migration
-- 20260419120000) so no CHECK extension is needed. The PayPal capture id
-- already lands in `attendees.transaction_id`, so no new payment-id
-- columns are needed either.

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS is_paid_extra BOOLEAN NOT NULL DEFAULT false;

-- Useful for the dashboard "Extras" column aggregation per org. Filtered
-- partial index — extras rows are a small minority so a full index would
-- be wasteful.
CREATE INDEX IF NOT EXISTS attendees_paid_extras_idx
  ON attendees(primary_attendee_id) WHERE is_paid_extra = true;
