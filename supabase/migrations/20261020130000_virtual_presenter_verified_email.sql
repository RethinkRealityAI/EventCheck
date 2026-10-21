-- Harden the virtual-presenter check (follow-up to 20261020120000).
--
-- The first version matched virtual_presenters.email against the JWT's
-- `email` claim. That claim is the account's email, but it is not proof the
-- address was confirmed: an unconfirmed sign-up session can carry an address
-- its holder does not own. For presenters who have no account yet (or a
-- second address added later), someone could sign up with that address and
-- briefly see every virtual session's Zoom link.
--
-- Now both functions resolve the caller through auth.users by id and require
-- email_confirmed_at, so only a CONFIRMED owner of a listed address matches.
-- Signatures, grants and policies are unchanged.

CREATE OR REPLACE FUNCTION public.my_virtual_presenter_key()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT vp.presenter_key
  FROM public.virtual_presenters vp
  JOIN auth.users u ON lower(u.email) = vp.email
  WHERE u.id = auth.uid()
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_virtual_presenter()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.virtual_presenters vp
    JOIN auth.users u ON lower(u.email) = vp.email
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.my_virtual_presenter_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_virtual_presenter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_virtual_presenter_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_virtual_presenter() TO authenticated;
