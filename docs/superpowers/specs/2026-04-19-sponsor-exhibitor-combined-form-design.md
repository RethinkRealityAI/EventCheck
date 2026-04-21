# GANSID Sponsor & Exhibitor Combined Form — Design

**Date:** 2026-04-19
**Scope:** GANSID only. SCAGO sponsor flow untouched.
**Replaces/refactors:** the existing GANSID exhibitor form template (`gansid-congress-2026-exhibitors`). No live submissions; safe to change in place.

## Goal

Collapse the separate GANSID exhibitor and sponsor registration flows into a single, payment-free, stepped form that:

- Lets a user choose Sponsor or Exhibitor up front, then branches into the relevant flow.
- Removes PayPal entirely (payment is handled externally for both).
- Uses the same group-style staff-collection UX the attendee flow already uses ("I have each person's details" toggle → inline OR send-link per staff member).
- Gives sponsor/exhibitor primaries a portal dashboard showing their staff roster with registration status and ticket access.
- Gives claimed staff a normal attendee portal experience with a "Staff — {OrgName}" badge.

The existing SCAGO sponsor form (PayPal + items + HST receipt) is explicitly out of scope and stays unchanged.

## Architecture

### New form type

- New value: `form_type = 'sponsor_exhibitor'`.
- `forms.form_type` CHECK constraint extended to allow this value.
- `storageService.mapFormFromDb` already passes `form_type` through with `form_type || 'event'` fallback — no code change needed there.
- `PublicRegistration` dispatches `form.formType === 'sponsor_exhibitor'` → new component `PublicSponsorExhibitorForm`.

### Component layout

```
components/SponsorExhibitor/
  PublicSponsorExhibitorForm.tsx         Top-level. Owns form state. Uses a lightweight
                                          custom stepper built on Portal/ui/StepperSidebar.
  steps/
    StepRegistrationType.tsx             Step 1: Sponsor / Exhibitor radio.
    StepOrgInfo.tsx                      Step 2: org + contact fields (same shape as
                                          existing sponsor form ContactFields).
    StepSponsorTier.tsx                  Step 3 (sponsor): tier dropdown with color dots,
                                          award eligibility (gold/silver), optional
                                          scholarship/ad selections.
    StepExhibitorBooth.tsx               Step 3 (exhibitor): booth-type dropdown with
                                          detail panel (quotas + optional note).
    StepStaffRoster.tsx                  Step 4: form-level "I have each person's details"
                                          toggle + per-category rosters with quota caps.
                                          Reuses GuestFullDetailsInline when inline mode.
    StepConsents.tsx                     Step 5: T&C, Disclaimer, Photo/Video.
    StepReview.tsx                       Step 6: summary + submit.
  TeamTable.tsx                          Portal dashboard team table (sponsor/exhibitor
                                          primaries only). Read + light edit.
  boothTypes.ts                          6-booth-type config table.
```

A custom shell is used rather than the existing `SteppedFormShell` / `FormRenderer` pair because the combined form is component-driven rather than `FormField[]`-driven. It still reuses `StepperSidebar` for the left nav, `GlassCard` / `ViscousButton` / `GlassInput` / `GlassSelect` for controls, and `GuestFullDetailsInline` for the inline staff-detail accordion — so visual consistency with the rest of the GANSID portal is maintained.

### Booth-type config

`config/formTemplates/boothTypes.ts`:

