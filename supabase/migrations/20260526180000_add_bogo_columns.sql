-- Adds BOGO (Buy-One-Get-One-Free) claim columns to attendees.
--
-- Each paid attendee on a BOGO-enabled event form can unlock one free guest
-- ticket of equal-or-lesser value, compared at the payer's tier+bracket.
-- The free guest row is a real attendees row of its own (with its own QR
-- and email), linked back to the paying source via bogo_source_attendee_id.
--
-- The 1:1 invariant (one free per paid) is enforced by a partial unique
-- index on bogo_source_attendee_id where is_bogo_claim is true. This catches
-- concurrent inserts (two admins / two tabs racing to send the same paid
-- ticket's BOGO slot) at the DB level — the loser gets a unique-violation
-- the application converts to a 409 BOGO_SLOT_TAKEN.
--
-- bogo_dismissed_by_payer_at is cosmetic only — when the payer hides a
-- BOGO claim from their "My Tickets" view, this timestamp is set. It does
-- NOT free the slot (per spec: dismiss is a hide, not a revoke), so the
-- unique index still counts the row.
--
-- Fully additive — defaults make existing rows read as "not a BOGO claim",
-- which is correct.
--
-- See docs/superpowers/specs/2026-05-26-bogo-gansid-design.md.

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS is_bogo_claim BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bogo_source_attendee_id UUID
    REFERENCES attendees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bogo_dismissed_by_payer_at TIMESTAMPTZ NULL;

-- 1:1 invariant: at most one free claim row per paid source attendee.
-- Partial index covers only the rows that participate, which is a small
-- fraction of all attendees.
CREATE UNIQUE INDEX IF NOT EXISTS attendees_bogo_one_per_paid_idx
  ON attendees (bogo_source_attendee_id)
  WHERE is_bogo_claim = true AND bogo_source_attendee_id IS NOT NULL;

-- Helper index for the portal "My Tickets" Pass-2 query:
-- "find BOGO claim rows referencing my paid attendees, even when their
-- own user_id IS NULL because the guest hasn't claimed yet".
CREATE INDEX IF NOT EXISTS attendees_bogo_source_lookup_idx
  ON attendees (bogo_source_attendee_id)
  WHERE is_bogo_claim = true;

-- RLS: the payer (= owner of the paid source row) must be able to read
-- their linked free claim rows for the portal "My Tickets" page, even
-- when the free row has user_id IS NULL (pre-claim claim-link mode).
-- This policy is purely additive — existing user_id-based policies stay
-- in effect for the payer's own rows.
DROP POLICY IF EXISTS "users_can_see_their_bogo_claims" ON attendees;
CREATE POLICY "users_can_see_their_bogo_claims" ON attendees
  FOR SELECT
  USING (
    bogo_source_attendee_id IN (
      SELECT id FROM attendees WHERE user_id = auth.uid()
    )
  );
