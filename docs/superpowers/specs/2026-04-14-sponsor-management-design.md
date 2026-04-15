# Sponsor Management — Design Spec

**Date:** 2026-04-14
**Context:** SCAGO Hope Gala & Awards 2026 — sponsorship outreach, submissions, payment, and tracking
**Related document:** `York Regional Police - Invitation to Hope Gala 2026.docx.pdf` (defines the package tiers, scholarship, award categories, and ad rate card)

---

## 1. Goal

Add a sponsor management section to the EventCheck platform that supports:

1. Outreach: maintain a prospects list, send invitation emails (individually or bulk) from configurable templates.
2. Public sponsor form: one self-service form where prospects choose any mix of package tier, scholarship sponsorships, advertisements, and booth space, then pay via card/PayPal or pledge by cheque.
3. Admin dashboard: tabbed, filterable table of sponsors with stats, detail modal, and workflow actions (confirm cheque received, resend emails, edit, delete).
4. Documents: itemized receipt PDF (separate from ticket PDFs) for every sponsor submission; standard ticket PDFs for tiers that include seats.
5. Email automation: confirmation emails with receipt + ticket attachments; internal cheque-payment notifications to SCAGO's gala inbox.

Constraints:

- Reuse the existing `Form` + `Attendee` infrastructure wherever possible (PayPal edge function, SMTP email edge function, jsPDF, dashboard patterns). A sponsor is an attendee of a form whose `formType === 'sponsor'`.
- No breaking changes to the existing event registration flow.

---

## 2. Architecture and data model

### 2.1 Form type

Extend `Form` with an optional `formType: 'event' | 'sponsor'` field. Existing forms are `'event'` by default. `PublicRegistration.tsx` branches on `form.formType === 'sponsor'` to render the sponsor layout (delegates to a new `PublicSponsorForm.tsx` component); otherwise unchanged.

### 2.2 Attendee extensions

A sponsor submission writes to the `attendees` table like any other registration, with extra columns populated:

- `sponsor_tier` — `'signature' | 'gold' | 'silver' | 'award' | 'scholarship' | null`. Nullable. Only set on the primary sponsor row (guest placeholder rows leave it null and reference the parent via `primary_attendee_id`).
- `sponsor_items` — JSONB array. Each entry: `{ type: 'package' | 'scholarship' | 'ad' | 'booth', key: string, label: string, qty: number, unitPrice: number, subtotal: number }`. Single source of truth for receipt generation and the dashboard item-badge column.
- `payment_method` — `'card' | 'paypal' | 'cheque' | null`.
- `company_info` — JSONB: `{ orgName, contactName, contactTitle, phone, address, website, logoUrl }`.
- `sponsored_awards` — JSONB array of award category names. Populated when the sponsor picks an award category (Gold/Silver/Award-of-Excellence tiers).
- `admin_notes` — text. Editable from the sponsor detail modal.

Existing columns (`payment_status`, `payment_amount`, `transaction_id`, `invoice_id`, `is_primary`, `primary_attendee_id`, `answers`) are reused as-is.

### 2.3 Sponsor prospects (new table)

Prospects are leads who have not yet submitted the form. They are deliberately separate from `attendees`.

```
sponsor_prospects
  id uuid PK
  org_name text not null
  contact_name text
  contact_title text
  contact_email text not null
  contact_phone text
  status text not null default 'prospect'    -- 'prospect'|'invited'|'responded'|'confirmed'|'declined'
  sponsor_form_id uuid references forms(id)  -- which sponsor form their invite link points to
  invited_at timestamptz
  last_emailed_at timestamptz
  email_history jsonb default '[]'           -- [{sentAt, subject, templateKey}]
  notes text
  created_at timestamptz default now()
```

