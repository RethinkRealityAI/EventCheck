# QA process

Two layers, both required before a PR is marked ready.

## 1. The gate (every change)

```
npx tsc --noEmit
npm run check:edge          # edge-function types + scope
npm test                    # vitest (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set — any value)
npm run lint:migrations
npm run build
```

The PR description carries the one-line result, e.g.
`tsc --noEmit · check:edge · vitest 900 passed · lint:migrations · vite build`.

## 2. The QA agent (anything an admin will touch)

`scripts/qa/qa-run.mjs` drives the admin dashboard in a real browser the
way a tester would: sign in, create clearly labelled test registrations,
walk every flow the change touches, screenshot each step, verify the
outcome, and delete its own test data. It writes `qa-output/<run>/REPORT.md`
plus numbered screenshots that go into the PR.

### Mock mode — no tenant, no risk

```
npm run qa:mock
```

Starts Vite against an in-process stand-in for Supabase
(`scripts/qa/mock-supabase.mjs`) seeded from `scripts/qa/fixtures.mjs`: a
GANSID-shaped tenant with individual registrants, a group, a free guest, a
speaker, a sponsor booking with claimed / pending / inline delegates, an
exhibitor booking with booth staff, portal signups at every stage, and a
form-preview test row. Use it for every PR.

**Playwright is deliberately NOT a dependency of this repo**, so a clean
checkout cannot run either mode until you install it yourself. `loadPlaywright()`
in `qa-run.mjs` resolves a GLOBAL install for exactly this reason:

```
npm i -g playwright
npx playwright install chromium
```

If a run dies on `Cannot find package 'playwright'`, that is why — the
harness is fine.

### Live mode — the real platform

```
VITE_SUPABASE_URL=https://<ref>.supabase.co \
VITE_SUPABASE_ANON_KEY=<anon key> \
VITE_SITE=gansid \
QA_ADMIN_EMAIL=qa-agent@… QA_ADMIN_PASSWORD=… \
QA_TEST_INBOX=you+qa@yourdomain \
npm run qa:live
```

- **`QA_ADMIN_EMAIL`** is a dedicated admin account for the agent (create it
  from Admins → Invite; never reuse a person's login). It only needs the
  Dashboard page permission.
- **`QA_TEST_INBOX`** is an inbox you control. Every test registrant's
  address is a `+tag` on it, so any email the run sends lands with you.
- `QA_BASE_URL=https://deploy-preview-…netlify.app` drives a deployed build
  instead of starting Vite.
- `QA_KEEP=1` leaves the test rows in place for manual inspection.

### What the agent checks

| Flow | Verified |
|---|---|
| Dashboard | stats render; the Sponsors & Exhibitors strip is on the main page |
| Live tab | the sponsor booking **and** its delegates appear beside ordinary attendees; the Type column reads SPONSOR / DELEGATE / ATTENDEE |
| Type filter | "Sponsor / exhibitor delegates" narrows the list and shows an active-filter chip |
| Attendee detail | a delegate is labelled with its organization, not "Guest Ticket" |
| Bulk email (attendees) | the Email button counts the filtered rows; compose → review → send completes; one `email_sends` row per recipient |
| Sponsors tab | the booking is listed on the main dashboard |
| Exhibitors tab | renders (when the site has exhibitor forms) |
| Signups | "Email all (N)" tracks the status filter; the In-progress bucket opens on the Reminder template; deselecting everyone disables Send |
| Mobile | the unified list renders at 390 px |
| Cleanup | every row stamped with the run id is deleted and none remain |

### Safety rules (enforced in the script, not by convention)

1. Test rows are named `QA-TEST …` and stamped `answers._qa_run = <run id>`.
   Cleanup deletes by that stamp and asserts zero rows remain.
2. A bulk send is **confirmed only when every listed recipient is a QA test
   address**. On the Signups tab, which lists real people, the run deselects
   everyone, proves Send is disabled, and closes.
3. After the run it queries `email_sends` since the run started and fails
   if any send went to an address outside the QA inbox.
4. The bulk send writes one `email_sends` row per recipient. Cleanup deletes
   those too and asserts none remain — every QA address carries the run id, so
   the log rows are addressable without ever matching a real send. That delete
   needs the admin DELETE policy added in
   `20260915120000_allow_admin_delete_email_sends.sql`; before it, a live run
   left its log rows in the table permanently.

### Adding a flow

Add a numbered block to `runFlows()` in `scripts/qa/qa-run.mjs`, give the
elements it needs a `data-testid`, record each assertion with `check()`, and
take a `shot()` (full page) or `modalShot()` (viewport) at the moment a
reviewer would want to see. Keep mock and live behaviour identical except
where real people could be affected.
