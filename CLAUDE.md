# EventCheck — QR Event Management

## Project Overview

Event registration and ticketing platform with QR code check-in. Built for events like galas where organizers sell tables/seats, manage guest registrations, and check in attendees via QR scan.

Deployed on **Netlify** (frontend) with **Supabase** (database, auth, edge functions).

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres, Edge Functions in Deno)
- **Payments:** PayPal (sandbox + production)
- **PDF:** jsPDF for ticket generation
- **Email:** SMTP via Supabase edge function (`send-ticket-email`)
- **Hosting:** Netlify (frontend), Supabase (backend)

## Project Structure

```
components/
  PublicRegistration.tsx   — Public-facing registration form (purchaser + guest modes)
  FormPreview.tsx          — Admin preview of registration form (mirrors PublicRegistration)
  FormBuilder/             — Drag-and-drop form builder for admins
  Settings.tsx             — Global app settings (SMTP, email templates, PDF, PayPal)
  AttendeeList.tsx         — Dashboard attendee table with check-in management
  Scanner.tsx              — QR code scanner for event check-in
  FormsManager.tsx         — Form CRUD management
services/
  storageService.ts        — Supabase CRUD for forms, attendees, settings
  supabaseClient.ts        — Supabase client initialization
  smtpService.ts           — Email sending via edge function
utils/
  pdfGenerator.ts          — jsPDF ticket PDF generation
  emailTemplates.ts        — HTML email template builder
supabase/functions/
  verify-payment/          — Server-side PayPal verification + attendee persistence
  send-ticket-email/       — SMTP email delivery
types.ts                   — All TypeScript interfaces (Attendee, Form, AppSettings, etc.)
```

## Key Flows

### Ticket Purchase (Purchaser Mode)
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
- Configurable in Settings > Email Templates
- **Ticket Confirmation tab:** purchaser email subject/body, guest email subject/body, purchaser guest backup note
- **Invitation / Marketing tab:** separate template for marketing emails
- Guest email supports placeholders: `{{event}}`, `{{purchaser}}`, `{{name}}`
- Named guests receive their own email directly; purchaser gets all tickets as backup
- All email settings stored in `app_settings` table

### PDF Ticket Generation (`utils/pdfGenerator.ts`)
- Uses jsPDF, renders: header with logo, attendee name, ticket type, QR code, transaction info
- Guest placeholder tickets get a red accent bar + registration QR code
- Named guest tickets get the primary color bar, no registration QR
- `maxWidth: 90` on name/ticketType to prevent overflow into QR area
- Null-safe fallbacks on all text fields
- Global settings in `AppSettings.pdfSettings`, per-form overrides via `Form.pdfSettings`

### Success Page (Post-Purchase)
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
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP for `send-ticket-email`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-provided

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (set `VITE_SITE=gansid` to build the GANSID variant)
- `npm test` — run Vitest unit tests once
- `npx tsc --noEmit` — type check without emitting
- `supabase functions deploy <name> --project-ref <ref>` — deploy edge function (see Multi-site deployment for both refs)
- `supabase secrets set KEY=VALUE --project-ref <ref>` — set edge function secrets

## Multi-site deployment

This repo powers two independent deployments from one `main` branch:

| Site | Netlify site | Supabase project-ref | VITE_SITE |
|------|--------------|----------------------|-----------|
| SCAGO (live) | existing SCAGO site | `iigbgbgakevcgilucvbs` | `scago` |
| GANSID Congress | `gansidcongress.netlify.app` | `<GANSID_PROJECT_REF>` | `gansid` |

Design: `docs/superpowers/specs/2026-04-15-multi-site-scaffold-design.md`
Plan: `docs/superpowers/plans/2026-04-15-multi-site-scaffold.md`

**Critical rule:** every migration and edge-function deploy must be applied to BOTH project-refs. Example:

```bash
# SCAGO
supabase db push --project-ref iigbgbgakevcgilucvbs
supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs

# GANSID (replace <GANSID_PROJECT_REF> with the actual ref from the Supabase dashboard)
supabase db push --project-ref <GANSID_PROJECT_REF>
supabase functions deploy verify-payment --project-ref <GANSID_PROJECT_REF>
```

If a migration is applied to only one project, the shared codebase will break on the other site.

Site-level branding is driven at build time by `config/sites.ts` keyed off `VITE_SITE`. Runtime settings (PayPal creds in secrets, email templates / logos / SMTP in `app_settings`) remain per-Supabase.

## Conventions

- Vitest is set up; unit tests live in `tests/` (run `npm test`). Most testing is still manual via the app.
- FormPreview mirrors PublicRegistration's success page for testing the full flow
- All attendee persistence goes through the `verify-payment` edge function (even free registrations)
- Guest placeholder records use naming pattern: `"{PurchaserName} - Guest Ticket #N"`
- Unclaimed guests are detected by checking `name.includes('Guest Ticket #')`
- The `answers` field on attendee records captures all form field responses for the dashboard
