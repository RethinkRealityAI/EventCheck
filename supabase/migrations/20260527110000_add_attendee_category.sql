-- Adds attendee_category column to attendees for role classification tags.
--
-- Distinct from guest_type (which carries flow state: pending-claim, claimed,
-- staff-*, etc.) — this column is purely for the role/category PILL shown in
-- the dashboard, manual ticket tool, attendee modal, and seating configurator.
--
-- Six values are recognized today:
--   'dignitary'    Dignitary / Presenter   (purple)
--   'awardee'      Awardee                  (gold)
--   'scholarship'  Scholarship Recipient    (emerald)
--   'performer'    Performer                (rose)
--   'volunteer'    Volunteer                (sky)
--   'speaker'      Speaker                  (amber)  GANSID-only in admin UI
--
-- 'speaker' overlaps with the legacy `guest_type='speaker'` set last week. The
-- pill-rendering layer checks `attendee_category` first, then falls back to
-- `guest_type='speaker'` so existing rows keep their pill without backfill.
--
-- Free-text TEXT column — no CHECK constraint so adding more categories
-- later is purely an app-code change. Partial index since the overwhelming
-- majority of rows have no category.
--
-- See docs/superpowers/specs/ + CLAUDE.md §19 for context.

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS attendee_category TEXT NULL;

CREATE INDEX IF NOT EXISTS attendees_attendee_category_idx
  ON attendees (attendee_category)
  WHERE attendee_category IS NOT NULL;