```ts
export interface BoothType {
  id: string;
  label: string;
  priceDisplay: string;  // informational only — no payment collected
  currency: 'CAD' | 'USD';
  hallOnlyQuota: number;
  fullAccessQuota: number;
  note?: string;
}

export const EXHIBITOR_BOOTH_TYPES: ReadonlyArray<BoothType> = [
  { id: 'booth_3x3_corner',            label: '3 × 3 m (9 m²) Corner Booth, 2 sides open',  priceDisplay: '$5,900', currency: 'CAD', hallOnlyQuota: 4, fullAccessQuota: 2 },
  { id: 'booth_3x3',                   label: '3 × 3 m (9 m²)',                              priceDisplay: '$4,500', currency: 'CAD', hallOnlyQuota: 4, fullAccessQuota: 2 },
  { id: 'booth_3x6_corner',            label: '3 × 6 m (18 m²) Corner Booth, 2 sides open',  priceDisplay: '$9,000', currency: 'CAD', hallOnlyQuota: 6, fullAccessQuota: 4 },
  { id: 'booth_3x6_inline',            label: '3 × 6 m (18 m²) In-line, 1 side open',        priceDisplay: '$7,750', currency: 'CAD', hallOnlyQuota: 6, fullAccessQuota: 4 },
  { id: 'booth_nonprofit',             label: 'In-line Non-Profit Booth (3 × 3 m, 9 m²)',   priceDisplay: '$1,200', currency: 'USD', hallOnlyQuota: 2, fullAccessQuota: 1, note: 'Verification of non-profit status required — our team will follow up after you submit.' },
  { id: 'booth_commercial_publishers', label: 'In-line Commercial Publishers (3 × 3 m, 9 m²)', priceDisplay: '$2,500', currency: 'USD', hallOnlyQuota: 2, fullAccessQuota: 1 },
];
```

