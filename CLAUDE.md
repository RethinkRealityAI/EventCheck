# EventCheck — QR Event Management

## Project Overview

Event registration and ticketing platform with QR code check-in. Built for events like galas where organizers sell tables/seats, manage guest registrations, and check in attendees via QR scan. Also supports **sponsor management** — outreach, tiered sponsorship packages, scholarship/ad/booth add-ons, PayPal or cheque payment, itemized receipts, and a dedicated admin dashboard.

Deployed on **Netlify** (frontend) with **Supabase** (database, auth, edge functions).

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres, Edge Functions in Deno)
- **Payments:** PayPal (sandbox + production)
- **PDF:** jsPDF for ticket and receipt generation
- **Email:** SMTP via Supabase edge function (`send-ticket-email`)
- **Hosting:** Netlify (frontend), Supabase (backend)
- **Tests:** Vitest (unit tests for pure logic — no UI/integration tests)

## Project Structure

```
components/
  PublicRegistration.tsx   — Public-facing registration form (event purchaser + guest modes)
                             + dispatches to PublicSponsorForm when form.formType === 'sponsor'
                             + dispatches to PublicExhibitorForm when form.formType === 'exhibitor'
  FormPreview.tsx          — Admin preview of registration form
  FormBuilder/             — Drag-and-drop form builder for admins
  Settings.tsx             — Global app settings (SMTP, event email templates, PDF, PayPal)
  AttendeeList.tsx         — Dashboard attendee table (tabs: Live / Test / Donated / Tables /
                             Sponsor Tickets / Exhibitors)
  Scanner.tsx              — QR code scanner for event check-in
  FormsManager.tsx         — Form CRUD; "Create Form" button opens TemplatePickerModal with
                             site-filtered template cards (Blank, Sponsor, GANSID-specific)
  Exhibitor/               — Exhibitor registration section
    PublicExhibitorForm.tsx — Component-driven exhibitor form (org info, tier, staff roster)
    ExhibitorStaffRow.tsx   — Per-staff name + email row
    ExhibitorsTab.tsx       — Admin dashboard Exhibitors tab
  Group/                   — Group registration UX components
    GroupPersonRow.tsx      — Per-person row with live pricing
    GroupShortcutsToggle.tsx— "Same country" / "Same category" batch toggles
  Pricing/                 — Dynamic pricing UI components
    PricingBracketBanner.tsx— "Early Bird — ends Jun 30" subtle banner
    LivePriceCategory.tsx  — Category dropdown with live per-person prices
    AddonsList.tsx         — Optional add-on checkboxes (e.g. Networking Reception)
    RunningTotal.tsx       — Sticky running total widget
  Consent/                 — Consent checkbox with modal-gated document viewing
    ConsentCheckbox.tsx    — Clickable label → modal → unlock checkbox pattern
  Portal/                  — GANSID user portal (rendered only when portalEnabled=true)
    Landing/               — Landing page: AuthPanel, InfoTabs, content constants
    Dashboard/             — PortalDashboard, WelcomeBlock, CredentialCard,
                             CredentialBadgeModal, AvailableFormsGrid,
                             AnnouncementsFeed, QuickLinks
    Profile/
      ProfilePage.tsx      — Authenticated profile edit page
    ResetPassword/
      ResetPasswordPage.tsx— Password-reset landing (arrives via Supabase email link)
    PortalLayout.tsx       — Root layout wrapper (<div className="portal-root">)
    ui/                    — Hand-rolled glass primitives: GlassCard, ViscousButton,
                             GlassInput, GlassSelect, GlassDialog, FloatingToggleTabs,
                             OrganicAccordion, StepperSidebar
  SteppedRegistration/     — Multi-step form infrastructure
    FormRenderer.tsx       — Extracted field-rendering + submit logic (was inline in
                             PublicRegistration). Accepts filteredFields param.
    SingleFormShell.tsx    — Thin wrapper: renders FormRenderer with all fields at once
    SteppedFormShell.tsx   — Renders FormRenderer one step at a time + sidebar stepper
    steppedValidation.ts   — Pure helpers: validateRequired, validateRms,
                             validateGroupMembers, groupFieldsBySection
  Settings/
    AnnouncementsTab.tsx   — Announcements list/create/edit/delete/activate + image upload
  FormBuilder/
    StepsManager.tsx       — Toggle renderMode, CRUD steps in form settings panel
  Sponsors/                — Sponsor management section
    SponsorsDashboard.tsx  — Admin dashboard shell with stats + 7-tab routing
    SponsorsTable.tsx      — Submission list with status/method filters
    SponsorDetailModal.tsx — Per-sponsor detail view (items, tickets, notes, receipt download)
    ChequeReceivedModal.tsx— Admin flow to flip pending cheque → paid + issue tickets
    ProspectsTab.tsx       — Outreach list with bulk invite
    AddProspectModal.tsx   — Create/edit prospect
    SendInvitationModal.tsx— Bulk-send invitations with live template preview
    SponsorTemplatesTab.tsx— Inline editor for all 5 sponsor email templates + HST + mailing addr
    PublicSponsorForm.tsx  — Public sponsor form with tier/scholarship/ad/booth selection
    createSponsorForm.ts   — Seed helper: generates a sponsor-typed Form with all 14 items
services/
  storageService.ts        — Supabase CRUD (forms, attendees, settings, sponsor prospects,
                             getSponsorAttendees, attendee mappers including sponsor fields)
  supabaseClient.ts        — Supabase client initialization
  smtpService.ts           — Email sending via edge function
  profileService.ts        — Profile fetch/update mappers (portal)
  announcementService.ts   — Announcement CRUD + image upload to portal-assets (portal)
  database.types.ts        — Generated/maintained DB types (includes sponsor_prospects, sponsor
                             columns on attendees + app_settings, form_type on forms)
utils/
  pdfGenerator.ts          — jsPDF ticket PDF generation
  receiptGenerator.ts      — jsPDF itemized sponsor receipt (paid/pending, HST line)
  sponsorEmailTemplates.ts — Template merge helpers (mergeTemplate, buildSponsorEmailContext,
                             buildProspectEmailContext, renderItemsListHtml, escapeHtml)
  pricing.ts               — Pure pricing resolution: resolveBracket, resolveTier, computeTotal,
                             formatPrice. Covered by tests/pricing.test.ts
  countries.ts             — ISO 3166-1 alpha-2 list (195 entries) + lookup helpers
  groupPricing.ts          — computeGroupTotal: sums per-person pricing for group registrations
config/
  sites.ts                 — Per-site branding config keyed off VITE_SITE (scago / gansid)
  formTemplates.ts         — Form template registry + availableTemplatesForSite()
  formTemplates/            — Template builder functions (buildBlank, buildSponsorForm,
                              buildGansidIndividualGroup, buildGansidExhibitor)
supabase/functions/
  verify-payment/          — Server-side PayPal verification + attendee persistence. Handles
                             FOUR flows: sponsor (sponsorMeta), exhibitor (exhibitorSubmission),
                             group dynamic pricing (groupPricingSelections), and single-person
                             dynamic pricing (pricingSelection). Each branch gates on a
                             distinct request body flag and short-circuits independently.
  confirm-sponsor-cheque/  — Admin-only (JWT-guarded) endpoint that flips a pending cheque
                             sponsor to paid and creates guest ticket placeholders
  send-ticket-email/       — SMTP email delivery with multiple modes: default (ticket PDF),
                             group-invite, guest-claim-completed, exhibitor-staff-invite,
                             exhibitor-staff-claim-completed. Attachment callout conditional
                             on whether attachments are actually included.
supabase/migrations/
  20260414_add_sponsor_tables.sql — Sponsor schema
  20260416000000_add_pricing_templates.sql — Pricing templates table + attendee pricing columns
  20260416120000_extend_form_type_with_exhibitor.sql — form_type CHECK includes 'exhibitor'
  20260418000000_add_user_portal_schema.sql — profiles table, is_portal_admin(), handle_new_user
                             trigger, attendees.user_id, forms.show_in_portal, announcements
                             table, portal-assets bucket RLS, bootstrap admin backfill
tests/
  sponsorEmailTemplates.test.ts — Template merge + HTML escape + context builders (19 tests)
  createSponsorForm.test.ts     — Sponsor form seed shape + pricing (9 tests)
  sponsorPricing.test.ts        — HST-on-booth-only logic (5 tests)
  sites.test.ts                 — Site config resolution (3 tests)
  countries.test.ts             — Country list + lookups (5 tests)
  pricing.test.ts               — resolveBracket / resolveTier / computeTotal / formatPrice (12 tests)
  groupPricing.test.ts          — computeGroupTotal mixed-group pricing (3 tests)
  formTemplates.test.ts         — Template registry + field shape validation (8 tests)
  exhibitorTiers.test.ts        — Tier config + quota validation (5 tests)
  storageMappers.test.ts        — Mapper source-grep guards: no hardcoded ternaries (6 tests)
  profileService.test.ts        — Profile row ↔ UI mapper correctness (2 tests)
  announcementService.test.ts   — Announcement filter logic (2 tests)
  rmsValidation.test.ts         — validateGroupMembers + groupFieldsBySection + RMS validation
                                   helpers (17 tests)
  siteConfig.test.ts            — portalEnabled flag + site-conditional routing (2 tests)
types.ts                   — All TypeScript interfaces (Attendee, Form, AppSettings,
                             PricingTemplate, SponsorProspect, FormField, etc.)
```

