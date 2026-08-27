# Payment incident runbook — "I paid, but the site says payment not completed"

How to investigate a registrant who reports being charged while the website
shows the payment as not completed, and what each statement pattern actually
means. Written after the 2026-08-25 report (Indian registrant, two pending
`PAYPAL *GLOBALACTIO…` entries of the same amount on the same day).

## 1. Read the bank statement pattern first

| What the statement shows | What actually happened | Money outcome |
| --- | --- | --- |
| One **pending debit** AND one **pending credit** for the same amount, same day | The bank **authorized** the payment, then PayPal's **capture was declined or never ran** (buyer closed the tab, `INSTRUMENT_DECLINED`, issuer refused the international capture). The credit is the reversal of the hold. | **No money leaves.** Both entries disappear when the hold drops (typically 1–5 business days). |
| One **pending debit** only | Either a capture in flight, or an authorization hold whose reversal hasn't posted yet. | Wait for it to post or drop. If it **posts** with no registration → go to §3. |
| One **posted (non-pending) debit**, no registration | The capture COMPLETED but our server rejected/failed the registration afterwards. | Real charge. Must be refunded — see §3. |

The screenshot pattern (−$36.12 pending + $36.12 pending) is the first row:
the buyer was **not** ultimately charged, even though their app shows a debit.
This is the classic signature of a **declined capture**.

### Why Indian users hit this disproportionately

Since RBI's rules on e-mandates/international online transactions, many
India-issued cards **authorize** an international PayPal charge but the
issuer then **refuses the capture** (surfaced by PayPal as
`INSTRUMENT_DECLINED`). PayPal India personal accounts are also restricted
from consumer purchase payments. The buyer sees a pending debit and quite
reasonably believes they paid. The checkout now:

- shows dedicated copy for `INSTRUMENT_DECLINED` explaining the hold reversal,
- calls PayPal's `actions.restart()` so the buyer can pick another funding
  source without re-filling the form.

Suggest to affected users: a different card (one enabled for international
online use), or a PayPal balance/linked bank funding source.

## 2. Where the evidence lives

All lookups below run against the **production** Supabase project for the
affected deployment (each event site has its own project).

1. **`payment_failures` table** (admin-only; portal admins can query it):

   ```sql
   select occurred_at, provider, stage, order_ref, amount, currency,
          reference, message, email, attendee_name
   from payment_failures
   where occurred_at >= now() - interval '7 days'
   order by occurred_at desc;
   ```

   Stages you will see:
   - `paypal-capture-declined` — capture refused (the §1 first-row case).
     `reference` holds the PayPal issue code (e.g. `INSTRUMENT_DECLINED`).
   - `order-mismatch-rejected-precapture` — the order's amount/currency
     didn't match the server-computed total, so the server refused to
     capture at all. **The buyer was never charged**; any pending
     statement entry is the authorization hold releasing on its own.
     Nothing to refund — this row is diagnostic only (a stale tab or a
     tampered client).
   - `capture-failed` — client-side report after an approved payment failed
     to finalize. `order_ref` is the PayPal order id.
   - `amount-mismatch-*` / `currency-mismatch-*` — capture completed but the
     total didn't match; suffix `-refunded` means the server already
     auto-refunded (refund id in `reference`), `-refund-needed` means a
     **manual refund is required now**. Rare since the pre-capture guard:
     PayPal mismatches are normally rejected before capture (previous stage);
     these are the safety net, and the only path for Flutterwave.
   - `*-insert-failed` — capture completed, DB write failed. Manual recovery:
     the buyer paid and has no registration.
   - `paypal-onerror` / `flutterwave-onerror` — the provider UI failed before
     our server was involved. No money moved.

2. **`attendees` table** — confirm whether a registration actually exists:

   ```sql
   select id, name, email, payment_status, payment_amount, transaction_id, registered_at
   from attendees
   where email ilike '%<buyer email>%'
      or registered_at::date = '<payment date>';
   ```

3. **PayPal Business dashboard → Activity** — search by date and amount.
   - Order shows **"Authorized"/"Voided"** with no capture → declined/never
     captured; nothing to refund.
   - Order shows a **completed capture** with no matching `attendees` row →
     refund it from the dashboard, then mark the `payment_failures` row
     resolved (`resolved_at`, `resolved_note`).

4. **Edge function logs** (Supabase → Edge Functions → verify-payment):
   `[verify-payment <tag>] PayPal capture failed` lines carry the issue code
   and `debug_id` — PayPal support can trace any transaction by `debug_id`.

## 3. If the buyer was genuinely charged with no registration

1. Find the capture: `payment_failures.order_ref` → PayPal Activity.
2. If the stage ends in `-refunded`, the refund is already in flight — tell
   the buyer to allow 3–5 business days.
3. Otherwise refund from the PayPal dashboard (or re-run the registration
   manually and keep the money, if the buyer prefers).
4. Stamp the row: `update payment_failures set resolved_at = now(),
   resolved_note = '<what you did>' where id = '<id>';`

## 4. What the code guarantees (after this change)

- Every PayPal capture decline, Flutterwave verify failure, post-capture
  amount/currency mismatch, and post-capture DB failure writes a
  `payment_failures` row **server-side** (the older client-side report still
  runs but is no longer the only trail).
- Post-capture amount/currency mismatches are **auto-refunded** (PayPal) and
  the buyer is told the truth — "your payment was captured and refunded" —
  instead of the old bare error while the money stayed captured.
- The checkout never claims "you have not been charged" when the server says
  the capture completed (`charged: true` in the error body).
- `INSTRUMENT_DECLINED` restarts the PayPal flow so the buyer can pay with a
  different funding source.

## 5. Known limits

- Flutterwave refunds remain manual (stage `…-refund-needed`).
- An order **approved but never captured** (buyer closed the tab before our
  server was called) leaves only a client-side `capture-failed` row at best;
  the authorization simply expires and reverses on its own. A PayPal webhook
  (`CHECKOUT.ORDER.APPROVED`) would close that gap if it recurs.
