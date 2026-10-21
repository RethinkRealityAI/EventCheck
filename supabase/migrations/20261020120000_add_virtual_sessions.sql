-- Virtual presentations: which Congress sessions have presenters joining over
-- Zoom, the Zoom link for each, and who those presenters are.
--
-- Visibility is the whole point. Only admins and the virtual presenters
-- themselves may see any of it — the Zoom links must not reach ordinary
-- delegates. So the data lives here behind RLS rather than in the client
-- bundle (config/congressProgram.ts is public).
--
-- Two tables, so presenters never see each other's email addresses:
--
--   virtual_presenters  email → presenter_key. ADMIN-ONLY. A presenter may have
--                       several addresses (two portal accounts); one row each.
--   virtual_sessions    session_id (config/congressProgram.ts id) → zoom_url,
--                       meeting_id, presenters [{ key, name, role }]. Readable by
--                       admins and by anyone listed in virtual_presenters.
--
-- is_virtual_presenter() / my_virtual_presenter_key() are SECURITY DEFINER so the
-- virtual_sessions policy can consult virtual_presenters without exposing it,
-- and without a policy selecting from its own table (42P17, §16 rule 13).
-- Matching is on the signed-in account's email (auth.jwt() ->> 'email'),
-- case-insensitively; the data itself is seeded per tenant (GANSID only).

CREATE TABLE IF NOT EXISTS public.virtual_presenters (
  email         text PRIMARY KEY,
  presenter_key text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT virtual_presenters_email_lower CHECK (email = lower(email))
);
CREATE INDEX IF NOT EXISTS virtual_presenters_key_idx ON public.virtual_presenters (presenter_key);

CREATE TABLE IF NOT EXISTS public.virtual_sessions (
  session_id text PRIMARY KEY,
  zoom_url   text NOT NULL,
  meeting_id text,
  presenters jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_presenters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_virtual_presenter_key()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT presenter_key FROM public.virtual_presenters
  WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_virtual_presenter()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.virtual_presenters
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.my_virtual_presenter_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_virtual_presenter() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_virtual_presenter_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_virtual_presenter() TO authenticated;

-- virtual_presenters: admins only, in every direction.
DROP POLICY IF EXISTS virtual_presenters_admin_all ON public.virtual_presenters;
CREATE POLICY virtual_presenters_admin_all ON public.virtual_presenters
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- virtual_sessions: admins and listed presenters read; only admins write.
DROP POLICY IF EXISTS virtual_sessions_read ON public.virtual_sessions;
CREATE POLICY virtual_sessions_read ON public.virtual_sessions
  FOR SELECT TO authenticated
  USING (public.is_portal_admin() OR public.is_virtual_presenter());

DROP POLICY IF EXISTS virtual_sessions_admin_write ON public.virtual_sessions;
CREATE POLICY virtual_sessions_admin_write ON public.virtual_sessions
  FOR ALL TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
