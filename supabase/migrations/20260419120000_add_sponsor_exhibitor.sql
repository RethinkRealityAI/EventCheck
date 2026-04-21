-- 1. Extend form_type to include sponsor_exhibitor
ALTER TABLE forms
  DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE forms
  ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor', 'sponsor_exhibitor'));

-- 2. Add exhibitor_booth_type column (informational — no payment)
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS exhibitor_booth_type TEXT;
ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_exhibitor_booth_type_check;
ALTER TABLE attendees
  ADD CONSTRAINT attendees_exhibitor_booth_type_check
  CHECK (exhibitor_booth_type IS NULL OR exhibitor_booth_type IN (
    'booth_3x3_corner', 'booth_3x3', 'booth_3x6_corner',
    'booth_3x6_inline', 'booth_nonprofit', 'booth_commercial_publishers'
  ));

-- 3. Extend guest_type CHECK to cover new staff states
ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_guest_type_check;
ALTER TABLE attendees
  ADD CONSTRAINT attendees_guest_type_check
  CHECK (guest_type IS NULL OR guest_type IN (
    'pending-claim', 'claimed',
    'exhibitor-staff-pending', 'exhibitor-staff-claimed',
    'staff-pending', 'staff-claimed'
  ));

-- 4. Extend payment_method CHECK to accept 'external' (no-payment sponsor_exhibitor flow)
ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_payment_method_check;
ALTER TABLE attendees
  ADD CONSTRAINT attendees_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('card', 'paypal', 'cheque', 'external'));

-- 5. New staff email template columns + seed defaults
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS email_staff_invite_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_staff_invite_body TEXT,
  ADD COLUMN IF NOT EXISTS email_staff_confirmed_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_staff_confirmed_body TEXT;

UPDATE app_settings
SET
  email_staff_invite_subject = COALESCE(
    email_staff_invite_subject,
    'You''ve been registered as staff for {{event}}'),
  email_staff_invite_body = COALESCE(
    email_staff_invite_body,
    '<p>Hi {{name}},</p><p>{{purchaser}} has registered you as a staff member for <strong>{{event}}</strong> ({{category}}).</p><p>Please complete your registration here: <a href="{{complete_url}}">{{complete_url}}</a></p><p>If you''d like to create a portal account at the same time, sign up here: <a href="{{signup_url}}">{{signup_url}}</a></p>'),
  email_staff_confirmed_subject = COALESCE(
    email_staff_confirmed_subject,
    'Your staff registration for {{event}} is confirmed'),
  email_staff_confirmed_body = COALESCE(
    email_staff_confirmed_body,
    '<p>Hi {{name}},</p><p>Your staff registration for <strong>{{event}}</strong> is confirmed. Your ticket QR is attached and also appears in your portal dashboard.</p><p>Attending with <strong>{{org_name}}</strong>.</p>');
