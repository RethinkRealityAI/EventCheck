-- Cross-device resume for in-progress stepped registrations.
--
-- Users can Save & Close on one device and resume on another. A row holds
-- the full stepper state snapshot (answers, current step, group state) keyed
-- on (user_id, form_id). Drafts are wiped on successful submit or "Start Over".
--
-- This is independent of attendee rows — drafts only exist while a registration
-- is in progress and has NOT been submitted.

CREATE TABLE IF NOT EXISTS public.registration_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_id text NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, form_id)
);

CREATE INDEX IF NOT EXISTS registration_drafts_user_form_idx
  ON public.registration_drafts(user_id, form_id);

ALTER TABLE public.registration_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own drafts" ON public.registration_drafts;
CREATE POLICY "Users manage own drafts" ON public.registration_drafts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at via trigger to avoid relying on the client
CREATE OR REPLACE FUNCTION public.touch_registration_draft()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registration_drafts_touch ON public.registration_drafts;
CREATE TRIGGER registration_drafts_touch
  BEFORE UPDATE ON public.registration_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_registration_draft();
