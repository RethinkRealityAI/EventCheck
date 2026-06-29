-- 20260629120100_add_flutterwave_public_key_setting.sql
--
-- Adds the Flutterwave PUBLIC key to the app_settings singleton so the admin
-- Settings UI can supply it as a fallback when VITE_FLW_PUBLIC_KEY is not set
-- in the environment (mirrors how paypal_client_id already works).
--
-- The Flutterwave SECRET key is NEVER stored here — it lives only as a
-- server-side Supabase function secret (FLW_SECRET_KEY). This column holds the
-- publishable key, which is safe to expose to the browser.
--
-- Additive only.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS flutterwave_public_key text null;
