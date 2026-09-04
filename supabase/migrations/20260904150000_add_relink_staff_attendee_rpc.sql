-- Move a staff seat's portal link to whoever owns its (new) email address.
--
-- The portal does this when a sponsor corrects a colleague's address, and it
-- cannot be done from the browser: profiles is readable only by its own owner
-- (profiles_self_read) or an admin, so a sponsor looking up a colleague's
-- account gets zero rows back and the seat ends up linked to nobody. The
-- lookup has to happen somewhere that can actually see the table.
--
-- SECURITY DEFINER, so the authorisation is spelled out rather than inherited:
-- the caller must be the portal account that owns the org booking this seat
-- hangs off. That is the same person the UI shows the roster to, and nobody
-- else can move a link — including to themselves, since the seat has to belong
-- to their own booking before the function will touch it.
--
-- A missing account is not an error. Clearing user_id detaches the previous
-- owner — the actual bug this fixes, where a corrected address left the ticket
-- sitting in the old person's portal — and re-arms link_attendees_to_new_user,
-- which back-links the row if that person signs up later.
CREATE OR REPLACE FUNCTION public.relink_staff_attendee(
  p_attendee_id text,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_owner uuid;
  v_new_owner uuid;
BEGIN
  SELECT owner.user_id
    INTO v_booking_owner
    FROM public.attendees seat
    JOIN public.attendees owner ON owner.id = seat.primary_attendee_id
   WHERE seat.id = p_attendee_id;

  IF v_booking_owner IS NULL OR v_booking_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not permitted to change this seat';
  END IF;

  SELECT id
    INTO v_new_owner
    FROM public.profiles
   WHERE lower(email) = lower(btrim(p_email))
   LIMIT 1;

  UPDATE public.attendees
     SET user_id = v_new_owner
   WHERE id = p_attendee_id;

  RETURN v_new_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.relink_staff_attendee(text, text) FROM PUBLIC;
-- REVOKE ... FROM PUBLIC does not remove the grants Supabase's default
-- privileges hand to anon and authenticated on every new function in public,
-- so anon has to be named explicitly. The body could never have let an
-- anonymous caller through — it demands auth.uid() match the booking's owner —
-- but a definer-rights function reachable without a session is one careless
-- edit away from being a hole, and nothing here needs anonymous access.
REVOKE EXECUTE ON FUNCTION public.relink_staff_attendee(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.relink_staff_attendee(text, text) TO authenticated;
