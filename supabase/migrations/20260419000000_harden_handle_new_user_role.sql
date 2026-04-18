-- Restrict handle_new_user trigger to only accept attendee/exhibitor/sponsor from client metadata.
-- Prevents privilege escalation via signUp({ options: { data: { role: 'admin' } } }).
-- Admin role must be granted manually via SQL (UPDATE profiles SET role='admin' WHERE email=...).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested_role TEXT;
BEGIN
  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IS NULL OR requested_role NOT IN ('attendee', 'exhibitor', 'sponsor') THEN
    requested_role := 'attendee';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    requested_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
