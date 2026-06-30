-- Admin-editable email template for the bulk-contact "invite to register" send.
--
-- Mirrors every other editable template (email_*_subject / email_*_body on the
-- singleton app_settings row): the Settings → Email Templates catalog edits
-- these, and the Bulk Import "Invite" flow renders the email from them. Body is
-- the inner HTML placed inside the branded shell and MUST contain the
-- {{registration_link}} button (substituted per-recipient server-side by the
-- contact-invite-send edge function). {{event}} resolves to the target form's
-- title; {{name}} / {{first_name}} / {{email}} resolve per recipient.
--
-- NULL means "use the app default" (resolved in storageService getSettings).

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_contact_invite_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_contact_invite_body TEXT;
