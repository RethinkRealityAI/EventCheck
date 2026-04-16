# Exhibitor Form + Admin Registration-Type Tabs + Consent Modals — Design

**Date:** 2026-04-16
**Status:** Design approved, ready for implementation plan
**Scope:** Phase 2 sub-projects 3 + 4 combined, plus a cross-cutting ConsentCheckbox component. Closes out Phase 2.

## Background

GANSID Congress 2026 needs an exhibitor registration flow for corporate/industry partners (Platinum/Gold/Silver/Bronze tiers). Unlike attendee registration, exhibitors have already paid externally, so the form is a pure data-capture + staff-invitation flow — no pricing, no PayPal, no invoices. The exhibitor fills in organization info, picks their tier, lists staff members, and each staff member receives an invitation link to complete their own (trimmed) registration.

A small parallel piece: the GANSID T&C and Disclaimer need to be readable from the form before consent. A `ConsentCheckbox` component renders a clickable label that opens a modal with the document text; the checkbox stays disabled until the user has opened the modal at least once. Used on both the new exhibitor form and the existing GANSID attendee registration form.

Finally, the admin dashboard gains an **Exhibitors** tab so org rows + their staff rosters are segmented from regular attendees.

SCAGO remains unaffected — no behavior changes on sponsor or event forms on the SCAGO deployment.

## Approach: new form_type, component-driven, reuse pending-claim

Three loosely coupled pieces ship together:

1. **New `form_type='exhibitor'`** — adds a third value to the existing check constraint. `PublicRegistration.tsx` branches to `<PublicExhibitorForm />` when the loaded form has this type, analogous to the existing sponsor branch.
2. **Reuse the pending-claim attendee infrastructure** from sub-project 2 for staff invitation + claim. Staff rows carry `guest_type='exhibitor-staff-pending'` until claimed. The claim flow extends the existing pending-claim UX with two additional field hides (no presenting question, no emergency contact).
3. **Tier definitions hardcoded** in `buildGansidExhibitor.ts` per YAGNI — tier name, hall-only quota, full-congress quota, booth size. Single source of truth; no admin-editable tier management in this phase.

### Alternatives considered

- **Extend `sponsor` form type** — rejected. The user explicitly asked to decouple from SCAGO's sponsor logic. Sponsor has tier-based pricing + HST + cheque flows that don't apply.
- **Build a separate `ExhibitorStaffRegistrationForm` template** — rejected. The trimmed staff form is the existing GANSID Congress registration form with 4 field-IDs hidden; maintaining two separate templates for 99% overlap would create drift.
- **Admin-editable exhibitor tier config in Settings** — rejected for YAGNI. Tier structure is static for GANSID 2026 and likely 2027+. Revisit if a second tier structure ever emerges.
- **Stored markdown rendering via an MD parser** — rejected. Plain-text rendering of the fetched markdown files is enough; no new dependency needed.

## Data model

### Schema change

Single migration extends the `forms.form_type` check constraint:

```sql
ALTER TABLE public.forms DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE public.forms ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor'));
```

No new tables. No new columns. No new indexes.

### Attendee rows per exhibitor submission

For a single exhibitor registration:

| Row | form_id | is_primary | primary_attendee_id | guest_type | payment_status |
|-----|---------|------------|---------------------|-----------|----------------|
| Org contact | `<exhibitor form>` | `true` | null | null | `'paid'` |
| Staff 1 | `<GANSID registration form>` | `false` | `<org.id>` | `'exhibitor-staff-pending'` | `'paid'` |
| Staff N | `<GANSID registration form>` | `false` | `<org.id>` | `'exhibitor-staff-pending'` | `'paid'` |

