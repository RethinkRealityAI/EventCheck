-- GANSID Congress 2026 — Exhibitor/Sponsor Staff Registration
--
-- WHY A SEPARATE FORM
-- Staff listed on an organisation's exhibitor/sponsor allocation were being
-- pointed at `gansid-congress-2026`, the full 22-field paid congress form. That
-- asked them for a registration type, a group of co-attendees, their
-- affiliation, their role, and payment — none of which applies to someone whose
-- seat the org already bought and was invoiced for externally. Worse, staff
-- rows written with guest_type = NULL fell out of claim mode entirely and got
-- the live PayPal form, so a staff member could pay for a seat twice.
--
-- This form asks ONLY what the organisation cannot answer for them:
--   * who they are (for the badge and the ticket)
--   * a verified email + phone (so their ticket actually reaches them)
--   * dietary + accessibility needs (catering and venue logistics)
--   * their own acceptance of the Terms and the Liability Waiver
--
-- NOT asked, by design:
--   * registration type / group size  - they are one person on an org allocation
--   * payment                          - the org is invoiced externally
--   * institution                      - stamped from the org record
--   * role                             - stamped as "<Org> Staff"
--   * presenting / emergency contacts  - collected by the org
--
-- Single-page (`renderMode: 'single'`): four steps for eleven fields was most of
-- what made this feel heavy.
--
-- Data-only seed, not a schema migration. Safe to re-run.

INSERT INTO forms (id, title, description, status, form_type, show_in_portal, thank_you_message, settings, fields)
VALUES (
  'gansid-congress-2026-staff',
  'GANSID Congress 2026 — Staff Registration',
  'Your organisation has registered you for the Congress. Just confirm your details below — there is nothing to pay.',
  'active',
  'event',
  false,   -- reached via the staff invite link or the portal CTA, never browsed to
  'You are all set. Your ticket is on its way to your inbox.',
  jsonb_build_object(
    'renderMode', 'single',
    'isStaffForm', true
  ),
  '[
    {"id":"f_fname","type":"text","label":"First Name","required":true,"placeholder":"This will appear on your conference badge"},
    {"id":"f_lname","type":"text","label":"Last Name","required":true,"placeholder":"This will appear on your conference badge"},
    {"id":"f_title","type":"select","label":"Title","required":false,"options":["Mr.","Ms.","Mrs.","Dr.","Prof."]},
    {"id":"f_email","type":"email","label":"Email Address","required":true},
    {"id":"f_email_confirm","type":"email","label":"Confirm Email Address","required":true,"confirmsFieldId":"f_email","placeholder":"Re-type your email address"},
    {"id":"f_whatsapp","type":"phone","label":"Phone Number (WhatsApp preferred)","required":true},
    {"id":"f_country","type":"country","label":"Country","required":true},
    {"id":"f_city","type":"text","label":"City","required":false},
    {"id":"f_diet","type":"textarea","label":"Do you have any dietary restrictions or allergies?","required":false},
    {"id":"f_access","type":"textarea","label":"Do you have any accessibility needs?","required":false},
    {"id":"f_consent_terms","type":"boolean","label":"I have read and agree to the","linkText":"Terms & Conditions","required":true,
     "consentModal":{"url":"/branding/gansid/docs/gc26-terms-conditions.md","title":"GANSID Congress 2026 — Terms & Conditions"}},
    {"id":"f_consent_liability","type":"boolean","label":"I have read and agree to the","linkText":"Disclaimer & Liability Waiver","required":true,
     "consentModal":{"url":"/branding/gansid/docs/gc26-disclaimer.md","title":"GANSID Congress 2026 — Disclaimer & Limitation of Liability"}}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title             = EXCLUDED.title,
  description       = EXCLUDED.description,
  status            = EXCLUDED.status,
  form_type         = EXCLUDED.form_type,
  show_in_portal    = EXCLUDED.show_in_portal,
  thank_you_message = EXCLUDED.thank_you_message,
  settings          = EXCLUDED.settings,
  fields            = EXCLUDED.fields;

-- Point the exhibitor/sponsor flow's staff invites at it. Preserves any other
-- keys already in settings.
UPDATE forms
SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('staffFormId', 'gansid-congress-2026-staff')
WHERE id = 'gansid-congress-2026-exhibitors';

SELECT id, title, status, settings->>'renderMode' AS render_mode,
       jsonb_array_length(fields) AS field_count
FROM forms WHERE id = 'gansid-congress-2026-staff';

SELECT id, settings->>'staffFormId' AS staff_form_id
FROM forms WHERE id = 'gansid-congress-2026-exhibitors';
