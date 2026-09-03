-- Register the free companion who was silently dropped from a paid booking.
--
-- TSCS's confirmation email carries a "Free Addon Person" block for a
-- complimentary companion included in the price. The parser did not read that
-- block until 2026-09-03 (PR #31), so on REG-00022 — paid in full via
-- pay_TXTbLRamVUH3bp — only the purchaser was registered. The companion got no
-- attendee row, no QR and no ticket, and nothing anywhere recorded that she
-- was missing: the email was marked 'ingested' and looked completely healthy.
--
-- The parser handles the block now, but that only helps future mail. This
-- booking cannot be re-ingested: its message is flagged \Seen, and re-running
-- it would collide with the purchaser's row on the transaction id.
--
-- The companion's name and address are NOT written into this file. This
-- repository is public, and a congress registrant's personal details do not
-- belong in it. They are read out of the confirmation email already stored in
-- tscs_email_registrations.raw, with the same two anchors the TypeScript
-- parser uses (the "Free Addon Person" heading, then the run-together
-- Name/Email labels). Both patterns were verified against the live row before
-- this was written.
--
-- Column values otherwise match buildTscsAttendeeRows() exactly, so this row
-- is indistinguishable from an add-on registered automatically from here on:
-- payment_status 'free' with a NULL payment_method (the payment-method CHECK
-- reserves non-null values for real payment paths) and no transaction_id, so
-- free companions sit outside the razorpay dedupe index entirely.
INSERT INTO public.attendees (
  id, form_id, name, email, ticket_type, qr_payload,
  payment_status, payment_method, payment_amount,
  pricing_template_id, is_test, is_primary, primary_attendee_id,
  registered_at, answers, admin_notes
)
SELECT
  'd389d947-390e-4b14-95c4-b7f08e3e4652',
  'gansid-congress-2026',
  btrim(substring(r.raw FROM 'Free Addon Person\s*Name(.*?)Email')),
  lower(btrim(substring(r.raw FROM 'Free Addon Person\s*Name.*?Email([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,63})'))),
  'Registration (Free Add-on)',
  '{"id":"d389d947-390e-4b14-95c4-b7f08e3e4652"}',
  'free',
  NULL,
  '0',
  'c569ab4f-883b-42e9-8892-4405fa67217e',
  false,
  false,
  a.id,
  a.registered_at,
  '{"f_country":"IN","tscs_source":"email-poll (table), add-on recovered 2026-09-03"}'::jsonb,
  a.admin_notes || ' Free add-on person on that booking; registered by hand because the parser could not read the add-on block when the email arrived.'
FROM public.tscs_email_registrations r
JOIN public.attendees a ON a.id = 'a18202ee-0ec2-4fec-92c8-5ac63f637c88'
WHERE r.message_id = '<9I2Uu1XT0G1ajUBa6rNXm0vhBt8PQfGeUELWGZkis@www.tscsindia.org>'
  -- Both anchors must hit. A NULL name or address would create a nameless
  -- attendee with an unsendable ticket, which is worse than not running.
  AND substring(r.raw FROM 'Free Addon Person\s*Name(.*?)Email') IS NOT NULL
  AND substring(r.raw FROM 'Free Addon Person\s*Name.*?Email([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,63})') IS NOT NULL
ON CONFLICT (id) DO NOTHING;
