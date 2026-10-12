-- Register SCAGO (Sickle Cell Awareness Group of Ontario) as a GANSID
-- Congress 2026 exhibitor, with its two people under the booking.
--
-- SCAGO never went through the Sponsor & Exhibitor form: its two people
-- registered on the congress form as individuals (one as a speaker, one as a
-- paid patient-organization delegate). GANSID asked for SCAGO to appear as an
-- exhibitor with both of them listed under it.
--
-- This mirrors the Novartis booking (994d667c-…), whose delegates are
-- congress-form rows re-parented under an exhibitor org row:
--   - one org row on the combined sponsor/exhibitor form, with a booth, so the
--     Exhibitors tab and the registration-kind resolver pick it up;
--   - each person keeps their own ticket, payment, speaker status and answers,
--     and only gains primary_attendee_id / is_primary = false and a
--     staffCategory, which is what nests them under the org.
--
-- No names or addresses are written into this file (the repository is
-- public): the org's contact is copied from the existing attendee row.
-- Booth: In-line Non-Profit. Payment: recorded as complimentary ('free',
-- NULL payment_method per the payment-method CHECK) — change in the dashboard
-- if GANSID invoices it. Nothing here sends an email.
--
-- Idempotent: ON CONFLICT DO NOTHING on the insert, and the updates only touch
-- rows that are not already linked.

INSERT INTO public.attendees (
  id, form_id, name, email, ticket_type, qr_payload,
  payment_status, payment_method, payment_amount,
  is_test, is_primary, primary_attendee_id, registered_at,
  answers, company_info, exhibitor_booth_type, sponsor_items, sponsored_awards,
  admin_notes
)
SELECT
  '04c24a2f-b1a0-4fa3-95bf-af1c9406e38f',
  'gansid-congress-2026-exhibitors',
  'Sickle Cell Awareness Group of Ontario',
  c.email,
  'Exhibitor',
  '{"id":"04c24a2f-b1a0-4fa3-95bf-af1c9406e38f"}',
  'free',
  NULL,
  '0',
  false,
  true,
  NULL,
  now(),
  '{"registrationType":"exhibitor","hasAllDetails":true}'::jsonb,
  jsonb_build_object(
    'orgName', 'Sickle Cell Awareness Group of Ontario',
    'contactName', c.name,
    'contactTitle', coalesce(c.answers->>'f_role', ''),
    'email', c.email,
    'phone', '',
    'address', '',
    'website', 'https://sicklecellanemia.ca'
  ),
  'booth_nonprofit',
  '[]'::jsonb,
  '[]'::jsonb,
  'Exhibitor booking created by an admin on 2026-10-12 at GANSID''s request. Its two delegates registered individually on the congress form and were moved under this booking; their own tickets and payments are unchanged.'
FROM public.attendees c
WHERE c.id = 'a2f9779c-19d3-4c0f-ad16-e3db518a4af8'
ON CONFLICT (id) DO NOTHING;

UPDATE public.attendees
   SET primary_attendee_id = '04c24a2f-b1a0-4fa3-95bf-af1c9406e38f',
       is_primary = false,
       answers = coalesce(answers, '{}'::jsonb) || '{"staffCategory":"full_access"}'::jsonb
 WHERE id IN ('a2f9779c-19d3-4c0f-ad16-e3db518a4af8', '7c281b2e-68a2-47bd-8957-93595d68fc63')
   AND primary_attendee_id IS NULL
   AND EXISTS (SELECT 1 FROM public.attendees WHERE id = '04c24a2f-b1a0-4fa3-95bf-af1c9406e38f');
