-- Enable BOGO on the GANSID Congress 2026 public registration form.
-- BOGO UI is gated on form.settings.bogoEnabled; without this flag the
-- "Bring a guest free" block never renders at checkout.

UPDATE public.forms
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{bogoEnabled}',
  'true'::jsonb,
  true
)
WHERE id = 'gansid-congress-2026';
