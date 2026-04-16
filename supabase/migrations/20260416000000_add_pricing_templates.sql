-- Dynamic Pricing Engine — adds pricing_templates table, attendee pricing metadata
-- columns, and feature flag in app_settings. Idempotent where possible.

CREATE TABLE IF NOT EXISTS public.pricing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_brackets JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_bracket_override TEXT,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_templates_is_active_idx
  ON public.pricing_templates (is_active) WHERE is_active = true;

ALTER TABLE public.pricing_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_can_view_templates" ON public.pricing_templates;
CREATE POLICY "anon_can_view_templates" ON public.pricing_templates
  FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_templates" ON public.pricing_templates;
CREATE POLICY "admin_manage_templates" ON public.pricing_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_manage_templates" ON public.pricing_templates;
CREATE POLICY "service_manage_templates" ON public.pricing_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS pricing_template_id UUID REFERENCES public.pricing_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_bracket TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS pricing_category_id TEXT;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS feature_pricing_templates BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pricing_templates_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_templates_touch_updated_at ON public.pricing_templates;
CREATE TRIGGER pricing_templates_touch_updated_at
  BEFORE UPDATE ON public.pricing_templates
  FOR EACH ROW EXECUTE FUNCTION public.pricing_templates_touch_updated_at();
