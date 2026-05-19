-- Adds the is_donated_seat_claim flag to attendees.
--
-- Donor attendees set `donated_seats` (count) on their own row when registering
-- and donating seats for others. Until now there was no way to MARK the
-- receiving attendees as "claiming a donated seat" — admin manually creating
-- a ticket for a donation recipient had no place to record that the new row
-- consumes the donor's pool. The dashboard's Donated Seats card therefore
-- showed only the total donated, with no "available" calculation.
--
-- This migration adds a boolean column so admins can flag the recipient row
-- at create time. The dashboard / available-pool calculation is purely
-- derived: `available = SUM(donated_seats) - COUNT(is_donated_seat_claim)`.
-- No pool-tracking table needed.
--
-- Fully additive — defaults to false so every existing row reads as
-- "not a donated seat claim" (correct).

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS is_donated_seat_claim BOOLEAN NOT NULL DEFAULT false;

-- Partial index because claims are a small minority of all attendee rows;
-- a full index would waste space without speeding up the typical
-- dashboard query (count of claims, list of recent claimants).
CREATE INDEX IF NOT EXISTS attendees_donated_seat_claim_idx
  ON attendees(form_id) WHERE is_donated_seat_claim = true;
