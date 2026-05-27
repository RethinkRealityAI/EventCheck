-- Speaker promo checkout: verify-payment inserts guest_type='speaker' and
-- payment_method='promo'. The CHECK constraints from 20260419120000 never
-- included those values — inserts failed with 500 "database error completing
-- your free registration".
--
-- @check-constraint: probed — values from 20260419120000_add_sponsor_exhibitor.sql
-- plus 'speaker' (verify-payment since 20260526200000) and 'promo' (promo free path).

ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_guest_type_check;

ALTER TABLE attendees
  ADD CONSTRAINT attendees_guest_type_check
  CHECK (guest_type IS NULL OR guest_type IN (
    'adult', 'child',
    'pending-claim', 'claimed',
    'exhibitor-staff-pending', 'exhibitor-staff-claimed',
    'staff-pending', 'staff-claimed',
    'speaker'
  ));

ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_payment_method_check;

ALTER TABLE attendees
  ADD CONSTRAINT attendees_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN (
    'card', 'paypal', 'cheque', 'external', 'promo'
  ));
