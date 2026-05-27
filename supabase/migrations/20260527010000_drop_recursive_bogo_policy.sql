-- Drops the recursive RLS policy added in 20260526180000_add_bogo_columns.sql.
-- The policy's USING clause selected from `attendees`, which is the same
-- relation being protected — Postgres detects this as recursion (error
-- 42P17) and refuses every SELECT, blanking the dashboard.
--
-- The policy was meant to let portal users see BOGO claim rows referencing
-- their paid attendees (claim-link mode pre-claim, where user_id IS NULL).
-- It was redundant because the pre-existing wildcard policy "Allow all
-- access to attendees" (using true) already grants reads.

DROP POLICY IF EXISTS "users_can_see_their_bogo_claims" ON attendees;