## Key Flows

### Ticket Purchase (Purchaser Mode) — event flow
1. User fills form fields + selects tickets in `PublicRegistration.tsx`
2. PayPal payment captured client-side, order ID sent to `verify-payment` edge function
3. Edge function verifies payment with PayPal API, validates amount, saves all attendees
4. Success page shows purchaser ticket + guest ticket grid (if multi-seat)
5. Emails sent: purchaser gets all PDFs, named guests get individual emails

### Guest Registration (Guest Mode)
1. Guest opens `?ref=<attendeeId>` link from a ticket or the success page
2. `PublicRegistration.tsx` detects `ref` param, enters guest mode
3. Ticket selection is hidden — guest only sees the form's standard fields
4. Guest name/email come from the form fields (Full Name, Email Address)
5. On submit, guest's placeholder record is updated in-place (preserves QR payload)
6. Guest bypasses payment entirely — the `mode === 'purchaser'` guard prevents it

**Important:** This same flow is reused for **sponsor tier** guests (signature/gold/silver
sponsors who receive 16 or 8 seats). Each seat is a guest placeholder row with
`primary_attendee_id` linking back to the sponsor. When the sponsor forwards the registration
link, the guest fills it in exactly like an event guest — no new code path.

### Sponsor Submission (Sponsor Mode — NEW)

