-- Auto-link guest attendee rows to new auth users when they sign up with the
-- email their ticket was issued to. Covers two scenarios:
--  1. A guest was pre-registered by a group purchaser, clicks the claim link,
--     and signs up during completion — trigger fires on auth.users INSERT.
--  2. A guest ignores the claim email and signs up days later on their own
--     via the portal landing page — same trigger still fires, back-linking
--     all their pre-existing attendee rows so tickets show up in their portal.

CREATE OR REPLACE FUNCTION public.link_attendees_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;
  UPDATE public.attendees
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_attendees_on_user_insert ON auth.users;
CREATE TRIGGER link_attendees_on_user_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_attendees_to_new_user();

-- Two extra app_settings columns for the new group-email templates:
--  * email_guest_claim_*   — Template Y, pending-claim guests (claim link inside)
--  * email_guest_confirmed_* — Template X, inline guests (ticket ready)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_guest_claim_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_guest_claim_body TEXT,
  ADD COLUMN IF NOT EXISTS email_guest_confirmed_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_guest_confirmed_body TEXT;
