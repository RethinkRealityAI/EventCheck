-- Remove the unpaid/cancelled TSCS registrations, then make the class of bug
-- that created them impossible at the database level.
--
-- WHAT HAPPENED
-- TSCS's WordPress sends a "[PENDING] Incomplete Registration" notice for an
-- ABANDONED checkout that is structurally identical to a real confirmation:
-- same table of registration details, same registrant, same amount. The only
-- differences are the subject marker, the words "Amount Due" instead of
-- "Amount Paid", and the absence of a Razorpay transaction id.
--
-- The ingest keyed off "did this parse into a registration", not "did anyone
-- pay". Both of one registrant's abandoned attempts (REG-00021, REG-00022)
-- were registered as paid and emailed congress tickets. When he later
-- completed payment, the real confirmation registered him a third time — so
-- one person held three tickets, two of them for money never collected. The
-- give-away is in the rows themselves: their transaction_id is the email's
-- message id, because there was no payment id to use.
--
-- The three layers that now stand between a pending notice and a ticket:
--   1. paymentStateOf() — a pending marker anywhere outranks everything else
--      (shipped 2026-09-03, PR #31).
--   2. classifyTscsMessage() — nothing auto-registers without a Razorpay
--      payment id, even if the subject says [PAID]; ambiguity goes to the
--      review queue. buildTscsAttendeeRows() refuses to build the rows at all.
--   3. this constraint — no code path, present or future, can write a paid
--      Razorpay attendee whose transaction_id is not a Razorpay payment id.
--
-- Layers 1 and 2 are code and can regress. Layer 3 cannot.

-- ── 1. The two unpaid rows ────────────────────────────────────────────────
-- The REG-00021 and REG-00022 pending notices. The same registrant's REAL row
-- (pay_TXTbLRamVUH3bp) is deliberately untouched.
-- @destructive: confirmed
DELETE FROM public.attendees
WHERE id IN (
  '9feeb23a-b4ce-432e-af71-cf7a9d681a75',
  'b6039a43-00ea-431b-b5aa-d2e7b19bbb60'
);

-- ── 2. A cancelled pair of test registrations ─────────────────────────────
-- Removed at the registrant's own request (ticket-cancellation email of
-- 2026-09-02), confirmed as test bookings. NOTE for whoever reads this later:
-- Razorpay payment pay_TVUDr8BBWJq3px was genuinely collected by TSCS.
-- Deleting these rows cancels the tickets; it does NOT refund the money.
-- @destructive: confirmed
DELETE FROM public.attendees
WHERE id IN (
  '9866888d-c03f-453f-acc2-54cfd9e8d150',
  'dc4b9235-c2af-4c7e-88b8-b4cad116f730'
);

-- ── 3. Make the audit trail tell the truth ────────────────────────────────
-- These two messages are recorded as having produced a registration. They no
-- longer have one, and re-reading the mailbox cannot correct that: the
-- messages are flagged \Seen and the audit table is unique on message_id.
UPDATE public.tscs_email_registrations
SET status = 'ignored',
    attendee_id = NULL,
    error = 'TSCS pending notice — checkout was not completed. Registered in error by the pre-2026-09-03 ingest; attendee row removed 2026-09-03.'
WHERE message_id IN (
  '<t8lxTBUlG1eDFctG87FEDDiXAe7lsSdXzJwmIDc@www.tscsindia.org>',
  '<bMCNZk2s0KsHZGgCNwORwx9mGPCUthvNeQZcNCUfeA@www.tscsindia.org>'
);

UPDATE public.tscs_email_registrations
SET attendee_id = NULL,
    error = 'Registration cancelled at the registrant''s request 2026-09-03 (test bookings); attendee rows removed.'
WHERE message_id = '<6rGuEIfBJ1zTARkqwvFbFLy8b5oqWS3QUkDZsCmFFU@www.tscsindia.org>';

-- ── 4. The guarantee ──────────────────────────────────────────────────────
-- A paid Razorpay attendee must carry a Razorpay payment id. Group members
-- get the purchaser's id with a -pN suffix (buildTscsAttendeeRows); test
-- rehearsals get a test- prefix so they occupy their own dedupe keyspace.
--
-- Free companions are unaffected: they are payment_status 'free' with a NULL
-- payment_method, so the first two clauses let them through.
--
-- Probed on production before writing (CLAUDE.md §16 rule 3): every razorpay
-- row on GANSID was checked against this regex. The only failures were the two
-- rows deleted in step 1; SCAGO has no razorpay rows at all.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendees_razorpay_requires_payment_id'
  ) THEN
    ALTER TABLE public.attendees
      ADD CONSTRAINT attendees_razorpay_requires_payment_id CHECK (
        payment_method IS DISTINCT FROM 'razorpay'
        OR payment_status IS DISTINCT FROM 'paid'
        OR transaction_id ~ '^(test-)?pay_[A-Za-z0-9]+(-p[0-9]+)?$'
      );
  END IF;
END $$;