Triggered when a form has `formType === 'sponsor'`. `PublicRegistration.tsx` detects this
and delegates to `PublicSponsorForm.tsx`.

**PayPal path:**
1. Sponsor fills company info, picks a tier (optional), picks scholarships/ads/booths (optional)
2. For Gold/Silver/Award-of-Excellence tiers → conditional Award Category selector appears
3. Total = subtotal + HST on booth only (HST rate stored in `app_settings.sponsor_hst_rate`)
4. PayPal capture → client POSTs `sponsorMeta` (items, total, companyInfo, sponsoredAwards, tier)
   + `attendees` to `verify-payment`
5. Edge function **recomputes the total server-side** from the form's `ticketConfig` — rejects
   any client-side price manipulation with a 422
6. PayPal capture amount validated against server-computed total
7. Edge function writes the sponsor attendee row with sponsor_tier, sponsor_items, company_info,
   sponsored_awards, payment_method: 'paypal', payment_status: 'paid', and N guest placeholder
   rows (signature=16, gold/silver=8, award/scholarship=0)
8. Client then calls `send-ticket-email` with receipt PDF (paid) + per-seat ticket PDFs attached

**Cheque path:**
1. Same form flow; sponsor picks "Pay by Cheque"
2. Client POSTs `sponsorMeta` + `attendees` + `paymentMethod: 'cheque'` (no paypalOrderId)
3. Edge function validates + server-recomputes total, then writes attendee with
   `payment_status: 'pending'` and `payment_amount` suffixed `(PENDING CHEQUE)`.
   **NO guest placeholder rows are created yet.**
4. Client dispatches two emails:
   - Sponsor receives pledge email + pending-receipt PDF
   - Internal recipients (`gala@sicklecellanemia.ca` + 2 CCs, editable) receive a cheque
     notification email with the same receipt

**Admin marks cheque received:**
1. Admin opens `SponsorDetailModal`, clicks "Mark Cheque Received" → `ChequeReceivedModal` opens
2. Modal pre-fills the cheque-received template (subject + body editable)
3. Admin confirms → client calls `confirm-sponsor-cheque` edge function (JWT-protected)
4. Function flips `payment_status` to `'paid'`, strips the `(PENDING CHEQUE)` suffix, creates
   N guest placeholder rows
5. If guest-row insert fails, function returns 500 with `partial: true` — admin sees the error
   rather than silently sending an empty confirmation email
6. On success, client generates paid-receipt PDF + per-seat ticket PDFs and sends the
   confirmation email

### Sponsor Outreach (Prospects)

1. Admin opens `/admin/sponsors` → Prospects tab
2. Adds prospects (org name, contact, email, sponsor-form-id) — stored in `sponsor_prospects`
3. Selects prospects + clicks "Send Invitation"
4. `SendInvitationModal` merges the `sponsorInvitationSubject`/`Body` template with per-
   prospect placeholders, previews the first recipient, sends one-by-one via SMTP
5. Each send logs via `logProspectEmail` which bumps status from `'prospect'` → `'invited'`

### PayPal Environment Detection (verify-payment edge function)
The edge function auto-detects sandbox vs production:
1. `PAYPAL_MODE` env var overrides everything (`sandbox` or `production`)
2. If all attendees have `is_test: true` → sandbox (FormPreview flow)
3. Otherwise, checks `Origin` header: localhost → sandbox, production domain → production

**Required Supabase secrets for PayPal:**
- `PAYPAL_CLIENT_ID` — production client ID
- `PAYPAL_CLIENT_SECRET` — production secret
- `PAYPAL_SANDBOX_CLIENT_ID` — sandbox client ID
- `PAYPAL_SANDBOX_CLIENT_SECRET` — sandbox secret

### Email System

**Event templates** (Settings > Email Templates tab):
- Ticket Confirmation tab: purchaser email, guest email, purchaser guest backup note
- Invitation / Marketing tab: separate template for marketing emails

