-- Attendee ↔ auth.users linking: close two gaps that left a claimed ticket
-- bound to the wrong portal account.
--
-- CONTEXT
-- A BOGO claim-link row is created carrying the PAYER's name, email and
-- user_id as placeholders. When the guest opens the link and completes their
-- details, the row's email becomes theirs — but `user_id` was left pointing at
-- the payer, because:
--   * link_attendee_to_existing_user is BEFORE **INSERT** — the row already
--     exists, so a claim (an UPDATE) never fires it.
--   * link_attendees_to_new_user is AFTER INSERT on auth.users — it only fires
--     for BRAND-NEW signups, so a guest who already had an account (the common
--     case) is never back-linked.
-- Result: the ticket showed up in the payer's portal, not the claimant's.
--
-- GAP 2: link_attendees_to_new_user matched `email = NEW.email`, a
-- case-sensitive byte comparison. Supabase lowercases auth emails while an
-- attendee row keeps whatever was typed into the form, so `Sikha.Singh@x.org`
-- was never back-linked to `sikha.singh@x.org`. Its sibling trigger already
-- used lower(); this brings the two into agreement.

-- ── 1. Case-insensitive signup backfill ────────────────────────────────────
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
  WHERE lower(email) = lower(NEW.email)
    AND user_id IS NULL;
  RETURN NEW;
END;
$$;

-- ── 2. Re-resolve user_id when an attendee's email changes ─────────────────
-- Fires on UPDATE only, and only when the email actually changed.
--
-- Deliberately conservative about CLEARING a link:
--   * A matching auth account exists  → point user_id at it. Always correct:
--     user_id means "the portal account that owns this row", and that is
--     derived from the address.
--   * No matching account, row is a BOGO claim whose email no longer matches
--     its payer → NULL it. The payer's user_id was only ever a placeholder,
--     and leaving it would show a stranger's ticket in the payer's portal.
--   * No matching account, any other row → LEAVE IT ALONE. An admin fixing a
--     typo on a paid registration must not cost that person portal access to
--     their own ticket.
CREATE OR REPLACE FUNCTION public.relink_attendee_on_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_uid uuid;
  payer_email text;
BEGIN
  IF NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO matched_uid
    FROM auth.users
   WHERE lower(email) = lower(NEW.email)
   LIMIT 1;

  IF matched_uid IS NOT NULL THEN
    NEW.user_id := matched_uid;
    RETURN NEW;
  END IF;

  -- No account for the new address. Only drop a stale placeholder link.
  IF COALESCE(NEW.is_bogo_claim, false) AND NEW.bogo_source_attendee_id IS NOT NULL THEN
    SELECT email INTO payer_email
      FROM public.attendees
     WHERE id = NEW.bogo_source_attendee_id;
    IF payer_email IS NOT NULL AND lower(payer_email) <> lower(NEW.email) THEN
      NEW.user_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relink_attendee_on_email_change_trg ON public.attendees;
CREATE TRIGGER relink_attendee_on_email_change_trg
  BEFORE UPDATE OF email ON public.attendees
  FOR EACH ROW EXECUTE FUNCTION public.relink_attendee_on_email_change();
