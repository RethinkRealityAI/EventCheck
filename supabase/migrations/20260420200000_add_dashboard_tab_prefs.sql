-- Per-deployment admin preference for attendee-dashboard tab order + visibility.
-- Shape: { "order": string[], "hidden": string[] }. When null/empty, the client
-- falls back to DEFAULT_TAB_ORDER and nothing is hidden (current behavior).
--
-- Scoped in app_settings so each Supabase project (SCAGO + GANSID) keeps its
-- own layout — matches how every other dashboard pref is stored.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dashboard_tab_prefs jsonb;
