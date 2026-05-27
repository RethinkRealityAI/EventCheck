-- Adds applied_promo_code column to attendees.
--
-- Stamped server-side from the validated promo code (NOT the raw client
-- input) by verify-payment when a registrant uses a promo. NULL when no
-- code was used, which is the overwhelming majority of rows. Used by:
--   * Dashboard tooltip — "Promo: SPEAKER2026" badge on the attendee row
--   * Reporting — count of registrations attributed to each code
--   * Audit trail — pairs with the `guest_type='speaker'` stamping path
--     so admins can answer "which promo set this person as a speaker?"
--
-- Fully additive: existing rows read as NULL (correct).

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS applied_promo_code TEXT NULL;

-- Partial index — most rows never have a promo code, full index would
-- waste space. Speeds the reporting query "how many registrations used
-- SPEAKER2026?".
CREATE INDEX IF NOT EXISTS attendees_applied_promo_code_idx
  ON attendees (applied_promo_code)
  WHERE applied_promo_code IS NOT NULL;
