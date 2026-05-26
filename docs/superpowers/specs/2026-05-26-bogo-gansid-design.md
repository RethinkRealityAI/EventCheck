# BOGO (Buy-One-Get-One-Free) for GANSID — Design Spec

**Date:** 2026-05-26
**Tenant:** GANSID (`portalEnabled = true`)
**Status:** Approved — ready for implementation

## 1. Summary

A per-form Buy-One-Get-One-Free program. Each paid attendee on a BOGO-enabled event form unlocks **one** free guest ticket of equal-or-lesser value (compared at the payer's tier+bracket). Buyers can fill in the guest at checkout, send a claim link, or invite/manage the guest later from a new `/portal/tickets` page. Email is locked to the recipient once "committed" (signed up, claimed, or checked in); before that, the payer can edit details. Admin contact for exceptions: `admin@inheritedblooddisorders.world`.

## 2. Locked-in rules

| Rule | Decision |
|---|---|
| Where enabled | Per-form toggle `form.settings.bogoEnabled` in `FormBuilder` (only shown when `CURRENT_SITE.portalEnabled === true`) |
| Value-comparison | Payer's tier+bracket defines the ceiling. Free guest's category price (looked up at payer's tier+bracket) ≤ payer's category price (same lookup) |
| What's free | Base category seat only. Addons (gala, workshops, etc.) still cost money |
| Group interaction | 1:1 — each paid ticket grants exactly one BOGO slot |
| Claim-entry UX | Both options at checkout (inline name+email OR claim link). PLUS a portal `My Tickets` page for post-purchase send/edit/resend/dismiss |
| Default mode at checkout | "Add my guest now" (inline) |
| Profile requirement | Optional signup via claim/post-receive link |
| Lock semantics | Free ticket is editable (name + email + category) while **uncommitted**. Lock triggers when ANY of: `user_id IS NOT NULL` OR `checked_in_at IS NOT NULL` OR `guest_type='claimed'`. After lock, only name typos are editable. |
| Revoke | No app-level revoke after send. **Dismiss** (cosmetic hide on payer's portal) is the only "remove" action. Real revocation requires admin |
| Eligibility (source) | Paid event-ticket primaries + paid group members on a BOGO-enabled event form. Excludes: test attendees, donated-seat claimants, sponsor/exhibitor staff, and BOGO claims themselves (no chaining) |
| Refund cascade | Hard-delete the linked BOGO free row + send withdrawal email when admin removes the paid attendee |
| Deadline | No deadline — open until event end |
| Admin contact | `admin@inheritedblooddisorders.world` (constant `BOGO_ADMIN_CONTACT` in `utils/bogo.ts`) |

## 3. Architecture

Approach B: checkout-time BOGO claims go through `verify-payment`; post-purchase actions go through a new JWT-authenticated `bogo-send` edge function. Row-construction logic is shared via `supabase/functions/_shared/bogoRowBuilder.ts` to avoid drift between the two entry points.

## 4. Data model

### 4.1 `form.settings` (jsonb — no schema migration)

```ts
settings: {
  ...existing,
  bogoEnabled?: boolean;       // default undefined (off)
  bogoNoteToBuyer?: string;    // optional admin-customizable copy at checkout
}
```

### 4.2 `attendees` table — one migration

```sql
ALTER TABLE attendees
  ADD COLUMN is_bogo_claim              boolean      NOT NULL DEFAULT false,
  ADD COLUMN bogo_source_attendee_id    uuid         REFERENCES attendees(id) ON DELETE SET NULL,
  ADD COLUMN bogo_dismissed_by_payer_at timestamptz  NULL;

-- 1:1 invariant
CREATE UNIQUE INDEX attendees_bogo_one_per_paid_idx
  ON attendees (bogo_source_attendee_id)
  WHERE is_bogo_claim = true AND bogo_source_attendee_id IS NOT NULL;

-- New RLS policy: payer can see BOGO claim rows that reference their paid attendees,
-- even when the free row has user_id IS NULL (pre-claim).
CREATE POLICY "users_can_see_their_bogo_claims" ON attendees
  FOR SELECT
  USING (
    bogo_source_attendee_id IN (
      SELECT id FROM attendees WHERE user_id = auth.uid()
    )
  );
```

`ON DELETE SET NULL` is a defensive guardrail — the application-managed cascade-delete always runs first.

### 4.3 `Attendee` TS type ([types.ts](../../types.ts))

```ts
isBogoClaim?: boolean;
bogoSourceAttendeeId?: string | null;
bogoDismissedByPayerAt?: string | null;
```

### 4.4 Eligibility predicates (computed client-side in `utils/bogo.ts`)

```
paid.bogoEligible =
  form.settings.bogoEnabled === true
  AND paid.isTest !== true
  AND paid.isBogoClaim !== true
  AND paid.isDonatedSeatClaim !== true
  AND paid.paymentStatus IN ('paid', 'pending', 'free' /*group members*/, 'external')
  AND (paid.guestType === null OR paid.guestType IN ('adult', 'child', 'claimed', 'pending-claim'))

paid.hasUnusedBogoSlot = bogoEligible AND NOT EXISTS (
  any attendee with bogoSourceAttendeeId === paid.id   // dismissed rows still count as used
)
```

### 4.5 Slot ownership

A paid attendee's BOGO slot is controlled by `attendees.user_id`:
- Primary purchaser: their own `user_id` (when signed in)
- Pending-claim group member: `user_id` is NULL → slot controlled by primary purchaser until claim
- After claim: `user_id` populates → slot ownership transfers naturally

The portal's `My Tickets` page filters `WHERE user_id = auth.uid()` plus the RLS policy above for the reciprocal direction.

## 5. Form Builder

In [FormBuilder.tsx](../../components/FormBuilder.tsx), settings tab, near `pricingTemplateId`:

```
☐ Enable Buy-One-Get-One-Free
   Each paid attendee on this form can bring one guest free,
   with a ticket category of equal or lesser value than their own.
   Requires a pricing template.

   [Custom message to buyer]
   ┌────────────────────────────────────────────┐
   │ Bring a colleague — equal or lesser ticket │
   │ value free.                                │
   └────────────────────────────────────────────┘
```

Validation in FormBuilder save:
- `bogoEnabled=true` requires `pricingTemplateId` set (no template = no ceiling).
- Toggle is hidden when `form.formType !== 'event'`.
- Toggle is hidden when `CURRENT_SITE.portalEnabled !== true` (SCAGO safety).

## 6. Public registration UX (checkout-time BOGO)

Section in [PublicRegistration.tsx](../../components/PublicRegistration.tsx), appears **after** the buyer picks their own category and **before** the payment summary. Skipped when `isAnyPendingClaim === true`.

### 6.1 Solo registration

```
🎁 BRING A GUEST FREE
Your "Physician" ticket includes one free guest at equal or lesser value
(Physician, Community Member, Patient, or Student).

  ● Add my guest now              ← DEFAULT
  ○ Send claim link later
  ○ Skip — no free guest

[inline mode]
  Name:     [_________________________]
  Email:    [_________________________]
  Category: [ Patient ▼ ]              (dropdown filtered to ≤ payer's price)

[claim link mode]
  After payment we'll email you ([you@email]) a claim link. Forward it to
  your guest, or send it from your portal dashboard later.

ℹ Once you send a free ticket, the email cannot be changed (until name typos
  only). Need an exception? admin@inheritedblooddisorders.world
```

### 6.2 Group registration

N stacked accordion rows, one per paid ticket, each defaulting to inline mode:

```
🎁 FREE GUESTS — your group of 3 includes 3 free guest slots
▸ Free guest paired with: You (Physician)       [inline ▾]
▸ Free guest paired with: Jordan L. (Student)   [inline ▾]
▸ Free guest paired with: Member 3 (Patient)    [inline ▾]
```

### 6.3 Pricing display

```
Your ticket (Physician, Canada):       $500.00
Group member 2 (Student, Canada):      $100.00
Group member 3 (Patient, Canada):      $200.00
Subtotal:                              $800.00
Free guests (3 slots, $0 each):    +0  ($0.00)
                                       ───────
Total:                                 $800.00
```

### 6.4 Client validation pre-submit

For each `mode='inline'` slot: name + email present, valid email format, category selected, no duplicate guest email within the same checkout. Soft warning (not blocker) if email matches another attendee on the form.

### 6.5 Payload extension

```ts
bogoClaims?: Array<{
  paidIndex: number;            // 0 = primary, 1..N = group members
  mode: 'inline' | 'claim_link';
  guestName?: string;           // required when mode='inline'
  guestEmail?: string;          // required when mode='inline'
  categoryId?: string | null;   // required when mode='inline'; null for claim_link
}>
```

## 7. Server — `verify-payment` changes

### 7.1 Validation pass (runs before payment capture)

For each `bogoClaims` entry:

1. `form.settings.bogoEnabled === true` — else 422 `BOGO_NOT_ENABLED`
2. `paidIndex` in range — else 422 `BOGO_BAD_INDEX`
3. Target paid attendee is eligible — else 422 `BOGO_INELIGIBLE_SOURCE`
4. No duplicate `paidIndex` across `bogoClaims` — else 422 `BOGO_DUPLICATE_SOURCE`
5. If `mode='inline'`:
   - name/email present + email regex — else 422 `BOGO_MISSING_FIELDS`
   - categoryId exists in template — else 422 `BOGO_BAD_CATEGORY`
   - `price(categoryId) ≤ price(payer.categoryId)` at payer's tier+bracket — else 422 `BOGO_PRICE_EXCEEDED`

### 7.2 Insert order

```
1. Capture payment (existing PayPal flow, unchanged)
2. Insert primary + group attendees (existing branches, unchanged)
3. For each bogoClaim, build a row via shared helper `buildBogoRow()`:
     id, form_id, name, email,
     ticket_type:               'Registration (Free Guest)',
     guest_type:                inline ? 'adult' : 'pending-claim',
     payment_status:            'free',
     payment_amount:            0,
     payment_method:            'bogo',
     is_bogo_claim:             true,
     bogo_source_attendee_id:   paid.id,
     primary_attendee_id:       null,
     is_primary:                true,
     pricing_template_id:       paid.pricing_template_id,
     pricing_tier:              paid.pricing_tier,
     pricing_bracket:           paid.pricing_bracket,
     pricing_category_id:       inline ? bogoClaim.categoryId : null,
     qr_payload:                JSON.stringify({ id, invoiceId, formId, action: 'checkin' })
4. Send emails (Section 9)
```

### 7.3 Failure handling

Steps 1–2 unchanged. If step 3 fails partially: paid rows persisted, server returns 200 with `partialBogoFailure: true`. Client shows banner: "Payment confirmed. Visit your portal to set up your free guest."

## 8. `bogo-send` edge function

JWT-authenticated. Path: `supabase/functions/bogo-send/`.

### 8.1 Request

```ts
POST /functions/v1/bogo-send
Authorization: Bearer <user JWT>
{
  action: 'send' | 'resend' | 'edit-name' | 'edit-recipient' | 'dismiss' | 'restore',
  paidAttendeeId?: string,        // 'send'
  freeAttendeeId?: string,        // 'resend' | 'edit-*' | 'dismiss' | 'restore'
  mode?: 'inline' | 'claim_link', // 'send'
  guestName?: string,             // 'send'/inline, 'edit-name', 'edit-recipient'
  guestEmail?: string,            // 'send'/inline, 'edit-recipient'
  categoryId?: string,            // 'send'/inline, 'edit-recipient'
}
```

### 8.2 Auth / ownership

- `send`: require `paid.user_id === auth.uid()`
- `resend` / `edit-*` / `dismiss` / `restore`: require `source.user_id === auth.uid()` where `source = attendees[free.bogo_source_attendee_id]`

### 8.3 Action semantics

| Action | Allowed when | Server effect |
|---|---|---|
| `send` | Slot is **Available** | Validate (same as `verify-payment` BOGO claim), insert free row via `buildBogoRow()`, send appropriate email |
| `resend` | Free row exists, `checked_in_at IS NULL` | Re-mail the saved address (no field changes) |
| `edit-name` | Always (until check-in) | Update `name` only |
| `edit-recipient` | Free row is **uncommitted** (`user_id IS NULL` AND `checked_in_at IS NULL` AND `guest_type != 'claimed'`) | Update name/email/category; re-fire ticket email if email changed; rebuild QR if category changed |
| `dismiss` | Always | Set `bogo_dismissed_by_payer_at = now()` |
| `restore` | Free row has `bogo_dismissed_by_payer_at IS NOT NULL` | Clear `bogo_dismissed_by_payer_at` |

### 8.4 Errors

- 401 `UNAUTHENTICATED`, 403 `BOGO_NOT_OWNER`, 400 `BOGO_NOT_A_CLAIM`, 409 `BOGO_SLOT_TAKEN`, 409 `BOGO_ALREADY_CHECKED_IN`, 409 `BOGO_ALREADY_COMMITTED` (for `edit-recipient` after lock), plus the validation codes from Section 7.1.

### 8.5 Shared helper

`supabase/functions/_shared/bogoRowBuilder.ts` exports `buildBogoRow(args)` returning an `AttendeeInsert`. Called by both `verify-payment` and `bogo-send`.

### 8.6 Deploy

Both projects via CLI per CLAUDE.md §15:

```
npx --yes supabase functions deploy bogo-send --project-ref iigbgbgakevcgilucvbs --use-api
npx --yes supabase functions deploy bogo-send --project-ref gticuvgclbvhwvpzkuez --use-api
```

SCAGO never invokes it (no portal); columns gain safe defaults so no SCAGO data is touched.

## 9. Email templates

Stored in `app_settings`, editable via [Settings/EmailTemplatesTab](../../components/Settings/EmailTemplatesTab.tsx). All three reuse [send-ticket-email](../../supabase/functions/send-ticket-email/index.ts) with new `mode` values: `bogo-ticket`, `bogo-claim-link`, `bogo-ticket-updated`, `bogo-ticket-withdrawn`.

| Template key | Recipient | Trigger | Attachments |
|---|---|---|---|
| `bogoTicket` | Free guest | `verify-payment` inline mode, `bogo-send send/inline`, post-claim of claim-link | PDF + inline QR |
| `bogoClaimLinkForPayer` | Payer | `verify-payment claim_link` mode, `bogo-send send/claim_link` | (no attachment; link inside) |
| `bogoTicketUpdated` | Free guest | `bogo-send edit-recipient` with email/category change | New PDF + new QR |
| `bogoTicketWithdrawn` | Free guest | Admin cascade-delete of paid source | (none) |

### 9.1 Placeholders

`{{payer_name}}`, `{{guest_name}}`, `{{guest_email}}`, `{{event_title}}`, `{{event_date}}`, `{{venue}}`, `{{claim_link}}`, `{{ticket_pdf_link}}`, `{{signup_link}}`, `{{portal_tickets_link}}`, `{{free_category_name}}`, `{{admin_contact}}`.

### 9.2 Default bodies

**`bogoTicket`**
```
Hi {{guest_name}},

{{payer_name}} has gifted you a free ticket to {{event_title}}.

Your ticket details:
  Category: {{free_category_name}}
  Date: {{event_date}}
  Venue: {{venue}}

Your QR code is attached. Show it at the door.

This ticket is issued to your email address and cannot be transferred to
another person. If you have questions or issues, contact {{admin_contact}}.

Optional: create a profile to manage your ticket and access event resources:
{{signup_link}}
```

**`bogoClaimLinkForPayer`**
```
Hi {{payer_name}},

Your free guest claim link is ready.

Forward this link to the person you'd like to bring:
  {{claim_link}}

Or you can manage this and your other tickets from your portal:
  {{portal_tickets_link}}

Once your guest claims the ticket, the email they enter is locked to them.
Make sure to forward this to the actual person attending. For issues,
contact {{admin_contact}}.
```

**`bogoTicketUpdated`**
```
Hi {{guest_name}},

Your ticket for {{event_title}} has been updated by {{payer_name}}.
The latest version is attached — please discard any earlier copies.

This ticket is issued to your email address and cannot be transferred.
Questions? {{admin_contact}}.
```

**`bogoTicketWithdrawn`**
```
Hi {{guest_name}},

The free ticket {{payer_name}} sent you for {{event_title}} has been
withdrawn. We're sorry for the inconvenience.

For questions or alternatives, please contact {{admin_contact}}.
```

## 10. Portal `My Tickets`

New route in `PortalLayout`: `/portal/tickets` (gated by `portalEnabled` like all `/portal/*` routes).

### 10.1 New components

```
components/Portal/MyTickets/
  MyTicketsPage.tsx       Page wrapper + data fetch
  TicketCard.tsx          Per-paid-attendee card with QR + BOGO sub-section
  BogoSlotPanel.tsx       Four-state BOGO sub-card
  BogoSendForm.tsx        Inline send form (inline + claim_link modes)
  BogoEditForm.tsx        Edit-recipient form (uncommitted) / Edit-name form (committed)
  index.ts                Re-exports
utils/bogo.ts             Pure functions: eligibility, slot state, allowance count
tests/bogo.test.ts        Unit tests
```

### 10.2 Sidebar entry

`PortalLayout` nav gets a "My Tickets" link with a ticket icon, between Dashboard and Profile.

### 10.3 Dashboard summary tile

`PortalDashboard` adds a small card:

```
🎟  Your tickets
3 active registrations
2 free tickets to send
View all →
```

The "X free tickets to send" line is the headline and only renders when count > 0.

### 10.4 Page layout

```
YOUR TICKETS
You have 2 free guest tickets to send.

[ TicketCard ]   GANSID Congress 2026 — Physician
                 QR code · Status · Download PDF
                 BogoSlotPanel — state-driven (see 10.5)

[ TicketCard ]   GANSID Congress 2026 — Student
                 ...

Show hidden free guests (3) →    ← only renders when dismissed rows exist
```

### 10.5 Four-state slot panel

| State | Detected by | Actions |
|---|---|---|
| Available | No row with `bogoSourceAttendeeId = paid.id` | `Send free ticket` |
| Inline-sent | `guestType='adult'` | `Resend` · `Edit guest details` (if uncommitted) / `Fix typo in name` (if committed) · `Hide from my tickets` |
| Pending-claim sent | `guestType='pending-claim'` | `Resend claim link` · `Copy claim link` · `Edit guest details` · `Hide from my tickets` |
| Claimed | `guestType='claimed'` | `Fix typo in name` · `Hide from my tickets` |

Dismissed rows are filtered out of the default view. "Show hidden" link at page bottom restores visibility; each restored card gets a `Restore` button to clear `bogo_dismissed_by_payer_at`.

### 10.6 Inline editability rule

The free attendee row is **uncommitted** while ALL of these hold:
- `user_id IS NULL`
- `checked_in_at IS NULL`
- `guest_type != 'claimed'`

UI helper text on the edit form: "Editable until your guest signs up, claims, or checks in. After that, only name typos can be fixed — contact admin@inheritedblooddisorders.world for other changes."

### 10.7 Data fetch

```ts
// Pass 1: my paid attendees + my own BOGO-claim rows
supabase.from('attendees').select('*, form:forms(*)')
  .eq('user_id', authUid);

// Pass 2: BOGO-claim rows referencing my paid attendees (pre-claim, user_id IS NULL)
supabase.from('attendees').select('*, form:forms(*)')
  .in('bogo_source_attendee_id', myPaidIds)
  .eq('is_bogo_claim', true);

// Merge and compute states via utils/bogo.ts
```

### 10.8 Mobile

Stacked single-column under 640px. QR shrinks to 160px. Send/edit forms expand inline (no modal — avoids the backdrop-blur portal gotcha noted in CLAUDE.md §18).

## 11. Admin dashboard

### 11.1 `AttendeeList` row indicators

- Free attendees (`isBogoClaim=true`): green `🎁 FREE GUEST` pill (similar to `DONATED SEAT CLAIM` pill).
- Paid attendees with an issued BOGO: small inline tag `+ 1 free guest` linking to the free row.

### 11.2 `AttendeeModal` Details tab

- Paid attendee with free linked: panel showing free guest name/email/category + "Open guest record" link.
- Free attendee: panel showing source's name/category + "Open source record" link + mode + sent date.

### 11.3 Stats

No new card on first ship. Free BOGO tickets count toward existing **Total Registrations** and **Live Attendance**. A "Free Guests Issued" card can be added later if needed.

### 11.4 Admin cascade-delete

When admin deletes a paid attendee with linked BOGO free in `AttendeeModal`, confirmation modal lists impacted free guests. On confirm: fire `bogoTicketWithdrawn` email per free row, hard-delete free rows (rowcount-checked), hard-delete paid. Path runs via a new edge function `admin-cancel-attendee` to keep `verify-payment` focused.

## 12. Edge cases

- **Concurrency:** partial unique index handles double-send race. Server catches the unique-violation and returns 409 `BOGO_SLOT_TAKEN`.
- **Duplicate emails:** same-batch BOGO inline duplicates 422. BOGO inline matching paid attendee in batch → soft warning. Cross-form duplicates → soft warning, allowed.
- **Pricing template edits mid-event:** existing BOGO rows unaffected (price stamped on row at purchase). New claims use new prices.
- **`bogoEnabled` flipped off after sends:** existing rows survive; new sends blocked.
- **Form deletion:** standard cascade via `attendees.form_id`.
- **Pending-claim group member claims:** their `user_id` populates → slot ownership transfers naturally.
- **PayPal double-tab race for at-checkout BOGO:** partial unique index drops the second insert; server returns `partialBogoFailure: true`; user can retry from portal.

## 13. Testing

Unit (Vitest, `tests/bogo.test.ts`):
- `getBogoSlotState(paid, all)` for all four states + dismissed
- `isCategoryEligibleForBogo(paid, candidate, template)` enforces ceiling at payer's tier+bracket
- `countAvailableBogoSlots(userAttendees)` correct across multi-form, mixed eligibility
- Eligibility filter excludes test, donation-claim, sponsor/exhibitor staff, BOGO claims
- Dismissed rows count as "slot used"

Manual UI verification per CLAUDE.md §17:
- FormBuilder toggle gating
- Solo paid → inline → both emails arrive
- Solo paid → claim_link → payer gets link → guest claims → BOGO ticket arrives
- Group of 3 with mixed modes per slot
- Portal `My Tickets` allowance counter
- Send free ticket from portal
- Edit recipient (uncommitted): name+email+category change → new ticket email
- Edit name (committed): name only updates
- Dismiss + Restore round-trip
- Admin cascade-delete: paid + linked free both gone, withdrawal email fires

Type-check (`npx tsc --noEmit`) + build (`npm run build`) must pass before deploy.

## 14. Rollout sequence

Per CLAUDE.md §15 and §16:

1. **Migration** (SCAGO via MCP, GANSID via CLI):
   - Add `is_bogo_claim`, `bogo_source_attendee_id`, `bogo_dismissed_by_payer_at` columns
   - Add partial unique index
   - Add RLS policy `users_can_see_their_bogo_claims`
2. **Edge functions** (CLI both projects, `--use-api`):
   - `verify-payment` (updated)
   - `send-ticket-email` (new modes + templates)
   - `bogo-send` (new)
   - `admin-cancel-attendee` (new)
3. **Frontend** (push to main, both Netlify sites build automatically).
4. **Smoke test:** curl `verify-payment` empty body → existing error; curl `bogo-send` missing JWT → 401.

## 15. CLAUDE.md updates (post-ship)

- §11 — Add `bogo-send` and `admin-cancel-attendee`.
- §12 — Add `is_bogo_claim`, `bogo_source_attendee_id`, `bogo_dismissed_by_payer_at`.
- §13 — Note BOGO pill on AttendeeList rows.
- §18 — Add: BOGO 1:1 partial unique index; edit-recipient lock semantics.
- §19 — Dated entry pointing to this spec + commits.
- Bump "Last refreshed" date.
