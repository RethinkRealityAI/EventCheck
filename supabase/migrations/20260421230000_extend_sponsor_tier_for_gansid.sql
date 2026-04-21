-- Extend attendees.sponsor_tier CHECK to allow GANSID sponsor tiers.
-- GANSID uses: platinum, gold, silver, bronze.
-- SCAGO still uses: signature, gold, silver, award, scholarship.
-- Both sets coexist safely since the column is just a string enum with no
-- behavioral coupling between projects.

ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_sponsor_tier_check;

ALTER TABLE attendees
  ADD CONSTRAINT attendees_sponsor_tier_check
  CHECK (
    sponsor_tier IS NULL
    OR sponsor_tier IN (
      -- SCAGO (legacy + active sponsor form)
      'signature', 'gold', 'silver', 'award', 'scholarship',
      -- GANSID combined sponsor_exhibitor form
      'platinum', 'bronze'
      -- gold + silver intentionally shared across both; SCAGO + GANSID
      -- distinguish via form_type, not this column.
    )
  );