When a prospect submits the form, we match by `contact_email` and auto-update their status to `'confirmed'` (or `'responded'` if they picked cheque and the cheque hasn't cleared).

### 2.4 TicketItem extension

Add optional `itemCategory?: 'package' | 'scholarship' | 'ad' | 'booth'` to `TicketItem`. Undefined means a regular event ticket (unchanged behavior). The sponsor form UI groups items by category; receipt generation reads the category from here.

### 2.5 AppSettings extension

Five new email-template fields on `AppSettings` (stored in the existing `app_settings` row):

- `sponsorInvitationSubject`, `sponsorInvitationBody`
- `sponsorConfirmationPaidSubject`, `sponsorConfirmationPaidBody`
- `sponsorChequePledgeSubject`, `sponsorChequePledgeBody`
- `sponsorChequeInternalSubject`, `sponsorChequeInternalBody`, `sponsorChequeInternalRecipients` (string array, default `['gala@sicklecellanemia.ca', 'sicklecellawarenessontario@gmail.com', 'communication@sicklecellanemia.ca']`)
- `sponsorChequeReceivedSubject`, `sponsorChequeReceivedBody`
- `sponsorChequeMailingAddress` — plain text (or HTML), the address the sponsor mails their cheque to. Rendered in the public sponsor form and in the pledge email.
- `sponsorHstRate` — number, default `0.13` (ON HST). Applied to booth-space line items only.

These are stored in `app_settings` for simplicity, but are only edited from the Sponsors → Templates tab. `Settings.tsx` does not expose them.

---

## 3. Public sponsor form

Rendered by `components/Sponsors/PublicSponsorForm.tsx`, invoked from `PublicRegistration.tsx` when the form's `formType === 'sponsor'`. All form visual customization (`form.settings.formHeaderColor`, etc.) applies the same way it does to event forms.

### 3.1 Sections (top to bottom)

1. **Header** — event title, date ("June 13, 2026"), venue ("Renaissance By the Creek, Mississauga"), SCAGO logo.
2. **Company Information** — standard FormBuilder-driven fields: Organization Name *, Contact Name *, Contact Title, Email *, Phone, Address, Website, Logo upload (optional, stored in Supabase Storage bucket `sponsor-logos`).
3. **Sponsorship Package** — radio card selector. Options: Signature $55,000, Gold $35,000, Silver $20,000, Award of Excellence $10,000, None. Each card shows the benefits list from the PDF.
4. **Award Category** — conditional, appears only when Gold/Silver/Award selected. Radio list filtered by the PDF's tier rules:
   - Gold → Nursing, Humanitarian
   - Silver → Allied Health, Community, Legislative, Tribute, Media, Volunteer
   - Award of Excellence → any of the 10 categories (Medical, Humanitarian, Best Hospital, Nursing, Allied Health, Community, Legislative, Tribute, Media, Volunteer)
5. **Sunday Afolabi Scholarships** — quantity spinner 0–20, $2,500 each. Displays the PDF note about the $2,000/$300/$200 breakdown.
6. **Advertisements** — multi-select with quantity 0–5 per item: Double Spread $2,050, Back Page $1,500, Inside Front $1,300, Inside Back $1,300, Full Page $1,200, Half Page $650, Quarter Page $500.
7. **Exhibit / Booth** — radio: None, Half $500, Full $1,000.
8. **Order Summary** — sticky on desktop, inline on mobile. Itemized subtotal per section, HST line on booth space only (the PDF explicitly shows `+ HST` on booth, and lists no HST on tier packages, scholarships, or ads — so we don't apply HST there). HST rate stored as an editable setting (`sponsorHstRate`, default 13% for ON) so it can be adjusted without redeploy. Grand total.
9. **Payment Method** — radio:
   - Credit Card / PayPal → renders existing PayPal Buttons component on selection.
   - Cheque → shows mailing instructions (pulled from `sponsorChequePledgeBody` or a dedicated `chequeMailingAddress` setting) and a "Submit Pledge" button.

### 3.2 Submission paths

- **Card/PayPal:** PayPal Buttons capture order → POST to `verify-payment` edge function with `paymentMethod: 'paypal'` and `sponsorMeta` payload (tier, items, company_info, sponsored_awards, N guest seat placeholders). Function verifies with PayPal, creates primary sponsor attendee row + N guest placeholder rows (if tier includes seats), generates receipt PDF + ticket PDFs, sends confirmation email.
- **Cheque:** POST to `verify-payment` with `paymentMethod: 'cheque'`. Function skips PayPal verification, creates the primary sponsor row with `payment_status: 'pending'`, does NOT create guest placeholder rows yet, generates a "Pending Payment" receipt PDF, and sends two emails: the sponsor's cheque-pledge email and the internal cheque-notification email.

### 3.3 Success page

- **Paid:** "Thank you — you're confirmed as a {{tier}} sponsor" header, itemized receipt card, download-receipt button. If the tier includes seats: guest ticket grid (reuses existing success-page grid with per-seat QR, download buttons, registration links), and a "Download All Tickets" button.
- **Cheque pledged:** "Thank you — we've received your pledge" header, itemized receipt card marked "Pending Payment", mailing instructions, and a note that tickets will be issued once the cheque is received.

---

## 4. Admin sponsors dashboard

New nav item "Sponsors" (icon: `Handshake`) in the sidebar between "Manage Forms" and "Seating Chart". Route: `/admin/sponsors`.

### 4.1 Page layout

**Stats cards** (4-column grid, matches existing dashboard styling):

- Total Raised — sum of `payment_amount` where `payment_status = 'paid'` and `sponsor_tier IS NOT NULL`
- Committed (Pending) — sum where `payment_status = 'pending'` and `sponsor_tier IS NOT NULL`
- Confirmed Sponsors — count of paid sponsor rows
- Active Prospects — count from `sponsor_prospects` where status in (`'prospect'`, `'invited'`)

**Tab bar:** `All Sponsors · Packages · Scholarships · Advertisements · Booth Space · Prospects · Templates`

Each submission-related tab filters the attendee query by `sponsor_items` content (at least one item of the matching category). "Prospects" queries `sponsor_prospects`. "Templates" renders the template editor.

**Filter bar** (hidden on Prospects and Templates tabs):

- Search (org name / contact / email)
- Payment status dropdown
- Payment method dropdown
- Date range picker
- Column visibility dropdown (reuses `ColumnVisibilityDropdown`)

### 4.2 Sponsors table

Default columns: Org Name, Contact Person, Email, Items (badge list colored by category), Total, Method, Status (badge), Submitted Date, Actions.

Row click opens the **Sponsor Detail Modal**:

- Company info + logo preview
- Itemized selections with prices
- Payment details (method, status, transaction ID, amount)
- Award category chosen (if any)
- "Tickets Issued" section: table of guest placeholder + claimed rows (for tiers with seats), with claimed/unclaimed badge, copy-registration-link button, resend-ticket-email button per row
- Admin notes textarea (auto-saves on blur)
- Action buttons: Mark Cheque Received (only if pending), Resend Confirmation, Download Receipt PDF, Edit, Delete

### 4.3 Prospects tab

Toolbar: **Add Prospect**, **Import CSV**, **Send Invitation to Selected**.

Table columns: Checkbox, Organization, Contact Name, Email, Phone, Status (colored badge), Last Emailed, Invited Date, Actions (send invite, edit, delete, mark responded/declined).

**Add/Edit Prospect Modal:** org name, contact name, title, email, phone, which sponsor form to link them to, notes.

**Send Invitation Modal:**

- Shows the recipient list (selected prospects).
- Template selector dropdown (defaults to the Sponsor Invitation template).
- Editable subject + body (uses existing `RichTextEditor`). Edits here do not mutate the saved template.
- Live preview rendered with merged placeholders for the first recipient.
- Send button calls `send-ticket-email` with each prospect in turn, writes to `email_history`, updates `last_emailed_at`, and bumps status from `'prospect'` to `'invited'`.

### 4.4 Templates tab

Renders five editable email templates plus the internal cheque-notification recipients list. Each template has: subject text input, body rich-text editor, available-placeholders reference card, test-send button.

Templates:

1. **Sponsor Invitation Email** — `{{orgName}}`, `{{contactName}}`, `{{event}}`, `{{eventDate}}`, `{{sponsorFormLink}}`
2. **Sponsor Confirmation (Paid)** — `{{orgName}}`, `{{tier}}`, `{{itemsList}}`, `{{total}}`, `{{transactionId}}`
3. **Sponsor Cheque Pledge (to sponsor)** — `{{orgName}}`, `{{itemsList}}`, `{{total}}`, `{{mailingAddress}}`
4. **Cheque Notification (internal)** — `{{orgName}}`, `{{contactName}}`, `{{contactEmail}}`, `{{contactPhone}}`, `{{itemsList}}`, `{{total}}`, `{{adminDashboardLink}}`; plus an editable recipients-list input
5. **Cheque Received Confirmation** — `{{orgName}}`, `{{tier}}`, `{{itemsList}}`, `{{total}}`

All templates inherit the existing `emailHeaderLogo`, `emailHeaderColor`, `emailFooterColor` styling used by the current ticket email.

### 4.5 AttendeeList — new "Sponsor Tickets" tab filter

`AttendeeList.tsx` gets a new tab filter called "Sponsor Tickets" that shows rows where `primary_attendee_id` links to a parent row with `sponsor_tier IS NOT NULL`. Claimed/unclaimed badges and check-in actions work unchanged because these rows are regular attendees.

---

## 5. Payment, receipt, and ticket generation

### 5.1 Documents

Every sponsor submission produces two independent document streams:

- **Itemized receipt PDF** (new `utils/receiptGenerator.ts`) — one per submission. Contains: SCAGO logo, "Official Receipt" / "Pending Payment Receipt" header (depending on status), sponsor org + contact, itemized table (description, qty, unit, subtotal), HST line, grand total, payment method + transaction ID (if paid), receipt number, charity info footer. Paid receipts and pending receipts use the same template with a status watermark/badge difference.
- **Ticket PDFs** (existing `utils/pdfGenerator.ts`, unchanged) — one per seat for tiers that include seats (Signature 16, Gold 8, Silver 8, Award 0, Scholarship 0 unless explicitly added).

### 5.2 Guest ticket flow for tier sponsors

For a Gold sponsorship (8 seats):

1. Primary sponsor attendee row created with `isPrimary: true`, full sponsor data.
2. 8 guest placeholder attendee rows created with `isPrimary: false`, `primary_attendee_id` pointing to the primary row, name `"{OrgName} - Guest Ticket #1"` through `#8`, each with its own `qrPayload` + registration link.
3. These rows automatically appear in `AttendeeList`'s main view + the new "Sponsor Tickets" tab.
4. Sponsor receives ticket email with per-seat registration links. Each guest who opens `?ref=<attendeeId>` updates their placeholder row in-place (existing PublicRegistration guest-mode flow, no new code).
5. Claimed guests show real names in "All Attendees"; `primary_attendee_id` preserves the link back to the sponsor.

Scholarship tier: the PDF notes $300 of each $2,500 covers two complimentary tickets for the student + guest, but those tickets are issued through a separate SCAGO-side process (not part of this platform). Scholarship sponsorship creates a sponsor attendee row with 0 seats, no guest placeholders.

### 5.3 Edge functions

**`verify-payment` (extended, not replaced):**

- Existing event flow untouched.
- New branch when the request body includes `sponsorMeta`. Handles PayPal verification OR cheque skip-verify, creates sponsor + guest rows, generates receipt + tickets, sends confirmation or pledge emails.

**`confirm-sponsor-cheque` (new):**

- Triggered by the admin clicking "Mark Cheque Received" and confirming the modal.
- Input: sponsor attendee id, edited email subject + body (from the modal).
- Actions: flip `payment_status` to `'paid'`, create N guest placeholder rows if the tier includes seats, generate fresh "Paid" receipt PDF, send the cheque-received email with receipt + tickets attached.
- Returns the updated sponsor row + guest rows to the client for immediate UI refresh.

**`send-ticket-email` (unchanged):**

- Already accepts arbitrary HTML body + attachments array; new sponsor emails flow through it.

### 5.4 Mark Cheque Received modal

Triggered from the table row action or the detail modal. Flow:

1. Modal opens with the cheque-received template pre-rendered with placeholders merged. Subject + body are editable.
2. Admin reviews, optionally edits, clicks "Confirm & Send".
3. Client calls `confirm-sponsor-cheque` with the (possibly edited) subject + body.
4. On success, modal closes, the row refreshes to `Paid` status, guest ticket rows appear in the "Tickets Issued" section.

---

## 6. Routes and navigation

**App.tsx:**

- Add nav item: `{ to: '/admin/sponsors', icon: Handshake, label: 'Sponsors' }`.
- Add route: `<Route path="/sponsors" element={<SponsorsDashboard />} />` inside the existing `/admin/*` routes block.
- No changes to `/form/:formId` — PublicRegistration branches internally on `formType`.

**FormsManager.tsx:**

- Add a "Create Sponsor Form" button alongside the existing "Create Form" button. Clicking it seeds a new form with:
  - `formType: 'sponsor'`
  - `title: 'Sponsor the Hope Gala & Awards 2026'`
  - Pre-populated `FormField` for company info
  - Pre-populated `TicketConfig.items` for all tiers, scholarships, ads, booth (each with `itemCategory` set)
  - Sensible defaults for the award-category conditional

This gives admins a working sponsor form in one click. They can then customize visuals, copy, etc. via the existing FormBuilder.

---

## 7. Files — new vs. modified

**New files:**

- `components/Sponsors/SponsorsDashboard.tsx` — page shell, tab state, stats cards
- `components/Sponsors/SponsorsTable.tsx` — shared table used by All/Packages/Scholarships/Ads/Booth tabs
- `components/Sponsors/SponsorDetailModal.tsx`
- `components/Sponsors/ProspectsTab.tsx`
- `components/Sponsors/AddProspectModal.tsx`
- `components/Sponsors/SendInvitationModal.tsx`
- `components/Sponsors/ChequeReceivedModal.tsx`
- `components/Sponsors/SponsorTemplatesTab.tsx`
- `components/Sponsors/PublicSponsorForm.tsx`
- `utils/receiptGenerator.ts`
- `supabase/functions/confirm-sponsor-cheque/index.ts`
- `supabase/migrations/20260414_add_sponsor_tables.sql` — adds columns to `attendees`, creates `sponsor_prospects`, adds `form_type` column to `forms`, adds sponsor template fields to `app_settings`

**Modified files:**

- `types.ts` — extend `Attendee`, `Form`, `TicketItem`, `AppSettings`; add `SponsorProspect` type + related helper types
- `services/storageService.ts` — extend attendee mapping for new columns; add `getProspects`, `saveProspect`, `deleteProspect`, `updateProspectStatus`, `logProspectEmail`; add `getSponsorAttendees` helper
- `components/PublicRegistration.tsx` — branch on `formType === 'sponsor'` to delegate to `PublicSponsorForm`
- `components/AttendeeList.tsx` — add "Sponsor Tickets" tab filter
- `components/FormsManager.tsx` — add "Create Sponsor Form" action
- `App.tsx` — register `/admin/sponsors` route + nav item
- `supabase/functions/verify-payment/index.ts` — add `sponsorMeta` branch (PayPal path + cheque skip-verify path)

**Storage buckets:**

- Create `sponsor-logos` bucket (public-read) for logo uploads.

---

## 8. Out of scope for this spec

These items are intentionally excluded and would be future work:

- Automated logo/ad artwork collection pipeline (sponsors pick tier → we ask for artwork later by email)
- Sponsor-facing self-service portal (logging back in to update info)
- CSV export of sponsors list (easy to add later; reuses the same table filters)
- Automated HST invoicing (receipts are issued but we don't generate T4As or business-number registered invoices)
- Accounts-receivable aging / dunning for unpaid cheque pledges
- Multi-tenant sponsor pricing (single rate card from the PDF for now)

---

## 9. Success criteria

The feature is done when:

1. An admin can create a sponsor form in one click, share its public link, and a prospect can complete the form end-to-end.
2. A PayPal/card sponsor receives a confirmation email with a separate receipt PDF + their ticket PDFs, and their seats appear as guest placeholder rows in `AttendeeList`.
3. A cheque-paying sponsor receives a pledge email + receipt (pending) PDF; SCAGO's gala inbox + the two CC'd addresses receive the internal notification email.
4. An admin can click "Mark Cheque Received" on a pending row, review/edit the confirmation email in a modal, send it, and see the row flip to Paid with guest ticket rows created and emailed.
5. The Sponsors dashboard tabs correctly filter submissions by category, and the Prospects tab supports adding, importing, and sending invitations to one or many prospects with tracked status and history.
6. The "Sponsor Tickets" tab in the main `AttendeeList` shows guest seats linked back to their sponsor, and those guests claim their tickets via the existing `?ref=` registration flow with zero new code.