- Org's `name` field: `{OrgName} — Contact`
- Org's `email`: org contact email
- Org's `company_info` JSONB: `{ orgName, tier, additionalSqm, contactName, contactEmail, contactPhone }` (reuses existing nullable column)
- Staff `name`, `email`: from the org contact's staff roster input (pre-filled, editable during claim)
- Cross-form `primary_attendee_id` is valid — `attendees.primary_attendee_id` is a TEXT FK to `attendees.id` with no `form_id` constraint
- `payment_amount` on all exhibitor rows: `'PAID EXTERNALLY'`
- `payment_method`: null (no PayPal, no cheque)
- No `transaction_id` (nothing processed through PayPal)

### Guest type values

The `Attendee.guestType` union (extended in sub-project 2) grows to include two new values:

```typescript
guestType?: 'adult' | 'child' | 'pending-claim' | 'claimed'
         | 'exhibitor-staff-pending' | 'exhibitor-staff-claimed';
```

No DB migration needed — `guest_type` is a free-text TEXT column at the DB level.

## Public exhibitor form component

### Location

- `components/Exhibitor/PublicExhibitorForm.tsx` — the main component, rendered by `PublicRegistration.tsx` when `form.formType === 'exhibitor'`
- `components/Exhibitor/ExhibitorStaffRow.tsx` — per-staff-member row (Name + Email inputs + remove button)
- `config/formTemplates/buildGansidExhibitor.ts` — template builder + tier config constant

### Rendered structure

1. **Header** — form title, description, GANSID branding (auto-applies via the existing per-site branding config)

2. **Organization info block** (all required except phone):
   - Organization Name (text)
   - Contact Person Name (text)
   - Contact Email (email)
   - Contact Phone (phone, optional)

3. **Tier selection** — 4 radio cards (Platinum / Gold / Silver / Bronze) showing name, booth size, and quota summary. Card click selects. Required to proceed.

4. **Additional m² (informational)** — one checkbox "Do you want additional booth space? (paid separately)" + a conditional number input shown when checked.

5. **Staff roster section** — renders AFTER a tier is selected. Two subsections:
   - **Exhibit Hall Only staff** — shows "{N} of {hallOnlyQuota} slots used" counter, list of staff rows, `+ Add staff member` button (disabled when quota reached)
   - **Full Congress staff** — same pattern with `fullCongressQuota`
   - Each staff row: Name + Email + remove (×) button. Rows can be removed and re-added before submit.
   - At least one staff member total (across both categories) is required to submit.

6. **Consent block** — three checkboxes, two wrapped in the `ConsentCheckbox` component:
   - Terms & Conditions (modal loads `/branding/gansid/docs/gc26-terms-conditions.md`)
   - Disclaimer & Liability (modal loads `/branding/gansid/docs/gc26-disclaimer.md`)
   - Photo/video acknowledgment (plain boolean)

7. **Submit** — disabled until: org info complete, tier picked, ≥1 staff member, all 3 consents checked.

### Tier constants (hardcoded)

```typescript
// config/formTemplates/buildGansidExhibitor.ts
export const EXHIBITOR_TIERS: ReadonlyArray<{
  id: string;
  name: string;
  hallOnlyQuota: number;
  fullCongressQuota: number;
  boothSize: string;
}> = [
  { id: 'platinum', name: 'Platinum', hallOnlyQuota: 12, fullCongressQuota: 6, boothSize: '18 m²' },
  { id: 'gold',     name: 'Gold',     hallOnlyQuota: 8,  fullCongressQuota: 4, boothSize: '9 m²' },
  { id: 'silver',   name: 'Silver',   hallOnlyQuota: 6,  fullCongressQuota: 3, boothSize: '9 m²' },
  { id: 'bronze',   name: 'Bronze',   hallOnlyQuota: 4,  fullCongressQuota: 2, boothSize: '—' },
];
```

Single source of truth, consumed by both the public form (tier cards, quota caps) and the admin dashboard (label lookups, quota display).

### Submit behavior

