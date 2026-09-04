-- SECURITY FIX: the attendees table was readable, writable and deletable by
-- everyone, including anonymous callers.
--
-- The policy set had grown to six overlapping entries, three of them narrow
-- and correct — anon_can_read_placeholders, anon_can_register,
-- service_full_access — and three blanket:
--
--   "Allow all access to attendees"  TO public   FOR ALL  USING (true)
--   admin_full_access               TO authenticated FOR ALL USING (true)
--   anon_can_update_placeholders    TO anon      FOR UPDATE USING (true)
--
-- RLS policies are OR'd, so the narrow ones never constrained anything. The
-- first line alone meant anyone holding the anon key — which ships in the
-- browser bundle on every page load — could read every attendee's name, work
-- email, phone number and dietary notes, and could update or delete any of
-- them. admin_full_access, despite the name, checked nothing beyond "is signed
-- in": all 336 self-service attendee accounts had the same reach.
--
-- What actually needs access, traced through the client:
--
--   * Registration does NOT need write access here at all. Every submission
--     goes through the verify-payment edge function on the service role
--     ("All registrations go through the edge function for server-side
--     validation", PublicRegistration.tsx) — as do tickets, BOGO sends and the
--     TSCS ingest. Those are unaffected by anything below.
--   * The anonymous claim flow (a group guest completing their own details
--     from a ?ref= link) reads through get_attendee_by_id /
--     get_guests_by_primary, which are SECURITY DEFINER and bypass RLS, then
--     updates that one guest row in place. It needs UPDATE on guest rows, and
--     SELECT on them because the upsert reads the id back and treats zero rows
--     as a failed write.
--   * The portal shows a user their own rows, the group members and staff
--     under a booking they own, and BOGO claims sourced from those.
--   * The admin app and the check-in scanner need everything. There is no
--     separate scanner role — check-in is done by admins.
--
-- The ownership test lives in a SECURITY DEFINER helper on purpose. A policy
-- on attendees whose USING clause selects from attendees is error 42P17 and
-- makes every read of the table fail; this repo shipped that once (the
-- 2026-05-26 BOGO migration) and blanked every dashboard. Definer rights mean
-- the lookup does not re-enter the policy that called it.
--
-- TO REVERT, if something unforeseen depended on the blanket grant:
--   CREATE POLICY "Allow all access to attendees" ON public.attendees
--     FOR ALL TO public USING (true);
-- That single statement restores the previous behaviour exactly.

-- ── Ownership helper ───────────────────────────────────────────────────────
-- True when the signed-in user owns this attendee row, or owns the booking it
-- hangs off. One level of nesting is all the data model has: a primary and the
-- guests or staff beneath it.
CREATE OR REPLACE FUNCTION public.can_see_attendee(p_attendee_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.attendees a
     WHERE a.id = p_attendee_id
       AND (
         a.user_id = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.attendees p
            WHERE p.id = a.primary_attendee_id
              AND p.user_id = auth.uid()
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_attendee(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_see_attendee(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_see_attendee(text) TO authenticated;

-- ── Out with the blanket grants ────────────────────────────────────────────
-- @destructive: confirmed
DROP POLICY IF EXISTS "Allow all access to attendees" ON public.attendees;
-- @destructive: confirmed
DROP POLICY IF EXISTS admin_full_access ON public.attendees;
-- @destructive: confirmed
DROP POLICY IF EXISTS anon_can_update_placeholders ON public.attendees;

-- ── Admins ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS attendees_admin_all ON public.attendees;
CREATE POLICY attendees_admin_all ON public.attendees
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- ── A signed-in person's own registrations ─────────────────────────────────
-- Matched on user_id OR the address on the row: rows created before the
-- account existed carry the email but no link, and the portal has always
-- shown them (getAttendeesForUser queries both).
DROP POLICY IF EXISTS attendees_self_read ON public.attendees;
CREATE POLICY attendees_self_read ON public.attendees
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
    OR (primary_attendee_id IS NOT NULL AND public.can_see_attendee(id))
    OR (bogo_source_attendee_id IS NOT NULL AND public.can_see_attendee(bogo_source_attendee_id))
  );

DROP POLICY IF EXISTS attendees_self_write ON public.attendees;
CREATE POLICY attendees_self_write ON public.attendees
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
    OR (primary_attendee_id IS NOT NULL AND public.can_see_attendee(id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
    OR (primary_attendee_id IS NOT NULL AND public.can_see_attendee(id))
  );

DROP POLICY IF EXISTS attendees_self_insert ON public.attendees;
CREATE POLICY attendees_self_insert ON public.attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

-- Removing a seat from a booking you hold — the sponsor roster's Remove.
-- Deliberately NOT extended to your own rows: cancelling your own
-- registration is an organiser action, and a stray delete here would destroy
-- a paid ticket with no audit trail.
DROP POLICY IF EXISTS attendees_owner_delete_seat ON public.attendees;
CREATE POLICY attendees_owner_delete_seat ON public.attendees
  FOR DELETE TO authenticated
  USING (primary_attendee_id IS NOT NULL AND public.can_see_attendee(id));

-- ── Anonymous ──────────────────────────────────────────────────────────────
-- Guest and staff seats hanging off a booking, which is the row shape the
-- ?ref= claim flow reads back and updates in place. Never a primary: no
-- purchaser, sponsor, speaker or admin row is reachable without signing in,
-- and anonymous DELETE is gone entirely.
--
-- This is the one grant here wider than it should be — it exposes the names
-- and addresses of guest seats to anyone with the anon key. Closing it means
-- moving the claim write behind a SECURITY DEFINER RPC the way the reads
-- already are; that is a client change, and is the next step rather than part
-- of this one.
DROP POLICY IF EXISTS anon_can_read_guest_seats ON public.attendees;
CREATE POLICY anon_can_read_guest_seats ON public.attendees
  FOR SELECT TO anon
  USING (primary_attendee_id IS NOT NULL AND is_primary IS NOT TRUE);

DROP POLICY IF EXISTS anon_can_claim_guest_seat ON public.attendees;
CREATE POLICY anon_can_claim_guest_seat ON public.attendees
  FOR UPDATE TO anon
  USING (primary_attendee_id IS NOT NULL AND is_primary IS NOT TRUE)
  WITH CHECK (primary_attendee_id IS NOT NULL AND is_primary IS NOT TRUE);

-- anon_can_read_placeholders and anon_can_register are left exactly as they
-- were: both are already scoped, and anon_can_register (INSERT, payment_status
-- <> 'paid') is the only way an unauthenticated caller can create a row.