**Sponsor templates** (Admin > Sponsors > Templates tab — not in Settings.tsx):
- Sponsor Invitation — for outreach
- Sponsor Confirmation (Paid) — PayPal/card success
- Sponsor Cheque Pledge — when sponsor picks cheque
- Cheque Notification (Internal) — emailed to the 3 gala@ addresses
- Cheque Received Confirmation — editable in the Mark-Cheque-Received modal before sending

All 5 sponsor templates + the internal-recipients list + cheque mailing address + HST rate are
stored in `app_settings` (`sponsor_*` columns) and rendered with `{{placeholder}}` merge via
`utils/sponsorEmailTemplates.ts`.

The shared `send-ticket-email` function now only renders the "attachment included" callout
when attachments are actually present — so prospect invitations (no attachments) don't
misleadingly claim a ticket is attached.

### PDF Generation

- `utils/pdfGenerator.ts` — **ticket** PDFs (unchanged): header, attendee name, ticket type, QR
  code, transaction info. Guest placeholder tickets get a red accent + registration QR. Named
  guest tickets get the primary color bar, no registration QR.
- `utils/receiptGenerator.ts` — **sponsor receipt** PDFs (new, separate): itemized table with
  qty/unit/subtotal columns, HST line when > 0, grand total, payment method block, status
  watermark ("OFFICIAL RECEIPT" vs "PENDING PAYMENT RECEIPT"). Pagination-aware — adds pages
  if items or totals would overflow.

