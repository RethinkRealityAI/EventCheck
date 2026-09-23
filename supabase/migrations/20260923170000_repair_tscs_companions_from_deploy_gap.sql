-- Re-run the TSCS companion repair for rows ingested in the deploy gap.
--
-- 20260922100000_repair_tscs_companion_rows fixed every companion row that
-- existed when it ran, and buildTscsAttendeeRows() writes new ones correctly —
-- but the ingest fix only went live when its edge function deployed, on merge
-- (2026-09-23 16:03 UTC). TSCS mail ingested between the two was written by
-- the old code, which is how a "- -" companion holding its purchaser's inbox
-- reached the roster again the morning after the repair.
--
-- The statement below is the earlier migration's, unchanged. Its
-- `answers->>'tscs_companion_status' IS NULL` guard makes it touch only rows
-- nothing has judged yet, so running it again is safe by construction — and
-- is the whole point: one rule, applied to the rows the first pass could not
-- have seen. No personal details: every value derives from columns on the row
-- or its purchaser.
--
-- Lesson carried into DEPLOY.md: a data repair that depends on new ingest
-- code must be re-run (or applied) AFTER that code deploys, not before.

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
