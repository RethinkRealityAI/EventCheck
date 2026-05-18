-- Copy `organization` from auth signup metadata into the profiles row.
--
-- The sponsor/exhibitor signup form (SponsorExhibitorAuthPanel) collects the
-- company/organization name and writes it to user_metadata.organization. The
-- previous handle_new_user trigger only persisted id/email/full_name/role, so
-- the organization value sat unused in auth.users.raw_user_meta_data and the
-- sponsor_exhibitor form had to prompt for it a second time.
--
-- This trigger update reads `organization` from metadata (NULL-safe when
-- absent — attendee signups don't supply it) and stamps it on the profiles
-- row at creation time. Existing rows are unaffected; a separate one-time
-- backfill is not needed because there should be no production sponsor/
-- exhibitor users predating the new signup page.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested_role TEXT;
  org_name TEXT;
BEGIN
  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IS NULL OR requested_role NOT IN ('attendee', 'exhibitor', 'sponsor') THEN
    requested_role := 'attendee';
  END IF;

  org_name := NULLIF(NEW.raw_user_meta_data->>'organization', '');

  INSERT INTO public.profiles (id, email, full_name, role, organization)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    requested_role,
    org_name
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
