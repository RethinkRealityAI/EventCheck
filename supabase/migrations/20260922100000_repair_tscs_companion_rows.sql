-- Repair every companion row the TSCS India ingest has written so far.
--
-- A TSCS booking can carry two kinds of extra person: paid "Additional
-- Participants" and one complimentary "Free Addon Person". Their form
-- validates neither block, and until now the ingest accepted whatever arrived.
-- Live consequences, all visible in the roster:
--
--   * An attendee literally named "- -" (REG-00061) sitting in the live
--     registered-attendees list, holding the PURCHASER's email address because
--     the add-on block's Email field was empty.
--   * A companion stored with a doubled-TLD address (REG-00058) that is
--     syntactically valid, resolves to nothing, and burns a send against the
--     daily SMTP quota on every attempt.
--   * Seven companions silently sharing their purchaser's inbox with nothing
--     in the data to say so, so a bulk send could address the booking by the
--     companion's name — including that "- -".
--   * No transaction_id, so a free companion could not be traced back to the
--     payment that bought their seat.
--   * No f_fname / f_lname / f_email in answers, so the attendee modal and
--     every export showed blank name fields for add-ons while group members
--     right beside them were fine.
--
-- buildTscsAttendeeRows() now writes all of this correctly (see
-- supabase/functions/_shared/companionIdentity.ts for the rules, which this
-- file mirrors exactly). That only helps future mail; these rows need fixing
-- in place.
--
-- NO personal details are written into this file. This repository is public
-- and a congress registrant's name and address do not belong in it — every
-- value below is derived from columns already on the row or on its purchaser.
--
-- Idempotent: the `answers->>'tscs_companion_status' IS NULL` guard is
-- load-bearing, not decorative. A second run without it would read the
-- placeholder name this one writes and treat it as the registrant's real name.

WITH companion AS (
  SELECT
    a.id,
    a.name                       AS raw_name,
    a.email                      AS raw_email,
    a.transaction_id,
    p.name                       AS buyer_name,
    p.email                      AS buyer_email,
    p.transaction_id             AS buyer_txn,
    -- Same rule as readCompanionName(): a name needs at least two letters.
    -- This is what separates "- -", "--" and "." from a name nobody on the
    -- team happens to recognise, without a list to maintain.
    regexp_replace(lower(a.name), '[^a-z]', '', 'g') AS letters,
    ROW_NUMBER() OVER (
      PARTITION BY a.primary_attendee_id
      -- Paid participants first, the complimentary seat last, matching the
      -- order buildTscsAttendeeRows() emits them in.
      ORDER BY (a.ticket_type = 'Registration (Free Add-on)') ASC, a.registered_at, a.id
    ) + 1 AS seat_no
  FROM public.attendees a
  JOIN public.attendees p ON p.id = a.primary_attendee_id
  WHERE a.answers->>'tscs_source' IS NOT NULL
    AND a.is_primary = false
    AND a.answers->>'tscs_companion_status' IS NULL
),
judged AS (
  SELECT
    c.*,
    (
      length(c.letters) < 2
      OR c.letters IN (
        'na','nil','none','nonenone','nota','notapplicable','noname',
        'test','testtest','dummy','sample','unknown','tbd','tba','xx','xxx'
      )
    ) AS is_pending,
    CASE
      WHEN c.raw_email IS NULL OR btrim(c.raw_email) = '' THEN 'missing'
      WHEN c.raw_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN 'malformed'
      -- A final label repeated verbatim: 'gmail.com.com'. Real public
      -- suffixes ('.co.in', '.com.au', '.co.uk') do not match.
      WHEN c.raw_email ~ '\.([a-z]{2,24})\.\1$' THEN 'doubled-tld'
      WHEN lower(btrim(c.raw_email)) = lower(btrim(c.buyer_email)) THEN 'same-as-purchaser'
      ELSE 'ok'
    END AS email_verdict
  FROM companion c
)
UPDATE public.attendees a
SET
  -- An unclaimed seat takes the placeholder shape the BOGO free-guest flow
  -- and ManualTicketTool already use, so the existing pending-claim UI, the
  -- `?ref=` claim link and the check-in list all understand it with no special
  -- case for India.
  name = CASE
    WHEN j.is_pending THEN coalesce(nullif(btrim(j.buyer_name), ''), 'Booking') || ' - Guest (pending)'
    ELSE a.name
  END,
  email = CASE
    -- `.invalid` is reserved by RFC 2606 and resolves to nothing, so no bug
    -- can ever mail an unclaimed seat as though it were a person.
    WHEN j.is_pending THEN 'guest-' || a.id::text || '@placeholder.invalid'
    -- A named companion whose own address cannot be delivered to falls back to
    -- the purchaser's inbox — deliverable, and the purchaser can forward. The
    -- address TSCS actually sent is kept in answers for whoever corrects it.
    WHEN j.email_verdict IN ('malformed', 'doubled-tld') THEN lower(btrim(j.buyer_email))
    ELSE a.email
  END,
  guest_type = CASE WHEN j.is_pending THEN 'pending-claim' ELSE a.guest_type END,
  -- Free companions sit outside the razorpay dedupe index (payment_method is
  -- NULL), so this is traceability, not a uniqueness key.
  transaction_id = coalesce(a.transaction_id, j.buyer_txn || '-p' || j.seat_no),
  answers = coalesce(a.answers, '{}'::jsonb) || jsonb_build_object(
    'f_fname', CASE WHEN j.is_pending THEN NULL ELSE nullif(split_part(btrim(j.raw_name), ' ', 1), '') END,
    'f_lname', CASE
      WHEN j.is_pending THEN NULL
      ELSE nullif(btrim(substring(btrim(j.raw_name) FROM position(' ' IN btrim(j.raw_name) || ' ') + 1)), '')
    END,
    -- NULL here is the durable signal for "this row's inbox is not its own".
    -- Every recipient list and the dashboard's Shared-inbox chip read it
    -- rather than re-deriving it by comparing addresses.
    'f_email', CASE WHEN j.email_verdict = 'ok' THEN lower(btrim(j.raw_email)) ELSE NULL END,
    'tscs_email_source', CASE WHEN j.email_verdict = 'ok' THEN 'own' ELSE 'inherited' END,
    'tscs_companion_status', CASE WHEN j.is_pending THEN 'pending' ELSE 'identified' END,
    'tscs_raw_name', j.raw_name,
    'tscs_raw_email', j.raw_email,
    'tscs_name_issue', CASE WHEN j.is_pending THEN 'placeholder' ELSE NULL END,
    'tscs_email_issue', CASE WHEN j.email_verdict = 'ok' THEN NULL ELSE j.email_verdict END,
    'tscs_repaired_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
FROM judged j
WHERE a.id = j.id;
