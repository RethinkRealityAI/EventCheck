-- 1. Extend forms table with formType
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'event'
  CHECK (form_type IN ('event', 'sponsor'));

-- 2. Extend attendees table with sponsor fields
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS sponsor_tier TEXT
    CHECK (sponsor_tier IS NULL OR sponsor_tier IN ('signature', 'gold', 'silver', 'award', 'scholarship')),
  ADD COLUMN IF NOT EXISTS sponsor_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'paypal', 'cheque')),
  ADD COLUMN IF NOT EXISTS company_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsored_awards JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Index for sponsor-only queries
CREATE INDEX IF NOT EXISTS attendees_sponsor_tier_idx
  ON attendees (sponsor_tier) WHERE sponsor_tier IS NOT NULL;

-- 3. New sponsor_prospects table
CREATE TABLE IF NOT EXISTS sponsor_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'invited', 'responded', 'confirmed', 'declined')),
  sponsor_form_id TEXT REFERENCES forms(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  last_emailed_at TIMESTAMPTZ,
  email_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_prospects_email_idx ON sponsor_prospects (contact_email);
CREATE INDEX IF NOT EXISTS sponsor_prospects_status_idx ON sponsor_prospects (status);

-- Allow authenticated users (admins) full access, same pattern as other tables
ALTER TABLE sponsor_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON sponsor_prospects;
CREATE POLICY "Authenticated full access" ON sponsor_prospects
  FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Extend app_settings with sponsor template + config fields
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS sponsor_invitation_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_invitation_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_confirmation_paid_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_confirmation_paid_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_pledge_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_pledge_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_recipients JSONB DEFAULT '["gala@sicklecellanemia.ca","sicklecellawarenessontario@gmail.com","communication@sicklecellanemia.ca"]'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_received_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_received_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_mailing_address TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_hst_rate NUMERIC DEFAULT 0.13;

-- 5. Create sponsor-logos storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsor-logos', 'sponsor-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload
DROP POLICY IF EXISTS "Authenticated can upload sponsor logos" ON storage.objects;
CREATE POLICY "Authenticated can upload sponsor logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sponsor-logos');

-- Policy: public can read
DROP POLICY IF EXISTS "Public can read sponsor logos" ON storage.objects;
CREATE POLICY "Public can read sponsor logos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'sponsor-logos');

-- Policy: public can upload (since sponsor form is public — they upload their own logo)
DROP POLICY IF EXISTS "Public can upload sponsor logos" ON storage.objects;
CREATE POLICY "Public can upload sponsor logos" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'sponsor-logos');
