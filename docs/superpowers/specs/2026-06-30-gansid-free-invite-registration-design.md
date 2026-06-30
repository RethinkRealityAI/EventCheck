# GANSID Free-Invite Registration + Contacts Admin Polish — Design

**Date:** 2026-06-30
**Status:** Design approved; pre-plan.
**Tenant scope:** GANSID (`gticuvgclbvhwvpzkuez`). The new form is GANSID data only; the branding change affects the GANSID email shell (client + edge). **SCAGO is untouched.**

---

## 1. Problem

The bulk-contact **"invite to register"** pathway currently points invited (free) contacts at the full **GANSID Congress 2026 Registration** form — a multi-step, payment / pricing / BOGO / promo, speaker-aware form where most fields are required. For a free invited registrant this is wrong: too many steps, too much asked, payment artifacts present. Account creation is also wedged **inline in the form (pre-submit)** instead of offered after the ticket is delivered.

Adjacent gaps surfaced in the same review:
- The admin **Contacts tab** has no single "add one contact" action (only bulk CSV).
- **`AddAttendeeModal`** (add-registrant) has integrity/validation gaps: no rowcount check after upsert, no email re-validation, no duplicate detection, no required-field enforcement.
- The **invite modal** (`BulkImportModal`) preview pane is unusable/unscrollable on small screens.
- The GANSID email brand reads **"GANSID '26"** with a mostly-red gradient; the client palette and the edge-function palette are **duplicated** and both must change.

## 2. Goals

1. A dedicated, stripped-down, **single-page free** registration form for the invite path.
2. **Default** the invite picker to it; **lock** prefilled identity fields.
3. **Ticket-first** success, with optional **pre-verified** account creation moved to the success screen.
4. Manual single **"add contact"** in the Contacts tab.
5. **Tighten** `AddAttendeeModal` (and the new add-contact modal) — close the logic gaps.
6. Make the invite modal **responsive** on small screens.
7. Rebrand the GANSID email to **"GANSID Congress 2026"** with a **bluer gradient**.

## 3. Non-goals

No SCAGO changes. No change to the paid congress registration flow itself. No Flutterwave work. No change to the bulk-CSV import pipeline beyond adding single-add. No new DB columns / schema migrations.

---

## 4. Design

### 4.1 New simplified form (data artifact) — `gansid-congress-2026-invite`

A new `forms` row, **cloned from `gansid-congress-2026`**, title **"GANSID Congress 2026 — Free Registration"**, `form_type='event'`, `status='active'`.

**Field transformation** (the congress form has 21 fields; ref §field-map below):
- **Drop** 3 fields: `f_mode` (registration-mode-selector), `f_present` (speaker/"presenting"), `f_ticket` (ticket → payment/pricing/BOGO/promo).
- **Clone the remaining 18 verbatim** (preserve `options`, `placeholder`, `consentModal`, `linkText`), then set `required: false` on **all except** the three consents: `f_consent_photo`, `f_consent_terms`, `f_consent_liability` (stay `required: true`).
  - `f_consent_promo` (promo-email opt-in) stays optional.
  - Prefilled-and-locked at render time: `f_fname`, `f_lname`, `f_email` (see §4.2; locking is a render concern, not a field flag).
- **`settings`**: `{ renderMode: 'single', successTitle, submitButtonText: 'Complete my free registration' }`. **Omit** `pricingTemplateId`, `promoCodes`, `bogoEnabled`, `groupPath`, `steps`, `currency`.

**Why this works (verified):** `renderMode: 'single'` → `SingleFormShell` → one-page render (no steps); an event form with no ticket field + no pricing computes `postPromoCheckoutCents = 0` → no payment step, "Register Now"-style submit, free insert. Consent doc links keep working via `consentModal.url` (ConsentCheckbox fetches + enforces read-before-accept).

**Creation mechanism:** an **idempotent seed SQL** (`UPSERT` on `forms.id`), applied to **GANSID via CLI `db query -f`** (data, not a schema migration — does not go through the migration linter/parity tooling). The exact field JSON is cloned from the live `gansid-congress-2026` row at build time so labels/options/consent URLs stay identical.

### 4.2 Invite-path wiring

- **Default picker:** `BulkImportModal`'s "Register for" `<select>` defaults its value to `gansid-congress-2026-invite` when that form exists; other forms remain selectable.
- **Locked prefill:** `FormRenderer`'s text/email `<input>` renders `readOnly` + `disabled` (with a muted style + a small "from your invitation" hint) when `inviteMode === true` **and** the field is a prefilled identity field (`f_fname` / `f_lname` / `f_email`, detected by id-suffix/type as the prefill code already does). `inviteMode` + the locked-id set are threaded from `PublicRegistration` → shells → `FormRenderer`.

### 4.3 Ticket-first → optional account (post-registration)

- Success screen stays **ticket-first** (QR card + Download PDF — already the case).
- **Move** the account opt-in (`claimSignupOptIn` + `claimSignupPassword`) **off the pre-submit form** (`PublicRegistration` ~L2391–2420) and **onto the success screen** as a distinct optional card:
  > **Do you want to create a GANSID Congress account** so you can easily access your tickets and more information about the Congress?
  > → *Choose a password* → **[Create account]**
