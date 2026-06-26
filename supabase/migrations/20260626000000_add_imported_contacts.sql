-- ---------------------------------------------------------------------------
-- Bulk contact import + email campaign schema.
--
-- Two tables back the admin "Contacts" tab + Bulk Import modal:
--
--   contact_import_batches  one row per CSV upload. Carries the human label,
--                           the filter `tag`, the source filename and a
--                           denormalized `total_count` so the dashboard can
--                           list batches without aggregating child rows.
--
--   imported_contacts       one row per recipient parsed out of the CSV.
--                           `extra_fields` keeps every non name/email column
--                           the admin chose to import (used as {{placeholders}}
--                           when composing the campaign email). The
--                           email_* columns track per-recipient send state so
--                           the modal can render the green-check / failure
--                           list AND so an admin can re-open a batch later and
--                           retry only the ones that failed.
--
-- These are intentionally separate from `attendees`: imported contacts are not
-- registrations (no form_id, no QR, no payment/check-in) — they're a mailing
-- list. Promoting a contact to an attendee, if ever needed, stays an explicit
-- future action rather than an implicit side effect of import.
--
-- RLS mirrors email_sends: admins (is_portal_admin) read+write; portal users
-- never touch these tables. The send path runs from the authenticated admin
-- client, so client-side INSERT/UPDATE policies are required (no service-role).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL DEFAULT 'Imported contacts',
  tag TEXT NOT NULL DEFAULT 'imported',
  source_filename TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.imported_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.contact_import_batches(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  tag TEXT,
  extra_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_error TEXT,
  email_subject TEXT,
  email_sent_at TIMESTAMPTZ,
  tracking_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS imported_contacts_batch_id_idx ON public.imported_contacts (batch_id);
CREATE INDEX IF NOT EXISTS imported_contacts_tag_idx ON public.imported_contacts (tag);
CREATE INDEX IF NOT EXISTS imported_contacts_email_status_idx ON public.imported_contacts (email_status);
CREATE INDEX IF NOT EXISTS imported_contacts_email_idx ON public.imported_contacts (lower(email));
CREATE INDEX IF NOT EXISTS contact_import_batches_created_at_idx ON public.contact_import_batches (created_at DESC);

ALTER TABLE public.contact_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_contacts ENABLE ROW LEVEL SECURITY;

-- contact_import_batches — admin full access.
DROP POLICY IF EXISTS contact_import_batches_admin_all ON public.contact_import_batches;
CREATE POLICY contact_import_batches_admin_all ON public.contact_import_batches
  FOR ALL
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());

-- imported_contacts — admin full access.
DROP POLICY IF EXISTS imported_contacts_admin_all ON public.imported_contacts;
CREATE POLICY imported_contacts_admin_all ON public.imported_contacts
  FOR ALL
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
