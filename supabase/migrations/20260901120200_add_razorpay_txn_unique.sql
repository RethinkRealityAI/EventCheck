-- 20260901120200_add_razorpay_txn_unique.sql
--
-- Database backstop for the TSCS ingest dedupe. The tscs-email-ingest edge
-- function dedupes on attendees.transaction_id (the Razorpay payment id, or a
-- deterministic tscs-<message_id> fallback) with a select-then-insert, and
-- handles 23505 as "duplicate" — but only a real unique index makes the race
-- between two concurrent polls (cron + manual dispatch) actually lose safely.
--
-- The index is PARTIAL on payment_method = 'razorpay' on purpose: a global
-- unique index would break existing flows — PayPal group registrations
-- legitimately share one capture id across the purchaser's rows, and legacy
-- rows carry NULL/duplicate transaction ids. Only razorpay rows are created
-- exclusively by the ingest pipeline, which suffixes group members -p2/-p3…,
-- so uniqueness holds for every row this index covers.
CREATE UNIQUE INDEX IF NOT EXISTS attendees_razorpay_txn_unique
  ON public.attendees (transaction_id)
  WHERE payment_method = 'razorpay' AND transaction_id IS NOT NULL;
