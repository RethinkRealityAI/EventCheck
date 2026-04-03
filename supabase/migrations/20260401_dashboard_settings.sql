ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_dashboard_form_id text,
  ADD COLUMN IF NOT EXISTS dashboard_column_prefs jsonb DEFAULT '{}';
