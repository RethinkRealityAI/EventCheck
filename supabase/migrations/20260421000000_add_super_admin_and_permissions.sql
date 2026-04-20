-- Super-admin role + per-admin page permissions.
--
-- Motivation: every pre-portal user was bootstrapped as 'admin', which gives
-- them blanket access to the entire dashboard. Now that admin accounts are
-- going to be invited / promoted via a UI, we need:
--   * a higher 'super_admin' tier that can manage other admins,
--   * a per-admin permissions object so ordinary admins can be scoped
--     to specific pages (forms, sponsors, seating, etc.).
--
-- Migration promotes every existing admin to super_admin. Going forward,
-- new admins default to role='admin' with whatever permissions the inviter
-- chooses.

-- 1. Extend role CHECK to allow 'super_admin'.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('attendee', 'exhibitor', 'sponsor', 'admin', 'super_admin'));

-- 2. Per-admin page permissions. NULL for non-admins and super_admins (super
--    admin access is implicit-all). For admins, the UI always writes a
--    populated object; NULL at runtime is treated as 'dashboard-only' by the
--    client fallback.
ALTER TABLE public.profiles ADD COLUMN admin_permissions jsonb DEFAULT NULL;

-- 3. Promote every existing admin to super_admin so the people who already
--    have dashboard access keep full control through the new role system.
UPDATE public.profiles SET role = 'super_admin' WHERE role = 'admin';

-- 4. Explicit belt-and-braces promotion for the bootstrap admins named in
--    the project README. Idempotent; no-op if they're already super_admin.
UPDATE public.profiles SET role = 'super_admin'
  WHERE email IN ('tech@sicklecellanemia.ca', 'dapo.ajisafe@gmail.com')
    AND role NOT IN ('super_admin');

-- 5. is_portal_admin() must now recognise BOTH admin and super_admin so
--    existing RLS policies (announcements_admin_all, profiles_admin_read,
--    etc.) keep working for both tiers.
CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- 6. New helper: is_super_admin(). Used by the super-admin-only RLS below
--    and reachable from SQL / server-side logic if needed.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;

-- 7. Super-admins may UPDATE any profile row (to promote/demote and edit
--    admin_permissions). WITH CHECK denies touching OWN role via this
--    policy — a super_admin can still edit their display-name fields
--    through the existing profiles_self_update policy, but role changes
--    to themselves are blocked here AND by the trigger below.
CREATE POLICY "profiles_super_admin_update" ON public.profiles FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin() AND id <> auth.uid());

-- 8. Defence in depth: no user may change their OWN role, ever. Prevents
--    a super_admin from accidentally demoting themselves (locking the
--    site out of its only admin) and also blocks any creative RLS bypass.
--    Service-role calls (edge functions) aren't affected — they run with
--    auth.uid() NULL so the comparison short-circuits false.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND NEW.role IS DISTINCT FROM OLD.role
  THEN
    RAISE EXCEPTION 'Users cannot change their own role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_prevent_self_role_change ON public.profiles;
CREATE TRIGGER tr_profiles_prevent_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();
