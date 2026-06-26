-- Tagging + free invite-to-register linkage for bulk-imported contacts.
ALTER TABLE public.imported_contacts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS attendee_id UUID REFERENCES public.attendees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

-- Seed multi-tags from the existing single batch tag (one-time, idempotent-safe).
UPDATE public.imported_contacts
  SET tags = ARRAY[tag]
  WHERE tag IS NOT NULL AND tag <> '' AND (tags IS NULL OR tags = '{}'::text[]);

CREATE INDEX IF NOT EXISTS imported_contacts_tags_idx ON public.imported_contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS imported_contacts_attendee_id_idx ON public.imported_contacts (attendee_id);