Price is purely informational (shown in the booth detail panel for the user's reference). No price math runs anywhere.

### Sponsor tier dropdown

Reuses the existing sponsor form's `ticketConfig.items` filtered to `category === 'package'`. The dropdown option renderer shows:

- Colored dot per tier — signature (red), gold (amber), silver (gray), award (blue), scholarship (green)
- Tier name
- Included-seat quota badge ("16 seats", "8 seats", "0 seats")

Gold and Silver tiers still trigger the existing award-eligibility sub-selector (reused from `PublicSponsorForm`'s award lists). Scholarship and Ad items appear as optional add-on selections regardless of tier. These do not affect quota but are preserved in `sponsor_items` so admins can see what the sponsor committed to.

### Staff roster

Form-level toggle: **"Yes — I have each person's details on hand"**.

**Exhibitor roster:**
- Two sub-sections: Hall-Only and Full-Access, each capped by the selected booth's quota.
- Each row has Name, Email, and a remove button.
- Inline mode expands each row into `GuestFullDetailsInline` for the full personal-detail accordion (dietary, emergency, presenting, extra consents).
- No minimum fill: exhibitor may submit with zero or partial staff filled. Unfilled slots become `staff-pending` placeholder rows the exhibitor can complete later from the portal team table.

**Sponsor roster:**
- One pool capped by tier quota:
  - signature → 16
  - gold, silver → 8
  - award, scholarship → 0 (no roster step — stepper skips StepStaffRoster)
- Same inline-vs-link toggle applies.
- Partial fill allowed with placeholder creation (same behavior as exhibitor).

### Consents step

Identical to the existing exhibitor form's consent section:
- T&C (modal-gated via `ConsentCheckbox`)
- Disclaimer (modal-gated)
- Photo/Video acknowledgement (plain checkbox)

All three required for submission.

### Review step

Read-only summary of everything entered across the prior steps. Single "Submit Registration" button at the bottom. On click, opens the submission flow described below.

## Submission flow

All flows funnel through `verify-payment` via a new branch.

**Client request body (`verify-payment`):**

```ts
{
  mode: 'paid',
  formId: string,
  sponsorExhibitorSubmission: true,
  registrationType: 'sponsor' | 'exhibitor',
  org: {
    orgName: string,
    contactName: string,
    contactTitle?: string,
    email: string,
    phone?: string,
    address?: string,
    website?: string,
  },
  // one of (exactly one):
  sponsorTier?: 'signature' | 'gold' | 'silver' | 'award' | 'scholarship',
  sponsorItems?: Array<{ id, category, qty }>,   // optional add-ons + package
  sponsoredAwards?: string[],                     // only when tier in ('gold','silver')
  boothType?: 'booth_3x3_corner' | 'booth_3x3' | 'booth_3x6_corner'
            | 'booth_3x6_inline' | 'booth_nonprofit'
            | 'booth_commercial_publishers',
  // shared
  hasAllDetails: boolean,
  staff: Array<{
    name: string,
    email: string,
    category: 'hall_only' | 'full_access' | 'sponsor_seat',
    fullAnswers?: Record<string, unknown>,        // only when hasAllDetails === true
  }>,
  consents: {
    terms: true,
    disclaimer: true,
    photo: true,
  },
}
```

**Server validation:**

1. `registrationType` required; exactly one of `sponsorTier` or `boothType` present.
2. Staff count ≤ quota derived from the chosen tier / booth type.
3. All three `consents` are `true`.
4. `org.email` valid + non-empty.
5. Each staff entry has non-empty `name` and `email`, unless `hasAllDetails === false` and the entry is an empty placeholder (allowed — becomes `staff-pending`).

**Server writes:**

- Primary attendee row:
  - `name = org.orgName`
  - `email = org.email`
  - `payment_status = 'paid'`
  - `payment_amount = 'PAID EXTERNALLY'`
  - `user_id = authUserId` (from JWT if present; else NULL)
  - `company_info = org`
  - For sponsor: `sponsor_tier`, `sponsor_items` (add-ons preserved), `sponsored_awards` if applicable
  - For exhibitor: `exhibitor_booth_type`, `sponsor_tier = null`, `sponsor_items = null`
  - `form_type` reference inherited from the form row
  - `is_primary = true`
- N staff rows (one per `staff` entry):
  - `primary_attendee_id = primary.id`
  - `name`, `email` as supplied (or "Staff slot — not yet assigned" for empty placeholders)
  - `category` stored on a new column `staff_category` OR inside `answers.staffCategory` (decision: store in `answers` — no new column; column already generic, and the category is a display concept, not a query key)
  - `guest_type`:
    - `null` when `hasAllDetails === true` (full answers embedded in `answers`)
    - `'staff-pending'` when `hasAllDetails === false` and the row has a real name+email (claim link will be emailed)
    - `'staff-pending'` when the row is an empty placeholder (primary will fill in later from portal)
  - `user_id` = null initially; auto-linked by existing triggers once the staff member signs up

**Client post-submit:**

- Generate and email per-staff invitations for every `staff-pending` row that has a real email address. Calls `send-ticket-email` with `mode: 'staff-invite'`.
- Show success screen: "Registration complete. {{N}} staff invitation emails sent." For inline submissions, also: "{{M}} of your staff were pre-filled and will receive their confirmation tickets shortly." (Those tickets are sent client-side from the success page using `mode: 'staff-claim-completed'`, matching how the group attendee flow sends inline-guest tickets.)

## Staff claim flow

Reuses the existing pending-claim infrastructure. Key differences:

- When `PublicRegistration` detects `guest_type in ('staff-pending', 'staff-claimed')`, it renders a staff-specific headline ("You've been registered as staff for {{OrgName}} at GANSID Congress 2026") and a sub-line noting their category (Hall-Only or Full-Access or Sponsor Seat).
- Standard staff personal-detail fields are shown (dietary, emergency contact, presenting, extra consents).
- Default-checked "Create a portal account" signup panel — unchanged.
- On submit:
  - `guest_type = 'staff-claimed'`
  - `user_id` set to `auth.uid()` if signed in; otherwise backfilled by the auth-signup trigger when they create their account
  - Client calls `send-ticket-email` with `mode: 'staff-claim-completed'` → ticket PDF + inline QR to the staff member, plus a short notification to the primary contact.

## Portal — sponsor/exhibitor primary dashboard

### Team table component

Rendered between the WelcomeBlock and AvailableFormsGrid on the portal dashboard when the signed-in user is the primary of a sponsor_exhibitor attendee row.

**Columns:** Name, Email, Category, Status, Actions.

**Data source:** `attendees` rows where `primary_attendee_id = userPrimary.id`, sorted by category then name.

**Actions per row:**

- **Pending** (`guest_type = 'staff-pending'`):
  - **Copy Invitation Link** button — writes the `?ref=<attendeeId>` registration URL to clipboard.
  - **Fill in now** — collapsible panel with name + email + category dropdown. On Save:
    - `storageService.updateAttendee` updates name/email/answers.staffCategory.
    - Fresh `send-ticket-email` call in `mode: 'staff-invite'` with the new email as recipient.
    - Row stays `staff-pending` until the staff member clicks the link and completes their own claim flow.
- **Registered** (`guest_type = 'staff-claimed'` or `null`, with `payment_status = 'paid'`):
  - **View Ticket** — opens the existing `CredentialBadgeModal` pointed at the staff row's `qr_payload`.
  - **Download PDF** — reuses `generateTicketPDF` with the staff row's data.

**Empty state:** "No staff added yet. Add them from your registration submission." (links back to the form if the primary exists but no staff rows do).

### No team table for claimed staff

Staff users see the standard attendee dashboard only. Their credential card shows their own QR. No additional UI.

### Derived "Staff" badge

`PortalHeader` and `WelcomeBlock` compute a derived badge client-side:

- Load the user's most recent paid attendee row.
- If it has `primary_attendee_id != null`, load that primary and check for `sponsor_tier != null OR exhibitor_booth_type != null`.
- If yes: render **"Staff — {{primary.company_info.orgName}}"** pill. WelcomeBlock adds a sub-line: "Attending with {{OrgName}}".
- Otherwise: render the role-based "Attendee" pill (current behavior).

No schema change. Tree-shakeable — logic lives only in portal components, which are already gated on `CURRENT_SITE.portalEnabled`.

### AvailableFormsGrid

Extend `ROLE_TO_FORM_TYPES`:

```ts
{
  attendee:    ['event'],
  exhibitor:   ['exhibitor', 'sponsor_exhibitor'],
  sponsor:     ['sponsor', 'sponsor_exhibitor'],
  admin:       ['event', 'exhibitor', 'sponsor', 'sponsor_exhibitor'],
  super_admin: ['event', 'exhibitor', 'sponsor', 'sponsor_exhibitor'],
}
```

## Admin dashboard

Minimal changes:

- `SponsorsDashboard` / `SponsorsTable` — filter extended to include `form_type = 'sponsor_exhibitor'` alongside `sponsor`.
- `ExhibitorsTab` — filter extended similarly. For rows with `exhibitor_booth_type`, show the booth label instead of a tier label; for rows with `sponsor_tier` instead, show the tier label as today.
- Staff sub-rows display new `staff-pending` / `staff-claimed` status badges in the same style as existing pending-claim badges. `guest_type` constraint allows both the new and existing values.

## Schema migration — `20260419_add_sponsor_exhibitor.sql`

Applied to BOTH project refs (`iigbgbgakevcgilucvbs` SCAGO and `gticuvgclbvhwvpzkuez` GANSID). SCAGO never reads these columns but gets them for consistency.

```sql
-- 1. Extend form_type to include sponsor_exhibitor
ALTER TABLE forms
  DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE forms
  ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor', 'sponsor_exhibitor'));

-- 2. Add exhibitor_booth_type column
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS exhibitor_booth_type TEXT
  CHECK (exhibitor_booth_type IS NULL OR exhibitor_booth_type IN (
    'booth_3x3_corner', 'booth_3x3', 'booth_3x6_corner',
    'booth_3x6_inline', 'booth_nonprofit', 'booth_commercial_publishers'
  ));

-- 3. Extend guest_type CHECK constraint
ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_guest_type_check;
ALTER TABLE attendees
  ADD CONSTRAINT attendees_guest_type_check
  CHECK (guest_type IS NULL OR guest_type IN (
    'pending-claim', 'claimed',
    'exhibitor-staff-pending', 'exhibitor-staff-claimed',
    'staff-pending', 'staff-claimed'
  ));

-- 4. New staff email template columns + seed defaults
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
    '<p>Hi {{name}},</p><p>{{purchaser}} has registered you as a staff member for <strong>{{event}}</strong>.</p><p>Please complete your registration at: <a href="{{complete_url}}">{{complete_url}}</a></p>'),
  email_staff_confirmed_subject = COALESCE(
    email_staff_confirmed_subject,
    'Your staff registration for {{event}} is confirmed'),
  email_staff_confirmed_body = COALESCE(
    email_staff_confirmed_body,
    '<p>Hi {{name}},</p><p>Your staff registration for <strong>{{event}}</strong> is confirmed. Your ticket QR is attached and also appears in your portal.</p>');
```

## Edge function changes

### `verify-payment`

Add branch right after existing `exhibitorSubmission` handler:

```ts
if (body.sponsorExhibitorSubmission) {
  // validate body.registrationType, org, sponsorTier XOR boothType, staff[] within quota
  // insert primary attendee row (payment_status='paid', payment_amount='PAID EXTERNALLY')
  // insert staff rows (guest_type logic per spec)
  // return { attendeeIds: [primaryId, ...staffIds], claimUrls: { [staffId]: '/#/?ref=...' } }
}
```

Auth handling: same pattern as the existing group flow — if `Authorization: Bearer <jwt>` is supplied and verifies, `authUserId` is used for `primary.user_id`. Staff rows always `user_id = null`; auto-link triggers populate them post-claim.

### `send-ticket-email`

Two new modes, identical dispatch pattern to existing group modes:

- `mode: 'staff-invite'` — reads `email_staff_invite_*` from `app_settings`, merges placeholders, sends to the staff member with a claim link. Attachment callout suppressed (no attachments).
- `mode: 'staff-claim-completed'` — reads `email_staff_confirmed_*`, sends ticket PDF + inline QR; client provides the PDF as a base64 attachment (same pattern as existing group-invite flow).

Both modes support placeholders: `{{name}} {{purchaser}} {{org_name}} {{event}} {{category}} {{complete_url}} {{signup_url}}`.

Both modes must be deployed with `verify_jwt: false` (public-facing flow) — keep the existing `supabase/config.toml` setting.

## Testing (Vitest, pure units only)

- `tests/boothTypes.test.ts` — shape of `EXHIBITOR_BOOTH_TYPES`, quota invariants (e.g., fullAccessQuota ≤ hallOnlyQuota never strictly required, but IDs unique and labels non-empty).
- `tests/sponsorExhibitorValidation.test.ts` — payload validation helpers: tier XOR booth, staff count ≤ quota, consents all true, inline vs placeholder row logic.
- `tests/staffEmailTemplates.test.ts` — placeholder merge with `{{name}} {{purchaser}} {{org_name}} {{event}} {{category}} {{complete_url}} {{signup_url}}`, HTML escape guard.
- `tests/storageMappers.test.ts` — extend to assert `form_type = 'sponsor_exhibitor'` passes through unchanged.

UI / integration tests remain manual, consistent with current convention.

## Documentation updates

- `CLAUDE.md` — new "Sponsor & Exhibitor Combined Form" section (mirrors existing Exhibitor Form section). Update Project Structure with the `components/SponsorExhibitor/` tree. Note the new `form_type`, the two new email template pairs, and the derived "Staff — {OrgName}" badge behavior.

## Out of scope (deliberate)

- **SCAGO sponsor form** — unchanged; still uses PayPal + HST + receipt PDFs.
- **Non-profit verification file upload** — "admin will follow up" note only; admin handles verification offline.
- **Admin-side team table edits from portal** — portal edits are for primaries editing their own staff only.
- **Booth price normalization / receipt PDFs** — form is payment-free; prices are shown informationally only.
- **Additional m² / booth add-ons** — removed per user request.
- **New `staff` role** — derived badge handles visual distinction without a schema change.
- **Bulk import of staff rosters** — single-row add only.

## Open follow-ups (post-ship)

- If admins later want to edit staff rows from the portal (without using the admin dashboard), extend TeamTable with delete + reassign actions.
- If non-profit verification becomes a bottleneck, add a file-upload field gated on `boothType === 'booth_nonprofit'`.
- Consider a single unified "Sponsor & Exhibitor" admin tab merging `SponsorsTable` and `ExhibitorsTab` for GANSID once the new `form_type` is the primary source.