- **Defer the call:** invoke `contact-invite-account` **from the success-screen card** (on password submit), not inside `finalizeInviteRegistration`. On success: card flips to "Account created — you're signed in" + a **"View my tickets"** link to `/portal/tickets`. Pre-verified (`email_confirm: true`) → no Supabase confirmation email → reliable.
- The P4 `registration-confirmed` email keeps delivering the ticket/download link; appending a backup "create your account" line is optional polish (low priority).

### 4.4 Manual "add contact" (Contacts tab)

- New **"Add contact"** button in `ImportedContactsTab` toolbar → opens a new **`AddContactModal`** (portaled to `document.body`).
- Inputs: **Name** (required), **Email** (required + format-validated), **Tags** (optional, reuse the tag chips/typeahead). Minimal by design.
- New service **`createImportedContact({ name, email, tags })`** in `importedContactsService.ts`: inserts one row (`email` lowercased; `tags` default `[]`; `email_status='pending'`), **rowcount-checked** (`.select('id')`, assert length). **Dedup by `lower(email)`**: if a contact already exists, do not duplicate — surface "already in contacts" and offer to merge the new tags (`addTagsToContacts`).

### 4.5 Tighten `AddAttendeeModal` (+ `AddContactModal`)

Close the gaps the review found, without an unrelated rewrite:
- **Rowcount check:** `saveAttendee` (storageService) gains `.select('id')` after `.upsert(...)` and asserts ≥1 row affected (project rule #4); the modal surfaces a real error if 0.
- **Email validation:** validate the resolved email format before submit.
- **Duplicate detection:** if a non-test attendee with the same email + form already exists, show a non-blocking "looks like a duplicate — add anyway?" confirm.
- **Required-field enforcement:** enforce the form's `required` fields client-side before submit (currently unenforced).
- **a11y:** fieldset/legend grouping, `aria-disabled` on disabled toggles, focus trap/initial focus.
- Keep the component focused; extract small helpers (e.g. a shared `validateRequiredAnswers` + email check) reused by both modals.

### 4.6 Responsive invite modal (`BulkImportModal`)

- Below `lg`, replace the squeezed two-column stack with a **segmented `Compose | Preview` toggle** so each view gets the full modal width/height; `lg+` keeps the side-by-side `grid-cols-5`.
- **Fix the preview:** remove the iframe `scrolling="no"`; the preview container becomes `overflow-y-auto` with a usable height when stacked, so the email is fully visible and scrollable. Ensure the modal body scrolls and the sticky footer (Send) stays reachable on short viewports.

### 4.7 Branding (GANSID email)

- `utils/emailShell.ts` `EMAIL_PALETTES.gansid`: `footerBrandLabel` **"GANSID '26" → "GANSID Congress 2026"** (header title + footer brand both read this). Subtitle unchanged.
- **Bluer gradient:** bring the navy stop earlier / give it more real estate, e.g. `headerGradient`/`footerGradient` → `linear-gradient(135deg, #ba0028 0%, #E0243C 38%, #2260a1 100%)` (exact shade tunable in preview).
- Mirror the **same** `brandLabel` + gradient in the **`send-ticket-email` edge-function palette** (its duplicated copy), then **redeploy `send-ticket-email`** (CLI `--use-api`). The gansid palette is gated on `isGansid`, so SCAGO output is unchanged; redeploy to both for parity per the deploy rule.

---

## 5. Field map (reference)

Kept-optional: `f_title`, `f_whatsapp`, `f_org`, `f_city`, `f_country`, `f_days`, `f_diet`, `f_access`, `f_emerg_name`, `f_emerg_phone`, `f_emerg_rel`, `f_consent_promo`. Kept-prefilled-locked: `f_fname`, `f_lname`, `f_email`. Kept-required (consents): `f_consent_photo`, `f_consent_terms`, `f_consent_liability`. Dropped: `f_mode`, `f_present`, `f_ticket`.

## 6. Data / schema

No schema migrations, no new columns. One new `forms` data row (idempotent seed) on GANSID.

## 7. Edge functions

`send-ticket-email`: branding palette only (no contract change); redeploy. No other edge changes.

## 8. Testing

- **Unit (rule #14):** `createImportedContact` (dedup + rowcount), the shared `validateRequiredAnswers`/email-format helper. `npm test` green.
- **Type/build:** `npx tsc --noEmit` + `npm run build` clean.
- **Manual end-to-end in the preview (admin is logged in):** seed form → invite modal defaults to it → send a real invite (admin session) → open the invite link → one-page, prefilled + locked, everything optional but the 3 consents → submit → ticket-first success → optional account card → create account → signed in → `/portal/tickets`. Add-contact modal: add + dedup. Responsive: drive the invite modal at narrow width and confirm preview is visible/scrollable. Branding: preview shows "GANSID Congress 2026" + bluer gradient.

## 9. Rollout

1. Seed form → GANSID (CLI `db query -f`).
2. Frontend → `main` → Netlify (both sites build; the form is GANSID data, the gansid palette change only affects gansid rendering).
3. Redeploy `send-ticket-email` to both projects (CLI `--use-api`) for the edge palette parity.

## 10. Open questions / risks (minor)

- Exact "more blue" shade — propose the value above, fine-tune in preview.
- Direct (non-invite) hits on the free form create an un-linked free registration — acceptable (invite-gated in practice); a guard can be added later if needed.
- New form `status` = `active` (invite link renders it; `draft` would also work but `active` is cleaner).