Client-side:
1. Build payload:
   ```typescript
   {
     mode: 'paid',
     formId: form.id,
     attendees: [
       // 1 primary org row
       {
         name: `${orgName} — Contact`,
         email: contactEmail,
         ticket_type: 'Exhibitor',
         is_primary: true,
         company_info: { orgName, tier, additionalSqm, contactName, contactEmail, contactPhone },
       },
       // N staff rows
       ...staff.map(s => ({
         name: s.name,
         email: s.email,
         ticket_type: 'Exhibitor Staff',
         is_primary: false,
         guest_type: 'exhibitor-staff-pending',
         exhibitor_staff_category: s.category,  // stored in answers JSONB
       })),
     ],
     exhibitorSubmission: true,
     staffFormId: form.settings.staffFormId,
   }
   ```
2. POST to `verify-payment` edge function — a new branch handles `exhibitorSubmission: true` (no PayPal, just inserts all rows with `payment_status='paid'`).

Server-side (new branch in `verify-payment`):
1. Validates `form.formType === 'exhibitor'`
2. Inserts the org row first, gets its generated ID
3. Inserts N staff rows with `primary_attendee_id = org.id` and `form_id = staffFormId` (the GANSID registration form's ID, taken from the exhibitor form's settings)
4. Fires per-staff invitation emails (new `send-ticket-email` mode `exhibitor-staff-invite` — see below)
5. Returns `{ ok: true, orgId, staffIds: [...] }`

## ConsentCheckbox component (shared)

### Location

`components/Consent/ConsentCheckbox.tsx` — a standalone reusable component.

### Behavior

- Renders a checkbox + clickable label. The label includes an underlined/linked text span that opens a modal when clicked.
- Modal shows the document title and fetches the linked markdown file at open time via `fetch(url).then(r => r.text())`. Renders the text in a pre-formatted `<pre>` or simple `<div>` with `whiteSpace: 'pre-wrap'` to preserve line breaks. No markdown parsing — plain text.
- Modal closes via the × button, the "Close" button at the bottom, clicking the backdrop, or pressing Escape.
- Internal state tracks `hasSeenModal: boolean`. The checkbox `<input disabled>` is true until `hasSeenModal === true`.
- Once unlocked, checkbox toggles normally; `onChange(checked)` propagates to the parent.

### Props

```typescript
interface ConsentCheckboxProps {
  id: string;
  label: string;               // e.g. "I have read and agree to the Terms & Conditions"
  linkText: string;            // e.g. "Terms & Conditions" — the portion of the label that opens the modal
  modalTitle: string;
  modalUrl: string;            // e.g. "/branding/gansid/docs/gc26-terms-conditions.md"
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}
```

### Static assets

The two markdown files already at repo root move to `public/branding/gansid/docs/`:
- `gc26-terms-conditions.md`
- `gc26-disclaimer.md`

Served by Vite as static assets at `/branding/gansid/docs/<file>.md`. Admin can edit and redeploy static assets only (no code change needed) if wording updates.

### Where it's used

- **New exhibitor form** — Terms & Conditions + Disclaimer & Liability consents via `ConsentCheckbox`; Photo/video acknowledgment as plain boolean.
- **Existing GANSID Congress registration form** — re-seed updates the three existing consent fields. The `f_consent_terms` and `f_consent_liability` fields upgrade to use `ConsentCheckbox` via a new field property `consentModal?: { title: string; url: string }`. The old `f_consent_conduct` field is **removed** (user confirmed T&C covers it). `f_consent_photo` stays as plain boolean.

### Detection in form rendering

When `PublicRegistration.tsx` renders a field of type `boolean`:
- If `field.consentModal` is present → render via `ConsentCheckbox` with the modal config
- Otherwise → render as the existing plain boolean checkbox

This is additive to the existing boolean render path; no breaking change to SCAGO's boolean fields.

## Staff claim flow (extends pending-claim)

Existing pending-claim flow (sub-project 2) handles `guest_type='pending-claim'` guests:
- Loads the ref attendee
- Renders the form with pricing UI + mode selector hidden; country read-only
- Submit updates the row in-place, flips `guest_type` to `'claimed'`, fires a personal confirmation email

Extended for exhibitor staff — when `guest_type === 'exhibitor-staff-pending'`, the existing pending-claim rendering applies PLUS two additional field-id hides:

