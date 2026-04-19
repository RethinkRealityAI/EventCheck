-- Second half of the attendee ↔ auth.users bidirectional linking:
--
-- `link_attendees_to_new_user` (20260419100000) fires on auth.users INSERT and
-- backfills user_id on any pre-existing attendee rows with matching email.
--
-- This migration adds the reverse: when an attendee row is inserted with
-- user_id NULL (e.g. a guest created via a group registration), we look up
-- auth.users for a matching email and set user_id inline — BEFORE INSERT so
-- the linked state is persisted on the very first write.
--
-- Together these two triggers guarantee that an attendee row and its
-- corresponding portal account are always linked by user_id regardless of
-- which one comes first.

CREATE OR REPLACE FUNCTION public.link_attendee_to_existing_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_uid uuid;
BEGIN
  IF NEW.user_id IS NOT NULL OR NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;
  SELECT id INTO existing_uid FROM auth.users
    WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF existing_uid IS NOT NULL THEN
    NEW.user_id := existing_uid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_attendee_to_existing_user_trg ON public.attendees;
CREATE TRIGGER link_attendee_to_existing_user_trg
  BEFORE INSERT ON public.attendees
  FOR EACH ROW EXECUTE FUNCTION public.link_attendee_to_existing_user();