### Success Page (Post-Purchase — event flow)
- **Single ticket:** Shows purchaser ticket card only (QR, download button)
- **Multi-seat:** Shows purchaser card + guest ticket grid with:
  - Mini QR per guest, name, "Registered"/"Unclaimed" badge
  - Individual download buttons with distinct filenames (`Guest_2_Ticket.pdf`)
  - Registration link + copy button for unclaimed guests
  - "Download All Guest Tickets" button (excludes purchaser's ticket)

## Environment Variables

### Netlify (frontend build)
- `VITE_SITE` — `scago` or `gansid` (identifies which deployment; defaults to `scago` if unset)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_PAYPAL_CLIENT_ID` — PayPal client ID (production on Netlify, sandbox locally)
- `VITE_PAYPAL_ENV` — currently unused but set to `live`

### Local (.env.local)
- Same as above but with sandbox PayPal credentials
- `GEMINI_API_KEY` — for AI features (if any)

### Supabase Secrets (edge functions)
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` — production
- `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET` — sandbox
- `PAYPAL_MODE` — optional override (`production` | `sandbox`) that short-circuits the Origin-based auto-detect. GANSID project sets this to `production`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — for send-ticket-email
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — auto-provided to edge functions

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (set `VITE_SITE=gansid` to build the GANSID variant)
- `npm test` — run Vitest unit tests once
- `npx tsc --noEmit` — type check without emitting
- `npm run test:watch` — Vitest in watch mode
- `supabase functions deploy <name> --project-ref <ref>` — deploy edge function (see Multi-site deployment for both refs)
- `supabase secrets set KEY=VALUE --project-ref <ref>` — set edge function secrets

## Multi-site deployment

This repo powers two independent deployments from one `main` branch:

| Site | Netlify site | Supabase project-ref | VITE_SITE |
|------|--------------|----------------------|-----------|
| SCAGO (live) | existing SCAGO site | `iigbgbgakevcgilucvbs` | `scago` |
| GANSID Congress | `gansidcongress.netlify.app` | `gticuvgclbvhwvpzkuez` | `gansid` |

Design: `docs/superpowers/specs/2026-04-15-multi-site-scaffold-design.md`
Plan: `docs/superpowers/plans/2026-04-15-multi-site-scaffold.md`

**Critical rule:** every migration and edge-function deploy must be applied to BOTH project-refs. Example:

```bash
# SCAGO
supabase db push --project-ref iigbgbgakevcgilucvbs
supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs

# GANSID
supabase db push --project-ref gticuvgclbvhwvpzkuez
supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez
```

If a migration is applied to only one project, the shared codebase will break on the other site.

**Edge function gateway auth** (`supabase/config.toml`): `verify_jwt` is explicitly set per function and MUST be respected on every redeploy — Supabase's default is `true`, and deploying without the config (or without `--no-verify-jwt`) silently re-flips `verify-payment` and `send-ticket-email` back to `verify_jwt: true`, which 401s every public registration and admin manual-ticket email. Current config: `send-ticket-email` and `verify-payment` are `false` (called from unauthenticated public forms and do their own internal validation); `confirm-sponsor-cheque` is `true` (admin-only).

Site-level branding is driven at build time by `config/sites.ts` keyed off `VITE_SITE`. Runtime settings (PayPal creds in secrets, email templates / logos / SMTP in `app_settings`) remain per-Supabase.

## Dynamic Pricing Engine

Optional feature, gated on `app_settings.feature_pricing_templates`. Enabled on GANSID; disabled on SCAGO.

- Admin-managed templates live in the `pricing_templates` table. Each row contains tiers (country→tier mapping), date brackets, a category × tier × bracket price matrix, and flat-price add-ons — all JSONB.
- Forms opt in via `form.settings.pricingTemplateId`. When null/absent, the form uses the existing static `TicketItem` flow unchanged.
- Pure pricing resolution logic lives in `utils/pricing.ts`: `resolveBracket`, `resolveTier`, `computeTotal`, `formatPrice`. Covered by `tests/pricing.test.ts`.
- Country list (ISO 3166-1 alpha-2, 195 entries) in `utils/countries.ts`.
- Public registration renders `components/Pricing/{PricingBracketBanner,LivePriceCategory,AddonsList,RunningTotal}.tsx` when a template is attached. Country field renders `components/FormBuilder/fields/CountryField.tsx`.
- `verify-payment` edge function re-computes the expected total server-side from its own clock + registrant's country + template data, then rejects PayPal captures that differ from expected by more than 1 cent.
- Attendee rows carry `pricing_template_id`, `pricing_bracket`, `pricing_tier`, `pricing_category_id` for audit.
- Settings → Pricing Templates tab (visible when feature flag is on) provides a full template editor: Basics, Tiers+country mapping, Date brackets with active-bracket indicator, spreadsheet-style pricing matrix, Add-ons.
- Form builder's Pricing tab lets admins link a form to a template and flag a country field as `usedForPricing`.
- GANSID Congress 2026 template seed lives (non-committed) in `tmp/seed-gansid-pricing-template.sql` — re-run if the GANSID template ever needs rebuilding from scratch.

Spec: `docs/superpowers/specs/2026-04-15-dynamic-pricing-engine-design.md`
Plan: `docs/superpowers/plans/2026-04-16-dynamic-pricing-engine.md`

## Form Templates

File-based registry in `config/formTemplates.ts`. The admin's "Create Form" button in `FormsManager` opens `TemplatePickerModal` showing cards for each available template. Templates can declare `siteFilter: SiteKey[]` to restrict visibility per deployment.

Existing templates:
- **Blank** — empty form (all sites)
- **Sponsor** — re-export of the existing sponsor-form builder (all sites)
- **GANSID Individual + Group Registration** — GANSID-only (`siteFilter: ['gansid']`)
- **GANSID Exhibitor Registration** — GANSID-only (`siteFilter: ['gansid']`)

To add a template: create `config/formTemplates/build<Name>.ts` that returns a partial `Form` shape, then add it to `TEMPLATES`. No UI work needed. If the new template should ONLY appear on a specific site, add `siteFilter: ['<siteKey>']`.

**Critical:** when a template includes a `ticket`-type field, its `ticketConfig` must use
`items: []` (not `tickets: []`) and include `promoCodes: []`. Run `npm test` after creating
any template — `tests/formTemplates.test.ts` validates these shapes.

## User Portal

GANSID-only feature, gated on `CURRENT_SITE.portalEnabled` in `config/sites.ts`. Wraps the
existing registration engine in a user-facing portal with account creation, a stepped
multi-section form UI, a credential QR dashboard, and an admin-managed announcements feed.
SCAGO is unaffected — portal routes are NOT registered when `portalEnabled === false`.

Spec: `docs/superpowers/specs/2026-04-18-gansid-user-portal-design.md`
Plan: `docs/superpowers/plans/2026-04-18-gansid-user-portal.md`

### Routing (site-conditional)

On GANSID (`portalEnabled=true`):
- `/#/` → `<Landing />` — hero + sign-up/sign-in tab card + Congress info tabs
- `/#/portal` → `<PortalDashboard />` (ProtectedRoute; redirects to `/#/` if not signed in)
- `/#/portal/profile` → `<ProfilePage />` (ProtectedRoute)
- `/#/reset-password` → `<ResetPasswordPage />` (public; arrives via Supabase auth email link)
- `/#/admin/*` → unchanged (ProtectedRoute, `requireRole='admin'`)

On SCAGO: unchanged (`/#/` still redirects to `/#/admin`; no portal routes registered).

### Auth + profiles

- **Signup:** email + password + role selection (Attendee / Exhibitor / Sponsor) on the
  landing `<AuthPanel>`; Supabase sends a verification email; `handle_new_user` trigger
  auto-creates a `profiles` row from signup metadata.
- **Signin:** same `<AuthPanel>` (Sign In tab) or `/#/login` (admin fallback). Landing signin
  redirects to `/#/portal`; `/#/login` redirects by role.
- **Admin role:** set manually via SQL (`UPDATE profiles SET role='admin' WHERE email='...'`)
  or bootstrapped in the migration (all pre-portal `auth.users` rows are flagged admin).
- **`AuthContext`** now exposes `{ user, session, profile, loading, signOut, refreshProfile }`.
  On auth state change, the context fetches the profile row and caches it.
- **`ProtectedRoute`** gains an optional `requireRole?: 'admin'` prop. Waits for profile to
  load before evaluating. `/#/admin/*` routes pass `requireRole="admin"`. Existing callers
  pass no prop and behave identically to today.

### Schema additions — migration `20260418000000_add_user_portal_schema.sql`

- `profiles` table keyed on `auth.users.id` — columns: `role` (`attendee | exhibitor |
  sponsor | admin`), `full_name`, `organization`, `country_code`, `phone`, `avatar_url`,
  timestamps. RLS: users read/update own row; admins read all via `is_portal_admin()`.
- `is_portal_admin()` — SECURITY DEFINER function that avoids RLS recursion when admin
  policies query the same `profiles` table they protect.
- `handle_new_user()` trigger on `auth.users INSERT` — inserts a profile row from
  `raw_user_meta_data`; uses `ON CONFLICT DO NOTHING` to be idempotent.
- `attendees.user_id UUID` — nullable FK to `auth.users`. Legacy rows stay NULL; new
  submissions from logged-in users get stamped server-side by `verify-payment`.
- `forms.show_in_portal BOOLEAN NOT NULL DEFAULT false` — explicit per-form opt-in; prevents
  test/internal forms from surfacing in the user dashboard.
- `announcements` table — `site`, `title`, `body`, `image_url`, `is_active`, `published_at`.
  RLS: public read when `is_active`; admin-only write.
- Storage bucket `portal-assets` — public read, admin-only upload. Used for announcement
  images; reserved for future profile avatars.
- Bootstrap backfill: inserts a `profiles` row (`role='admin'`) for every existing
  `auth.users` row (pre-portal, every auth user was an admin).

Apply to BOTH project refs (`iigbgbgakevcgilucvbs` SCAGO and `gticuvgclbvhwvpzkuez` GANSID)
per the multi-site deployment rule.

### Stepped form rendering

Forms opt in via `form.settings.renderMode === 'stepped'` and `form.settings.steps: FormStep[]`.
`FormField.section` / `FormField.sectionOrder` assign fields to named steps.

- `<SteppedFormShell>` — wraps the extracted `<FormRenderer>`, renders one step at a time with
  a left-sidebar stepper. Per-step validation via pure helpers in
  `components/SteppedRegistration/steppedValidation.ts` (`validateRequired`,
  `validateRms`, `validateGroupMembers`). Previous / Next / Submit footer controls.
- `<SingleFormShell>` — thin wrapper that renders `<FormRenderer>` with all fields at once
  (default for non-stepped forms; replaces current PublicRegistration body).
- `<FormRenderer>` — extracted field-rendering JSX + submit logic previously inline in
  `PublicRegistration.tsx`. Accepts `filteredFields` so shells can pass a step slice or all
  fields.
- **localStorage persistence:** in-progress answers keyed on
  `gansid-portal-stepper:{formId}:{userId}`; cleared on successful submit AND on signout
  (AuthContext sweeps all matching keys on auth state change).
- **FormBuilder UI:** `StepsManager` (toggle `renderMode`, CRUD steps) in form settings;
  per-field Step dropdown in `FieldPropertiesPanel`; step-assignment pill on `FieldCard`.

### Portal dashboard

Two-column layout (desktop): left ~65%, right ~35% sticky.

- **Left column:** Welcome block (display-typography greeting) → Available Forms grid
  (cards for all `show_in_portal = true` forms, sorted with user's role-type forms first;
  each card shows "Start Registration" or "View Registration" based on attendee rows) →
  Announcements feed (3 most-recent active items for the current site).
- **Right column:** Credential card — pulls from the latest `payment_status='paid'`
  attendee row matching `user_id = auth.uid()` or fallback email match; displays `qr_payload`
  as a large QR. Clicking opens the Credential Badge Modal (full-screen glass card with
  "Save as Image" via `html2canvas`). No paid attendee row → placeholder card with
  "Register for Congress" CTA. Quick Links section (static placeholder cards for MVP).
- **Avatar dropdown** (portal header): Profile → `/#/portal/profile`, Admin Dashboard →
  `/#/admin` (conditional on `role='admin'`), Sign Out.

### Styling foundation (Viscous Flow design system)

Scoped to portal surfaces via `.portal-root` in `styles/portal.css` — admin and public-form
surfaces are unaffected.

`tailwind.config.js` extended with GANSID-specific tokens:
- Colors: `gansid-primary` (#ba0028), `gansid-primary-container` (#E0243C),
  `gansid-secondary` (#2260a1), surface tones (`gansid-surface`, `gansid-on-surface`, etc.)
- Typography: `font-display` (Outfit), `font-body` (DM Sans) — loaded via Google Fonts
- Radii: `rounded-gansid-{md,lg,xl}` (1.5rem / 2rem / 3rem)
- Utilities: `bg-gansid-primary-gradient`, `shadow-invisible-lift`,
  `backdrop-blur-viscous` (24px), `ease-viscous`

Hand-rolled primitive components in `components/Portal/ui/` — no third-party UI library
(shadcn/radix ruled out; would fight the no-line rule):
`GlassCard` (tints: default/red/blue), `ViscousButton` (primary gradient / secondary glass),
`GlassInput`, `GlassSelect`, `GlassDialog` (Escape + click-outside), `FloatingToggleTabs`,
`OrganicAccordion`, `StepperSidebar`.

### verify-payment JWT stamping

When the request carries `Authorization: Bearer <jwt>`, the edge function calls
`supabase.auth.getUser(jwt)`, verifies the session, and derives `user_id` server-side.
Primary attendee rows get `user_id = authUserId`; guest placeholder rows stay NULL.
Anonymous submissions (no header) insert `user_id = NULL`. The client never supplies
`user_id` in the payload — that would be forgeable.

### Announcements admin

`Settings → Announcements` tab (`AnnouncementsTab.tsx`) — list/create/edit/delete/activate,
with image upload to `portal-assets/announcements/{uuid}.{ext}`. Site-scoped per
`CURRENT_SITE.key`. Image URL stored in `announcements.image_url`.

### Conventions / gotchas

- Portal routes register ONLY when `CURRENT_SITE.portalEnabled === true`. Since `CURRENT_SITE`
  is a build-time constant, portal code is tree-shaken out of the SCAGO bundle entirely.
- `forms.show_in_portal` defaults to `false` — explicit opt-in per form in FormsManager.
- `profiles.role` signup values are `attendee | exhibitor | sponsor` only; `admin` is a
  permission set via SQL (not self-selectable).
- `html2canvas` dependency added for the Credential Badge Modal's "Save as Image" action.
- localStorage scoping: `gansid-portal-stepper:{formId}:{userId}` — cleared on submit and
  signout; restarting from step 1 if localStorage is cleared manually is acceptable.
- Email verification is a soft block: the portal loads for unverified users (banner shown),
  but `verify-payment` checks `email_confirmed_at` and rejects unverified sessions with 401.

## Group Registration Flow

Triggered by the `registration-mode-selector` (RMS) field type on a form. A form may have at most one RMS field (builder enforces via `hasRmsField` flag in the toolbox). The public form renders an Individual/Group radio selector; selecting Group reveals a nested UX: size picker (2–`groupMaxSize`), "I have all their details now" checkbox, per-person rows, and "same country" / "same category" shortcut toggles.

- **Inline mode** (`groupHasAllInfo = true`) — contact fills every person's full registration inline
- **Send-links mode** (default) — contact enters Name + Email + Country + Category for each; pending-claim guests receive a link to complete their personal details

Contact pays one PayPal capture for the group total (sum of per-person prices computed by `computeGroupTotal` in `utils/groupPricing.ts`). `verify-payment` re-resolves prices server-side and inserts N attendee rows sharing a `transaction_id`:
- Primary (`is_primary = true`)
- Guests (`primary_attendee_id = primary.id`, `guest_type = 'pending-claim'` for send-links or `null` for inline)

**Claim flow:** pending-claim guests click `?ref=<attendeeId>` → PublicRegistration detects `guestType === 'pending-claim'` → pre-fills + locks their name/email/country/category → shows remaining personal fields → submit updates the row + flips `guest_type` to `'claimed'` + invokes `send-ticket-email` with `mode: 'guest-claim-completed'` (ships the ticket to the guest and notifies the primary).

**Emails:** `send-ticket-email` has two extra modes:
- `mode: 'group-invite'` — short "complete your registration" email fired by `verify-payment` for each pending-claim guest after a successful group capture
- `mode: 'guest-claim-completed'` — sends the ticket to the now-claimed guest + a "X has completed their registration" note to the primary

**Admin dashboard:** `AttendeeList` renders group primaries with expand/collapse chevrons; expanded rows show indented guests with status badges (Pending / Completed / Pre-filled) and per-guest actions (copy registration link, resend invitation, mark complete).

Seed for the GANSID Individual/Group form lives (non-committed) in `tmp/seed-gansid-form.sql`.

Spec: `docs/superpowers/specs/2026-04-16-form-templates-and-group-registration-design.md`
Plan: `docs/superpowers/plans/2026-04-16-form-templates-and-group-registration.md`

## Exhibitor Form

GANSID-only, component-driven (`form_type='exhibitor'`), no pricing — exhibitors have paid
externally. `PublicExhibitorForm.tsx` renders org info, tier-driven staff roster (hard quota
caps from `EXHIBITOR_TIERS` in `config/formTemplates/buildGansidExhibitor.ts`), optional
additional m², and consent checkboxes with modal-gated document viewing.

Data model: one primary attendee row per org (on the exhibitor form), N guest rows per staff
(on the registration form), linked via `primary_attendee_id`. All rows carry
`payment_status='paid'` and `payment_amount='PAID EXTERNALLY'`. Staff claim flow reuses the
pending-claim infrastructure; `guest_type='exhibitor-staff-pending'` activates the usual hides
(RMS, ticket, PayPal) plus presenting + emergency contact fields.

Admin dashboard: "Exhibitors" tab (visible only when exhibitor forms exist) with expandable
org rows → staff subsections → status badges + per-staff actions.

Spec: `docs/superpowers/specs/2026-04-16-exhibitor-form-and-admin-tabs-design.md`
Plan: `docs/superpowers/plans/2026-04-16-exhibitor-form-and-admin-tabs.md`

## Consent Modals

`components/Consent/ConsentCheckbox.tsx` — clickable label opens a modal that fetches a
markdown file at runtime (rendered as plain text). Checkbox stays disabled until the modal has
been closed once. Used for GANSID's T&C + Disclaimer on both the Congress registration form
and the exhibitor form. Documents live at `public/branding/gansid/docs/`.

To add a consent-with-modal to any form: set `FormField.type = 'boolean'`, add `linkText`
(clickable portion) and `consentModal: { title, url }`. `PublicRegistration.tsx` auto-detects
and renders via `ConsentCheckbox` instead of the plain boolean path.

## Database schema — key tables

- `forms` — adds `form_type TEXT NOT NULL DEFAULT 'event'` (values: `'event' | 'sponsor' | 'exhibitor'`)
- `attendees` — adds `sponsor_tier` (TEXT, nullable, check constrained), `sponsor_items` (JSONB),
  `payment_method` (TEXT, nullable, 'card'|'paypal'|'cheque'), `company_info` (JSONB),
  `sponsored_awards` (JSONB), `admin_notes` (TEXT). Partial index on `sponsor_tier WHERE NOT NULL`.
  Existing `payment_status` check constraint allows `'paid' | 'pending' | 'free'`.
- `sponsor_prospects` — new table for outreach (separate from attendees); RLS requires
  authenticated user
- `app_settings` — 13 new sponsor columns (5 template subject+body pairs, internal-recipients
  JSONB, cheque mailing address, HST rate)
- Storage bucket `sponsor-logos` — public read, anon + authenticated upload (reserved for a
  future logo-upload UI; currently unused)

## Conventions

- **Vitest** is configured for pure-function unit tests (templates, pricing, form seed shape,
  site-config resolution). UI/integration testing is manual.
- All event-flow and sponsor-flow attendee persistence goes through the `verify-payment` edge
  function — never write attendees directly from the client.
- Guest placeholder records use naming pattern: `"{PurchaserName} - Guest Ticket #N"` for
  event flow and `"{OrgName} - Guest Ticket #N"` for sponsor flow.
- Unclaimed guests are detected by checking `name.includes('Guest Ticket #')`.
- The `answers` field on attendee records captures form field responses for event flow.
  Sponsor flow stores structured data in typed columns (`company_info`, `sponsor_items`,
  `sponsored_awards`) rather than in `answers`.
- `FormPreview` mirrors PublicRegistration's success page for testing the event flow.
- **Sponsor total = sum(items.subtotal) + (HST rate × booth subtotal)** — HST applies to
  booth items only per the SCAGO rate card. Recomputed server-side in `verify-payment` to
  prevent client-side price manipulation.
- **`mapFormFromDb` must pass through `form_type`** — do NOT hardcode a ternary like
  `form_type === 'sponsor' ? 'sponsor' : 'event'`. Use `form_type || 'event'` so any new
  form_type value (e.g. `'exhibitor'`) is preserved. Source-grep tests in
  `tests/storageMappers.test.ts` enforce this.
- **Template builders must match TypeScript interfaces** — `ticketConfig` uses `items` (not
  `tickets`), `promoCodes` must be an array. Tests in `tests/formTemplates.test.ts` validate
  field shapes against the `TicketConfig` interface. Always run `npm test` after creating or
  modifying a template.
- **Sponsor tier derivation** — `PublicSponsorForm` assigns tier based on selected package
  first; if no package is selected but a scholarship item is chosen, tier falls back to
  `'scholarship'`; for ads/booth-only orders, tier falls back to `'award'` so the row still
  appears in the admin dashboard (`getSponsorAttendees` filters `sponsor_tier IS NOT NULL`).
- Cheque-pending attendees have `payment_amount` formatted as `"<total> CAD (PENDING CHEQUE)"`;
  the `(PENDING CHEQUE)` suffix is stripped when the admin marks it received.
- Admin-only edge functions (`confirm-sponsor-cheque`) enforce JWT auth both at the Supabase
  gateway (`verify_jwt: true`) and inside the function body (`auth.getUser(jwt)` belt-and-
  suspenders).
- **Site-level branding** is build-time via `config/sites.ts` keyed on `VITE_SITE`; runtime
  settings (logos, email templates, PayPal/SMTP) remain per-Supabase in `app_settings`.