- `f_present` — "Will you be presenting" question
- `f_emerg_name`, `f_emerg_phone`, `f_emerg_rel` — emergency contact fields

The country field is NOT locked (exhibitor staff don't pay, so pricing tier isn't relevant — they're free to correct their country if needed). But all other pending-claim rules apply (RMS hidden, ticket field hidden, no PayPal).

The submit handler branches on `guest_type`:
- `'pending-claim'` → set `'claimed'`, fire `guest-claim-completed` email
- `'exhibitor-staff-pending'` → set `'exhibitor-staff-claimed'`, fire new `exhibitor-staff-claim-completed` email (similar copy — ticket to staff + notification to exhibitor org contact)

## Email extensions

`send-ticket-email` gains two new modes:

- **`exhibitor-staff-invite`** — fired by `verify-payment`'s new exhibitor branch after inserting rows. Short email to each staff member: "Your organization {orgName} has registered you for the GANSID Congress 2026. Please click to complete your personal details." Includes the claim link.
- **`exhibitor-staff-claim-completed`** — fired when staff complete their claim. Sends the staff's ticket PDF to them directly, plus a brief notification to the exhibitor org contact: "{staffName} has completed their registration".

Both modes follow the pattern established in sub-project 2 (`group-invite`, `guest-claim-completed`). Fire-and-forget with error logging, no blocking on email failures.

## Admin dashboard — Exhibitors tab

New tab added to `AttendeeList.tsx` alongside Live / Test / Donated / Tables / Sponsor-Tickets.

### Visibility

The tab appears only when there's at least one form with `form_type='exhibitor'` in the current Supabase project. On SCAGO, no exhibitor form exists → tab hidden. On GANSID, the seeded exhibitor form exists → tab visible.

### Data query

Fetches attendees where `is_primary = true` AND the joined form has `form_type='exhibitor'`. For each org row, fetches linked staff via `primary_attendee_id = org.id`. Reuses existing `getAttendees()` — filter client-side once data is loaded.

### UI

Table of exhibitor org rows. Columns: **Organization · Tier · Contact Email · Staff Progress · Created**.

Each row is expandable (chevron on the left). When expanded, two nested subsections render:

```
▼ Acme Biotech                  Platinum    alice@acme.com    4/12 + 2/6   Oct 14
    Hall Only staff (4 of 12)
      ✅ Alice Chen                Completed        [Actions: edit ticket]
      ⏳ Bob Singh                 Pending          [Copy link] [Resend] [Mark complete]
      ⏳ Carol Okoye               Pending          [Copy link] [Resend] [Mark complete]
      ⏳ Dan Patel                 Pending          [Copy link] [Resend] [Mark complete]
    Full Congress staff (2 of 6)
      ✅ Ella Kim                  Completed        [Actions]
      ⏳ Frank Liu                 Pending
```

Per-staff actions mirror the group-flow pattern:
- **Copy link** — puts `{origin}/#/form/{staffFormId}?ref={staff.id}` on the clipboard
- **Resend invitation** — calls `send-ticket-email` with `mode: 'exhibitor-staff-invite'`
- **Mark completed** — admin override; updates `guest_type` to `'exhibitor-staff-claimed'` and refreshes

No new detail modal — the existing AttendeeDetailModal (or whatever the current table uses) opens when the org row is clicked (org card) or when a staff row is clicked (staff card).

## Seeded GANSID exhibitor form + consent upgrade

Two seed SQL steps run against the GANSID Supabase project only:

### Seed 1: Insert the exhibitor form

```sql
INSERT INTO public.forms (id, title, description, status, settings, fields, form_type)
VALUES (
  'gansid-congress-2026-exhibitors',
  'GANSID Congress 2026 Exhibitor Registration',
  'Exhibitor registration for organizations. Payment is handled externally; this form captures organization details, tier, and staff roster.',
  'draft',
  jsonb_build_object('staffFormId', 'gansid-congress-2026'),
  '[]'::jsonb,
  'exhibitor'
);
```

Admin flips status to 'active' when ready to publish.

### Seed 2: Upgrade consent fields on the existing registration form

```sql
-- Fetch current fields, remove f_consent_conduct, and upgrade f_consent_terms + f_consent_liability
UPDATE public.forms
SET fields = <new-fields-array>
WHERE id = 'gansid-congress-2026';
```

The new fields array drops `f_consent_conduct` entirely and extends the two remaining consent-with-document fields with a `consentModal` property:

```json
{"id":"f_consent_terms","type":"boolean","label":"I have read and agree to the","linkText":"Terms & Conditions","consentModal":{"title":"GANSID Congress 2026 — Terms & Conditions","url":"/branding/gansid/docs/gc26-terms-conditions.md"},"required":true}
```

Parallel change on `f_consent_liability` using the disclaimer markdown.

`f_consent_photo` stays as a plain boolean (no modal).

## Migration plan

1. **Schema migration** — extend `forms.form_type` check constraint to include `'exhibitor'`. Applied to both SCAGO and GANSID Supabase projects per the multi-site rule. SCAGO has no exhibitor forms so the constraint change is a no-op on SCAGO data.
2. **Code ships on `feat/exhibitor-form` branch** (or similar name). Merged to main after approval.
3. **Post-merge seed** (GANSID only): the two seed steps above.
4. **Static assets** — markdown files moved from repo root to `public/branding/gansid/docs/`. Committed as part of the code change.

## Backward compatibility

- SCAGO has no `exhibitor`-type forms → no tab renders, no code path triggers
- The `boolean` field type's rendering only detects `consentModal` as an optional prop → SCAGO's existing boolean fields render unchanged
- `verify-payment`'s new exhibitor branch is gated on `exhibitorSubmission: true` in the request body — SCAGO clients never send this
- `send-ticket-email`'s new modes are explicit strings; default flow unchanged
- No attendee-table schema changes → no migration risk to existing SCAGO attendee data

## Out of scope (deferred)

- Exhibitor-initiated refunds or cancellations
- Form-builder UI for the exhibitor form (component-driven, not field-driven)
- Editing a submitted exhibitor's staff roster from the form (use admin dashboard)
- Exhibitor tier changes post-submit
- Exhibitor-side ticket PDFs (org gets no individual ticket; staff get tickets on claim)
- Additional m² payment handling or invoicing
- Different trimmed field sets for Hall-Only vs Full Congress staff
- `<GansidOnly>` / `<ScagoOnly>` wrapper components (still on backlog)
- Admin-editable exhibitor tier config in Settings
- Markdown parser / formatting in the consent modal
- Migration of existing SCAGO sponsor logic to this new pattern (sponsor stays as-is)

## Definition of done

- Schema migration applied to both Supabase projects; `forms.form_type` accepts `'exhibitor'`
- `PublicExhibitorForm.tsx` renders org info + tier + staff roster + consent + submit; tier selection hard-caps staff quotas per `EXHIBITOR_TIERS`
- `ConsentCheckbox.tsx` works on both forms; two MD documents load at runtime; checkbox unlocks after first modal view
- `buildGansidExhibitor.ts` template + seeded form row on GANSID with `form_type='exhibitor'`, draft status
- Existing GANSID registration form upgraded: `f_consent_conduct` removed; `f_consent_terms` + `f_consent_liability` use `ConsentCheckbox`
- Staff invitation emails sent on submit; claim flow shows trimmed fields for `exhibitor-staff-pending`; submit flips to `exhibitor-staff-claimed` + fires completion email
- Admin AttendeeList has new "Exhibitors" tab visible only when exhibitor forms exist; org rows expandable with staff roster + pending/completed badges + per-staff actions
- Tests + tsc + both builds all green
- SCAGO regression: no behavioral changes on sponsor or event forms; new "Exhibitors" tab hidden when no exhibitor forms exist
- Phase 2 closed out
