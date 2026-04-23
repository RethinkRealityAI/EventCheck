-- ---------------------------------------------------------------------------
-- email_sends: log every email sent from the admin Signups tab.
--   - sent_at              admin action timestamp
--   - opened_at            set by track-email edge function on tracking-pixel hit
--   - click_count/last_clicked_at  incremented by track-email on CTA click redirect
--   - tracking_id          opaque token embedded in the pixel/click URLs; unique
--   - template_key         'reminder' | 'invitation' | 'blank' | 'custom'
--   - event_name           resolved value of {{event}} at send time
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id TEXT UNIQUE NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  template_key TEXT,
  form_id TEXT REFERENCES public.forms(id) ON DELETE SET NULL,
  event_name TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ,
  click_count INT NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS email_sends_recipient_email_idx ON public.email_sends (recipient_email);
CREATE INDEX IF NOT EXISTS email_sends_recipient_user_id_idx ON public.email_sends (recipient_user_id);
CREATE INDEX IF NOT EXISTS email_sends_sent_at_idx ON public.email_sends (sent_at DESC);

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

-- Admins read everything; portal users never touch this table.
DROP POLICY IF EXISTS email_sends_admin_read ON public.email_sends;
CREATE POLICY email_sends_admin_read ON public.email_sends
  FOR SELECT
  USING (public.is_portal_admin());

DROP POLICY IF EXISTS email_sends_admin_insert ON public.email_sends;
CREATE POLICY email_sends_admin_insert ON public.email_sends
  FOR INSERT
  WITH CHECK (public.is_portal_admin());

-- The track-email edge function uses the service-role key, which bypasses RLS,
-- so no update policy is exposed to clients. Admin UI is read-only on analytics.
