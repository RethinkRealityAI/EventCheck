# Sponsor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sponsor Management section to EventCheck that lets SCAGO run sponsor outreach, collect sponsor submissions with mixed packages/scholarships/ads/booth, accept PayPal + cheque payments, generate itemized receipt PDFs separate from ticket PDFs, and track everything in a tabbed admin dashboard.

**Architecture:** Sponsor forms are regular `Form` rows with `formType: 'sponsor'`. Sponsor submissions are regular `Attendee` rows with new typed columns (`sponsor_tier`, `sponsor_items`, `payment_method`, `company_info`, `sponsored_awards`). Tier sponsors (Signature/Gold/Silver) still get their seats as guest-placeholder attendee rows — the existing `?ref=<id>` guest-claim flow works unchanged. Prospects live in a new `sponsor_prospects` table. Email templates live in `app_settings` but are only edited from the Sponsors section. PayPal flow extends the existing `verify-payment` edge function; cheque-received confirmation gets its own new `confirm-sponsor-cheque` function.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind, Supabase (Postgres + Deno Edge Functions), jsPDF, PayPal React SDK, lucide-react icons, react-router-dom v7. No test framework (per CLAUDE.md) — verification is `npx tsc --noEmit` for type safety plus manual browser/SQL checks.

**Project ref (Supabase):** `iigbgbgakevcgilucvbs`

**Spec:** [docs/superpowers/specs/2026-04-14-sponsor-management-design.md](../specs/2026-04-14-sponsor-management-design.md)

---

## File Structure

**New files to create:**

- `supabase/migrations/20260414_add_sponsor_tables.sql` — DB schema changes
- `components/Sponsors/SponsorsDashboard.tsx` — page shell + tab routing
- `components/Sponsors/SponsorsTable.tsx` — shared table for submission tabs
- `components/Sponsors/SponsorDetailModal.tsx` — per-sponsor detail view
- `components/Sponsors/ChequeReceivedModal.tsx` — editable confirmation before sending
- `components/Sponsors/ProspectsTab.tsx` — outreach list
- `components/Sponsors/AddProspectModal.tsx` — add/edit prospect
- `components/Sponsors/SendInvitationModal.tsx` — send invite to selected prospects
- `components/Sponsors/SponsorTemplatesTab.tsx` — 5-template editor
- `components/Sponsors/PublicSponsorForm.tsx` — public-facing sponsor form
- `components/Sponsors/createSponsorForm.ts` — helper that seeds a sponsor-typed `Form`
- `utils/receiptGenerator.ts` — itemized receipt PDF generator (separate from `pdfGenerator.ts`)
- `utils/sponsorEmailTemplates.ts` — placeholder-merge helpers for the 5 sponsor templates
- `supabase/functions/confirm-sponsor-cheque/index.ts` — edge function for the admin flow

**Existing files to modify:**

- `types.ts` — add `SponsorProspect`, extend `Attendee`, `Form`, `TicketItem`, `AppSettings`, `DEFAULT_SETTINGS`
- `services/storageService.ts` — extend attendee mapping, add prospect CRUD + sponsor queries, extend settings mapping
- `services/database.types.ts` — regenerate or manually patch types for the new DB columns
- `components/PublicRegistration.tsx` — branch on `form.formType === 'sponsor'` to render `PublicSponsorForm`
- `components/AttendeeList.tsx` — add "Sponsor Tickets" tab filter
- `components/FormsManager.tsx` — add "Create Sponsor Form" button
- `App.tsx` — add nav item + route for `/admin/sponsors`
- `supabase/functions/verify-payment/index.ts` — add `sponsorMeta` branch (PayPal + cheque)

**Storage:** create `sponsor-logos` bucket (public-read) via SQL in the migration.

---

## Execution notes

- **No test framework.** Each task's verification step is `npx tsc --noEmit` and/or a specific manual check (SQL query, browser action). Treat these as the "tests pass" signal.
- **Deploy edge functions with:** `supabase functions deploy <name> --project-ref iigbgbgakevcgilucvbs`
- **Apply migrations via Supabase MCP:** `mcp__claude_ai_Supabase__apply_migration` with the project_id `iigbgbgakevcgilucvbs` (preferred over `supabase db push` since the project is remote).
- **Commit frequently** — after each task. Conventional commits (`feat:`, `fix:`, `chore:`).
- Always run `npx tsc --noEmit` after TS changes before committing.

---

## Task 1: Database migration — schema changes

**Files:**
- Create: `supabase/migrations/20260414_add_sponsor_tables.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260414_add_sponsor_tables.sql` with this content:

```sql
-- 1. Extend forms table with formType
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'event'
  CHECK (form_type IN ('event', 'sponsor'));

-- 2. Extend attendees table with sponsor fields
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS sponsor_tier TEXT
    CHECK (sponsor_tier IS NULL OR sponsor_tier IN ('signature', 'gold', 'silver', 'award', 'scholarship')),
  ADD COLUMN IF NOT EXISTS sponsor_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'paypal', 'cheque')),
  ADD COLUMN IF NOT EXISTS company_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsored_awards JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Index for sponsor-only queries
CREATE INDEX IF NOT EXISTS attendees_sponsor_tier_idx
  ON attendees (sponsor_tier) WHERE sponsor_tier IS NOT NULL;

-- 3. New sponsor_prospects table
CREATE TABLE IF NOT EXISTS sponsor_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'invited', 'responded', 'confirmed', 'declined')),
  sponsor_form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  last_emailed_at TIMESTAMPTZ,
  email_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_prospects_email_idx ON sponsor_prospects (contact_email);
CREATE INDEX IF NOT EXISTS sponsor_prospects_status_idx ON sponsor_prospects (status);

-- Allow authenticated users (admins) full access, same pattern as other tables
ALTER TABLE sponsor_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON sponsor_prospects;
CREATE POLICY "Authenticated full access" ON sponsor_prospects
  FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Extend app_settings with sponsor template + config fields
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS sponsor_invitation_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_invitation_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_confirmation_paid_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_confirmation_paid_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_pledge_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_pledge_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_internal_recipients JSONB DEFAULT '["gala@sicklecellanemia.ca","sicklecellawarenessontario@gmail.com","communication@sicklecellanemia.ca"]'::jsonb,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_received_subject TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_received_body TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_cheque_mailing_address TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_hst_rate NUMERIC DEFAULT 0.13;

-- 5. Create sponsor-logos storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsor-logos', 'sponsor-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload
DROP POLICY IF EXISTS "Authenticated can upload sponsor logos" ON storage.objects;
CREATE POLICY "Authenticated can upload sponsor logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sponsor-logos');

-- Policy: public can read
DROP POLICY IF EXISTS "Public can read sponsor logos" ON storage.objects;
CREATE POLICY "Public can read sponsor logos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'sponsor-logos');

-- Policy: public can upload (since sponsor form is public — they upload their own logo)
DROP POLICY IF EXISTS "Public can upload sponsor logos" ON storage.objects;
CREATE POLICY "Public can upload sponsor logos" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'sponsor-logos');
```

- [ ] **Step 2: Apply the migration to the remote Supabase project**

Use the Supabase MCP tool to apply it:

```
mcp__claude_ai_Supabase__apply_migration
  project_id: iigbgbgakevcgilucvbs
  name: add_sponsor_tables
  query: <the full SQL above>
```

Expected: returns success. If it fails on any `ALTER TABLE` because a column already exists, that's fine — the `IF NOT EXISTS` guards cover it.

- [ ] **Step 3: Verify the schema landed**

Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendees'
  AND column_name IN ('sponsor_tier','sponsor_items','payment_method','company_info','sponsored_awards','admin_notes');
```

Expected: 6 rows returned.

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'sponsor_prospects';
```

Expected: 1 row.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'forms' AND column_name = 'form_type';
```

Expected: 1 row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260414_add_sponsor_tables.sql
git commit -m "feat(db): add sponsor tables and columns

- form_type column on forms (default 'event')
- sponsor_tier, sponsor_items, payment_method, company_info,
  sponsored_awards, admin_notes columns on attendees
- new sponsor_prospects table with RLS
- sponsor email template + HST + mailing address columns on app_settings
- sponsor-logos storage bucket with public read + anon upload policies"
```

---

## Task 2: TypeScript type definitions

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add `SponsorProspect` type and related helper types at end of `types.ts`**

Append this block at the end of [types.ts](../../../types.ts):

```typescript
// ============================================================
// Sponsor Management
// ============================================================

export type SponsorTier = 'signature' | 'gold' | 'silver' | 'award' | 'scholarship';
export type SponsorItemCategory = 'package' | 'scholarship' | 'ad' | 'booth';
export type PaymentMethod = 'card' | 'paypal' | 'cheque';
export type SponsorProspectStatus = 'prospect' | 'invited' | 'responded' | 'confirmed' | 'declined';

export interface SponsorItem {
  type: SponsorItemCategory;
  key: string;       // stable identifier e.g. 'tier-gold', 'ad-back-page'
  label: string;     // display label e.g. 'Gold Sponsorship'
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface CompanyInfo {
  orgName: string;
  contactName?: string;
  contactTitle?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  logoUrl?: string;
}

export interface SponsorProspectEmailLog {
  sentAt: string;     // ISO date
  subject: string;
  templateKey: string;
  recipientEmail: string;
}

export interface SponsorProspect {
  id: string;
  orgName: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail: string;
  contactPhone?: string;
  status: SponsorProspectStatus;
  sponsorFormId?: string | null;
  invitedAt?: string | null;
  lastEmailedAt?: string | null;
  emailHistory: SponsorProspectEmailLog[];
  notes?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Extend `Attendee` with sponsor fields**

Modify the `Attendee` interface at [types.ts:1-28](../../../types.ts#L1-L28) — add these fields to the interface (before the closing `}`):

```typescript
  // Sponsor fields (populated only when this attendee is a sponsor submission)
  sponsorTier?: SponsorTier | null;
  sponsorItems?: SponsorItem[];
  paymentMethod?: PaymentMethod | null;
  companyInfo?: CompanyInfo;
  sponsoredAwards?: string[];
  adminNotes?: string;
```

- [ ] **Step 3: Extend `Form` with `formType`**

In the `Form` interface at [types.ts:141-171](../../../types.ts#L141-L171), add to the top of the interface:

```typescript
  formType?: 'event' | 'sponsor';  // defaults to 'event' when undefined
```

- [ ] **Step 4: Extend `TicketItem` with `itemCategory`**

In the `TicketItem` interface at [types.ts:101-109](../../../types.ts#L101-L109), add:

```typescript
  itemCategory?: SponsorItemCategory;
  benefits?: string[];  // for tier cards — bulleted benefits list shown in the UI
```

- [ ] **Step 5: Extend `AppSettings` with sponsor fields**

Add these fields to the `AppSettings` interface at [types.ts:184-217](../../../types.ts#L184-L217) just above `pdfSettings`:

```typescript
  // Sponsor Email Templates
  sponsorInvitationSubject: string;
  sponsorInvitationBody: string;
  sponsorConfirmationPaidSubject: string;
  sponsorConfirmationPaidBody: string;
  sponsorChequePledgeSubject: string;
  sponsorChequePledgeBody: string;
  sponsorChequeInternalSubject: string;
  sponsorChequeInternalBody: string;
  sponsorChequeInternalRecipients: string[];
  sponsorChequeReceivedSubject: string;
  sponsorChequeReceivedBody: string;
  sponsorChequeMailingAddress: string;
  sponsorHstRate: number;
```

- [ ] **Step 6: Add matching defaults to `DEFAULT_SETTINGS`**

In the `DEFAULT_SETTINGS` object at [types.ts:219-254](../../../types.ts#L219-L254), insert before `pdfSettings`:

```typescript
  sponsorInvitationSubject: 'Invitation to Partner with SCAGO at the Hope Gala & Awards 2026',
  sponsorInvitationBody: '<p>Dear {{contactName}},</p><p>On behalf of the Sickle Cell Awareness Group of Ontario, I am writing to invite <strong>{{orgName}}</strong> to partner with us at the <strong>{{event}}</strong> on <strong>{{eventDate}}</strong>.</p><p>You can review our sponsorship packages and confirm your preferred level of support using the form below:</p><p><a href="{{sponsorFormLink}}" style="display:inline-block;padding:12px 24px;background:#C8262A;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View Sponsorship Options</a></p><p>We kindly ask that confirmations be received by <strong>March 31, 2026</strong> to support timely planning.</p><p>Thank you for considering this partnership.</p><p>Warm regards,<br>SCAGO Team</p>',
  sponsorConfirmationPaidSubject: 'Thank you for your sponsorship — {{event}}',
  sponsorConfirmationPaidBody: '<p>Dear {{contactName}},</p><p>Thank you for confirming <strong>{{orgName}}</strong> as a partner at the {{event}}. We are honoured to have your support.</p><p><strong>Your sponsorship includes:</strong></p>{{itemsList}}<p><strong>Total paid:</strong> {{total}}<br><strong>Transaction ID:</strong> {{transactionId}}</p><p>Attached you will find your official receipt and event tickets (if applicable). We will be in touch shortly regarding logo artwork and additional partnership details.</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequePledgeSubject: 'Sponsorship pledge received — {{event}}',
  sponsorChequePledgeBody: '<p>Dear {{contactName}},</p><p>Thank you for pledging to support <strong>{{orgName}}</strong> at the {{event}}. Your selections have been recorded.</p><p><strong>Your selections:</strong></p>{{itemsList}}<p><strong>Total due:</strong> {{total}}</p><p><strong>Please mail your cheque to:</strong></p><p>{{mailingAddress}}</p><p>Once the cheque is received, we will send your official receipt and event tickets (if applicable). Attached please find a preliminary pending-payment receipt for your records.</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequeInternalSubject: 'Cheque payment request — {{orgName}} — {{total}}',
  sponsorChequeInternalBody: '<p><strong>A new cheque sponsorship pledge has been submitted. Please follow up with the sponsor.</strong></p><p><strong>Organization:</strong> {{orgName}}<br><strong>Contact:</strong> {{contactName}}<br><strong>Email:</strong> {{contactEmail}}<br><strong>Phone:</strong> {{contactPhone}}</p><p><strong>Selections:</strong></p>{{itemsList}}<p><strong>Total due:</strong> {{total}}</p><p><a href="{{adminDashboardLink}}">Open in admin dashboard</a></p>',
  sponsorChequeInternalRecipients: ['gala@sicklecellanemia.ca', 'sicklecellawarenessontario@gmail.com', 'communication@sicklecellanemia.ca'],
  sponsorChequeReceivedSubject: 'Payment received — thank you! ({{event}})',
  sponsorChequeReceivedBody: '<p>Dear {{contactName}},</p><p>We are pleased to confirm that we have received your cheque payment for <strong>{{orgName}}</strong>\'s sponsorship of the {{event}}.</p><p><strong>Your confirmed sponsorship:</strong></p>{{itemsList}}<p><strong>Total paid:</strong> {{total}}</p><p>Attached you will find your final receipt and event tickets (if applicable).</p><p>With gratitude,<br>SCAGO Team</p>',
  sponsorChequeMailingAddress: 'Sickle Cell Awareness Group of Ontario\n5109 Steeles Ave W #330\nNorth York, ON M9L 2Y8\n\nPayable to: "Sickle Cell Awareness Group of Ontario"',
  sponsorHstRate: 0.13,
```

- [ ] **Step 7: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors related to these changes. (Errors from pre-existing files unrelated to sponsors are fine to leave for now but flag them.)

- [ ] **Step 8: Commit**

```bash
git add types.ts
git commit -m "feat(types): add sponsor management types and default templates"
```

---

## Task 3: Extend `database.types.ts` for new columns

**Files:**
- Modify: `services/database.types.ts`

- [ ] **Step 1: Open the file and locate the `attendees`, `forms`, `app_settings` table types**

Read [services/database.types.ts](../../../services/database.types.ts). The structure has `Row`, `Insert`, `Update` for each table.

- [ ] **Step 2: Add new fields to `attendees.Row`, `Insert`, `Update`**

In the `attendees` table block, add to each of `Row`, `Insert`, `Update`:

```typescript
sponsor_tier: string | null
sponsor_items: Json | null
payment_method: string | null
company_info: Json | null
sponsored_awards: Json | null
admin_notes: string | null
```

(For `Insert`/`Update`, make them all optional by typing them with `?`, matching the existing pattern in the file.)

- [ ] **Step 3: Add `form_type` field to `forms.Row`, `Insert`, `Update`**

```typescript
form_type: string  // Row
form_type?: string  // Insert / Update
```

- [ ] **Step 4: Add sponsor fields to `app_settings.Row`, `Insert`, `Update`**

```typescript
sponsor_invitation_subject: string | null
sponsor_invitation_body: string | null
sponsor_confirmation_paid_subject: string | null
sponsor_confirmation_paid_body: string | null
sponsor_cheque_pledge_subject: string | null
sponsor_cheque_pledge_body: string | null
sponsor_cheque_internal_subject: string | null
sponsor_cheque_internal_body: string | null
sponsor_cheque_internal_recipients: Json | null
sponsor_cheque_received_subject: string | null
sponsor_cheque_received_body: string | null
sponsor_cheque_mailing_address: string | null
sponsor_hst_rate: number | null
```

(Mirror optional/`?` treatment for Insert/Update per existing style in the file.)

- [ ] **Step 5: Add a new `sponsor_prospects` table entry**

Copy the structure of another simple table (e.g. `custom_3d_models`) and adapt:

```typescript
sponsor_prospects: {
  Row: {
    id: string
    org_name: string
    contact_name: string | null
    contact_title: string | null
    contact_email: string
    contact_phone: string | null
    status: string
    sponsor_form_id: string | null
    invited_at: string | null
    last_emailed_at: string | null
    email_history: Json
    notes: string | null
    created_at: string
  }
  Insert: {
    id?: string
    org_name: string
    contact_name?: string | null
    contact_title?: string | null
    contact_email: string
    contact_phone?: string | null
    status?: string
    sponsor_form_id?: string | null
    invited_at?: string | null
    last_emailed_at?: string | null
    email_history?: Json
    notes?: string | null
    created_at?: string
  }
  Update: {
    id?: string
    org_name?: string
    contact_name?: string | null
    contact_title?: string | null
    contact_email?: string
    contact_phone?: string | null
    status?: string
    sponsor_form_id?: string | null
    invited_at?: string | null
    last_emailed_at?: string | null
    email_history?: Json
    notes?: string | null
    created_at?: string
  }
  Relationships: []
}
```

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit
```

Expected: no new errors introduced by these edits.

- [ ] **Step 7: Commit**

```bash
git add services/database.types.ts
git commit -m "feat(types): extend database.types.ts with sponsor schema"
```

---

## Task 4: Extend `storageService.ts` — attendee mapping + sponsor queries + prospect CRUD

**Files:**
- Modify: `services/storageService.ts`

- [ ] **Step 1: Update `mapAttendeeFromDb` to read sponsor fields**

In [services/storageService.ts](../../../services/storageService.ts) at the `mapAttendeeFromDb` function, append these lines before the closing `}`:

```typescript
    sponsorTier: (db as any).sponsor_tier || null,
    sponsorItems: ((db as any).sponsor_items as any[]) || [],
    paymentMethod: (db as any).payment_method || null,
    companyInfo: ((db as any).company_info as any) || undefined,
    sponsoredAwards: ((db as any).sponsored_awards as string[]) || [],
    adminNotes: (db as any).admin_notes || undefined,
```

(The `(db as any)` cast is used because the generated types may lag — remove the cast once `database.types.ts` is updated.)

- [ ] **Step 2: Update `mapAttendeeToDb` to write sponsor fields**

In the `mapAttendeeToDb` function, add before the closing `};`:

```typescript
    sponsor_tier: a.sponsorTier || null,
    sponsor_items: (a.sponsorItems as any) || [],
    payment_method: a.paymentMethod || null,
    company_info: (a.companyInfo as any) || {},
    sponsored_awards: (a.sponsoredAwards as any) || [],
    admin_notes: a.adminNotes || null,
  ` as any`,  // keep this pattern consistent with existing JSON casts if TS complains
```

(Adjust the cast style to match what the existing file does for `donation_details`. Look at line 346 for reference.)

- [ ] **Step 3: Extend `updateAttendee` to handle sponsor fields**

In the `updateAttendee` function (around line 64–99), add:

```typescript
  if (updates.sponsorTier !== undefined) dbUpdates.sponsor_tier = updates.sponsorTier || null;
  if (updates.sponsorItems !== undefined) dbUpdates.sponsor_items = updates.sponsorItems as any;
  if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod || null;
  if (updates.companyInfo !== undefined) dbUpdates.company_info = updates.companyInfo as any;
  if (updates.sponsoredAwards !== undefined) dbUpdates.sponsored_awards = updates.sponsoredAwards as any;
  if (updates.adminNotes !== undefined) dbUpdates.admin_notes = updates.adminNotes ?? null;
```

- [ ] **Step 4: Update `mapFormFromDb` and `mapFormToDb` for `formType`**

`mapFormFromDb` — after `status:`:

```typescript
    formType: (db as any).form_type === 'sponsor' ? 'sponsor' : 'event',
```

`mapFormToDb` — add:

```typescript
    form_type: f.formType || 'event',
```

- [ ] **Step 5: Extend `getSettings` and `saveSettings` for sponsor fields**

In `getSettings` (around line 220), extend the returned `settings` object with:

```typescript
    sponsorInvitationSubject: (data as any).sponsor_invitation_subject || DEFAULT_SETTINGS.sponsorInvitationSubject,
    sponsorInvitationBody: (data as any).sponsor_invitation_body || DEFAULT_SETTINGS.sponsorInvitationBody,
    sponsorConfirmationPaidSubject: (data as any).sponsor_confirmation_paid_subject || DEFAULT_SETTINGS.sponsorConfirmationPaidSubject,
    sponsorConfirmationPaidBody: (data as any).sponsor_confirmation_paid_body || DEFAULT_SETTINGS.sponsorConfirmationPaidBody,
    sponsorChequePledgeSubject: (data as any).sponsor_cheque_pledge_subject || DEFAULT_SETTINGS.sponsorChequePledgeSubject,
    sponsorChequePledgeBody: (data as any).sponsor_cheque_pledge_body || DEFAULT_SETTINGS.sponsorChequePledgeBody,
    sponsorChequeInternalSubject: (data as any).sponsor_cheque_internal_subject || DEFAULT_SETTINGS.sponsorChequeInternalSubject,
    sponsorChequeInternalBody: (data as any).sponsor_cheque_internal_body || DEFAULT_SETTINGS.sponsorChequeInternalBody,
    sponsorChequeInternalRecipients: ((data as any).sponsor_cheque_internal_recipients as string[]) || DEFAULT_SETTINGS.sponsorChequeInternalRecipients,
    sponsorChequeReceivedSubject: (data as any).sponsor_cheque_received_subject || DEFAULT_SETTINGS.sponsorChequeReceivedSubject,
    sponsorChequeReceivedBody: (data as any).sponsor_cheque_received_body || DEFAULT_SETTINGS.sponsorChequeReceivedBody,
    sponsorChequeMailingAddress: (data as any).sponsor_cheque_mailing_address || DEFAULT_SETTINGS.sponsorChequeMailingAddress,
    sponsorHstRate: (data as any).sponsor_hst_rate ?? DEFAULT_SETTINGS.sponsorHstRate,
```

In `saveSettings` (around line 258), extend the `dbRecord` with:

```typescript
    sponsor_invitation_subject: settings.sponsorInvitationSubject,
    sponsor_invitation_body: settings.sponsorInvitationBody,
    sponsor_confirmation_paid_subject: settings.sponsorConfirmationPaidSubject,
    sponsor_confirmation_paid_body: settings.sponsorConfirmationPaidBody,
    sponsor_cheque_pledge_subject: settings.sponsorChequePledgeSubject,
    sponsor_cheque_pledge_body: settings.sponsorChequePledgeBody,
    sponsor_cheque_internal_subject: settings.sponsorChequeInternalSubject,
    sponsor_cheque_internal_body: settings.sponsorChequeInternalBody,
    sponsor_cheque_internal_recipients: settings.sponsorChequeInternalRecipients as any,
    sponsor_cheque_received_subject: settings.sponsorChequeReceivedSubject,
    sponsor_cheque_received_body: settings.sponsorChequeReceivedBody,
    sponsor_cheque_mailing_address: settings.sponsorChequeMailingAddress,
    sponsor_hst_rate: settings.sponsorHstRate,
```

- [ ] **Step 6: Add sponsor-specific queries**

Append at the end of `storageService.ts`:

```typescript
// ============================================================
// Sponsor queries
// ============================================================

export const getSponsorAttendees = async (): Promise<Attendee[]> => {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .not('sponsor_tier', 'is', null)
    .eq('is_primary', true)
    .order('registered_at', { ascending: false });

  if (error) {
    console.error('Failed to load sponsor attendees', error);
    return [];
  }
  return (data || []).map(mapAttendeeFromDb);
};

// ============================================================
// Sponsor prospects
// ============================================================

import type { SponsorProspect, SponsorProspectStatus } from '../types';

export const getProspects = async (): Promise<SponsorProspect[]> => {
  const { data, error } = await supabase
    .from('sponsor_prospects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load prospects', error);
    return [];
  }
  return (data || []).map(mapProspectFromDb);
};

export const saveProspect = async (p: SponsorProspect): Promise<void> => {
  const { error } = await supabase
    .from('sponsor_prospects')
    .upsert(mapProspectToDb(p));
  if (error) throw new Error(`Failed to save prospect: ${error.message}`);
};

export const deleteProspect = async (id: string): Promise<void> => {
  const { error } = await supabase.from('sponsor_prospects').delete().eq('id', id);
  if (error) console.error('Failed to delete prospect', error);
};

export const updateProspectStatus = async (id: string, status: SponsorProspectStatus): Promise<void> => {
  const patch: any = { status };
  if (status === 'invited') {
    patch.invited_at = new Date().toISOString();
    patch.last_emailed_at = new Date().toISOString();
  }
  const { error } = await supabase.from('sponsor_prospects').update(patch).eq('id', id);
  if (error) console.error('Failed to update prospect status', error);
};

export const logProspectEmail = async (
  id: string,
  entry: { sentAt: string; subject: string; templateKey: string; recipientEmail: string }
): Promise<void> => {
  // Fetch, append, save — simple but avoids race issues at this scale
  const { data } = await supabase
    .from('sponsor_prospects')
    .select('email_history, status')
    .eq('id', id)
    .single();
  if (!data) return;
  const history = (data.email_history as any[]) || [];
  history.push(entry);
  const newStatus = data.status === 'prospect' ? 'invited' : data.status;
  await supabase
    .from('sponsor_prospects')
    .update({
      email_history: history as any,
      last_emailed_at: entry.sentAt,
      invited_at: data.status === 'prospect' ? entry.sentAt : undefined,
      status: newStatus,
    })
    .eq('id', id);
};

function mapProspectFromDb(db: any): SponsorProspect {
  return {
    id: db.id,
    orgName: db.org_name,
    contactName: db.contact_name || undefined,
    contactTitle: db.contact_title || undefined,
    contactEmail: db.contact_email,
    contactPhone: db.contact_phone || undefined,
    status: db.status,
    sponsorFormId: db.sponsor_form_id,
    invitedAt: db.invited_at,
    lastEmailedAt: db.last_emailed_at,
    emailHistory: (db.email_history as any[]) || [],
    notes: db.notes || undefined,
    createdAt: db.created_at,
  };
}

function mapProspectToDb(p: SponsorProspect): any {
  return {
    id: p.id,
    org_name: p.orgName,
    contact_name: p.contactName || null,
    contact_title: p.contactTitle || null,
    contact_email: p.contactEmail,
    contact_phone: p.contactPhone || null,
    status: p.status,
    sponsor_form_id: p.sponsorFormId || null,
    invited_at: p.invitedAt || null,
    last_emailed_at: p.lastEmailedAt || null,
    email_history: p.emailHistory as any,
    notes: p.notes || null,
  };
}
```

- [ ] **Step 7: Run type check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add services/storageService.ts
git commit -m "feat(storage): extend attendee/form/settings mappers with sponsor fields and add prospect CRUD"
```

---

## Task 5: Receipt PDF generator

**Files:**
- Create: `utils/receiptGenerator.ts`

- [ ] **Step 1: Create `utils/receiptGenerator.ts`**

```typescript
import jsPDF from 'jspdf';
import { Attendee, AppSettings } from '../types';

export interface ReceiptOptions {
  status: 'paid' | 'pending';    // controls watermark/badge + copy
  hstLineAmount?: number;        // HST on booth only; 0 or undefined means no HST line
}

/**
 * Generate an itemized receipt PDF for a sponsor submission.
 * Separate from pdfGenerator.ts (which handles individual ticket PDFs).
 */
export const generateReceiptPDF = (
  attendee: Attendee,
  settings: AppSettings,
  options: ReceiptOptions
): jsPDF => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primary = settings.pdfSettings.primaryColor || '#C8262A';
  const { status, hstLineAmount = 0 } = options;

  // Header bar
  doc.setFillColor(primary);
  doc.rect(0, 0, pageWidth, 44, 'F');

  // Logo
  if (settings.pdfSettings.logoUrl && settings.pdfSettings.logoUrl.length > 50) {
    try {
      const format = settings.pdfSettings.logoUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(settings.pdfSettings.logoUrl, format, 15, 10, 24, 24, undefined, 'FAST');
    } catch (e) { /* ignore logo errors, continue */ }
  }

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(status === 'paid' ? 'OFFICIAL RECEIPT' : 'PENDING PAYMENT RECEIPT', pageWidth - 15, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(settings.pdfSettings.organizationName || 'Sickle Cell Awareness Group of Ontario', pageWidth - 15, 32, { align: 'right' });

  // Status banner for pending
  if (status === 'pending') {
    doc.setFillColor(255, 248, 220);
    doc.rect(15, 52, pageWidth - 30, 14, 'F');
    doc.setTextColor(140, 90, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PENDING — Cheque not yet received', 20, 61);
  }

  // Sponsor info
  const company = attendee.companyInfo || { orgName: attendee.name };
  let y = status === 'pending' ? 80 : 62;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SPONSOR', 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(company.orgName || attendee.name, 15, y);
  y += 5;
  if (company.contactName) { doc.text(company.contactName, 15, y); y += 5; }
  if (company.email) { doc.text(company.email, 15, y); y += 5; }
  if (company.phone) { doc.text(company.phone, 15, y); y += 5; }

  // Receipt meta (right column)
  let yMeta = status === 'pending' ? 80 : 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RECEIPT #', pageWidth - 60, yMeta);
  doc.text('DATE', pageWidth - 60, yMeta + 10);
  doc.setFont('helvetica', 'normal');
  doc.text((attendee.invoiceId || attendee.id).slice(0, 16).toUpperCase(), pageWidth - 15, yMeta, { align: 'right' });
  doc.text(new Date(attendee.registeredAt).toLocaleDateString('en-CA'), pageWidth - 15, yMeta + 10, { align: 'right' });
  if (attendee.transactionId) {
    doc.setFont('helvetica', 'bold');
    doc.text('TXN ID', pageWidth - 60, yMeta + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(attendee.transactionId.slice(0, 20), pageWidth - 15, yMeta + 20, { align: 'right' });
  }

  // Itemized table
  y = Math.max(y, yMeta + 30) + 10;
  doc.setDrawColor(primary);
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESCRIPTION', 15, y);
  doc.text('QTY', pageWidth - 75, y, { align: 'right' });
  doc.text('UNIT', pageWidth - 50, y, { align: 'right' });
  doc.text('SUBTOTAL', pageWidth - 15, y, { align: 'right' });
  y += 3;
  doc.line(15, y, pageWidth - 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  const items = attendee.sponsorItems || [];
  let subtotal = 0;
  for (const item of items) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(item.label, 15, y, { maxWidth: pageWidth - 95 });
    doc.text(String(item.qty), pageWidth - 75, y, { align: 'right' });
    doc.text(`$${item.unitPrice.toFixed(2)}`, pageWidth - 50, y, { align: 'right' });
    doc.text(`$${item.subtotal.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
    subtotal += item.subtotal;
    y += 7;
  }

  y += 3;
  doc.line(15, y, pageWidth - 15, y);
  y += 7;

  // Subtotal / HST / Total
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', pageWidth - 50, y, { align: 'right' });
  doc.text(`$${subtotal.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
  y += 6;

  if (hstLineAmount > 0) {
    doc.text(`HST (${((settings.sponsorHstRate || 0.13) * 100).toFixed(0)}%)`, pageWidth - 50, y, { align: 'right' });
    doc.text(`$${hstLineAmount.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
    y += 6;
  }

  const grandTotal = subtotal + hstLineAmount;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', pageWidth - 50, y, { align: 'right' });
  doc.text(`$${grandTotal.toFixed(2)} ${settings.currency || 'CAD'}`, pageWidth - 15, y, { align: 'right' });

  // Payment method block
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYMENT METHOD', 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const pm = attendee.paymentMethod || 'unknown';
  const pmLabel = pm === 'paypal' || pm === 'card' ? 'PayPal / Credit Card' : pm === 'cheque' ? 'Cheque' : pm;
  doc.text(status === 'paid' ? `${pmLabel} — Paid` : `${pmLabel} — Pending`, 15, y);

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(settings.pdfSettings.footerText || '', pageWidth / 2, 280, { align: 'center' });
  doc.text('Thank you for supporting SCAGO.', pageWidth / 2, 285, { align: 'center' });

  return doc;
};
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add utils/receiptGenerator.ts
git commit -m "feat(pdf): add itemized sponsor receipt PDF generator"
```

---

## Task 6: Sponsor email template helpers

**Files:**
- Create: `utils/sponsorEmailTemplates.ts`

- [ ] **Step 1: Create the merge-helpers file**

```typescript
import { Attendee, AppSettings, SponsorItem, SponsorProspect } from '../types';

/**
 * Render an itemized <ul> HTML list of sponsor items.
 */
export const renderItemsListHtml = (items: SponsorItem[], currency = 'CAD'): string => {
  if (!items.length) return '<p><em>No items selected.</em></p>';
  const rows = items
    .map(i =>
      `<li><strong>${escapeHtml(i.label)}</strong>${i.qty > 1 ? ` &times; ${i.qty}` : ''} — $${i.subtotal.toFixed(2)} ${currency}</li>`)
    .join('');
  return `<ul style="padding-left:20px;line-height:1.8;">${rows}</ul>`;
};

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Replace {{placeholders}} in a template string with values from ctx.
 * Missing placeholders are left as empty strings.
 */
export const mergeTemplate = (template: string, ctx: Record<string, string | undefined>): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => ctx[key] ?? '');

/**
 * Build the context object for a sponsor confirmation/pledge email.
 */
export const buildSponsorEmailContext = (
  attendee: Attendee,
  settings: AppSettings,
  extras: { event: string; adminDashboardLink?: string; mailingAddress?: string } = { event: '' }
): Record<string, string> => {
  const items = attendee.sponsorItems || [];
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  const currency = settings.currency || 'CAD';
  const company = attendee.companyInfo || { orgName: attendee.name };
  return {
    orgName: company.orgName || attendee.name,
    contactName: company.contactName || attendee.name,
    contactEmail: company.email || attendee.email || '',
    contactPhone: company.phone || '',
    tier: attendee.sponsorTier || '',
    itemsList: renderItemsListHtml(items, currency),
    total: `$${total.toFixed(2)} ${currency}`,
    transactionId: attendee.transactionId || 'Pending',
    event: extras.event || attendee.formTitle || 'Hope Gala & Awards 2026',
    eventDate: 'June 13, 2026',
    mailingAddress: (extras.mailingAddress || settings.sponsorChequeMailingAddress || '').replace(/\n/g, '<br>'),
    adminDashboardLink: extras.adminDashboardLink || '',
  };
};

/**
 * Build the context object for a prospect invitation email.
 */
export const buildProspectEmailContext = (
  prospect: SponsorProspect,
  sponsorFormUrl: string,
  event = 'Hope Gala & Awards 2026'
): Record<string, string> => ({
  orgName: prospect.orgName,
  contactName: prospect.contactName || 'there',
  contactEmail: prospect.contactEmail,
  event,
  eventDate: 'June 13, 2026',
  sponsorFormLink: sponsorFormUrl,
});
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add utils/sponsorEmailTemplates.ts
git commit -m "feat(email): add sponsor email template merge helpers"
```

---

## Task 7: Sponsor-form seed helper

**Files:**
- Create: `components/Sponsors/createSponsorForm.ts`

- [ ] **Step 1: Create the seed helper**

Create the Sponsors directory and file. The seed produces a ready-to-use sponsor form with all 5 tiers + scholarship + 7 ads + booth pre-populated.

```typescript
import { Form, FormField, TicketItem } from '../../types';

export const createSponsorForm = (): Form => {
  const id = crypto.randomUUID();

  const tierBenefits = {
    signature: [
      '2 complimentary tables (16 tickets)',
      'Inside back cover advert + logo on magazine front cover',
      '30-second commercial on event screen',
      'Recognition as sponsor of Medical Award of Excellence',
      'Includes 4 Sunday Afolabi scholarship grants',
      '10×10 booth space (optional)',
    ],
    gold: [
      '1 complimentary table of 8',
      'Full page advert (inside)',
      'Sponsor of Nursing or Humanitarian Award',
      '5×10 booth space',
      'Includes 2 Sunday Afolabi scholarship grants',
    ],
    silver: [
      '1 complimentary table of 8',
      '½ page advert',
      'Sponsor of one bronze-list award (Allied Health, Community, Legislative, Tribute, Media, or Volunteer)',
      'Table exhibition space',
    ],
    award: [
      'Sponsor of one award category',
      'Logo and listing in magazine and event screen',
      'Optional presentation of grant at the Gala',
    ],
    scholarship: [
      'Sponsor one Sunday Afolabi scholarship ($2,500 each)',
      '$2,000 to student, $300 complimentary tickets, $200 admin',
      'Logo and listing in magazine and event screen',
    ],
  };

  const tickets: TicketItem[] = [
    { id: 'tier-signature', name: 'Signature Gala Sponsor', description: 'Top-tier partnership', price: 55000, inventory: 0, maxPerOrder: 1, seats: 16, itemCategory: 'package', benefits: tierBenefits.signature },
    { id: 'tier-gold', name: 'Gold Sponsorship', description: 'Gold-tier partnership', price: 35000, inventory: 0, maxPerOrder: 1, seats: 8, itemCategory: 'package', benefits: tierBenefits.gold },
    { id: 'tier-silver', name: 'Silver Sponsorship', description: 'Silver-tier partnership', price: 20000, inventory: 0, maxPerOrder: 1, seats: 8, itemCategory: 'package', benefits: tierBenefits.silver },
    { id: 'tier-award', name: 'Award of Excellence Sponsorship', description: 'Sponsor a specific award', price: 10000, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'package', benefits: tierBenefits.award },
    { id: 'item-scholarship', name: 'Sunday Afolabi Scholarship', description: 'Each scholarship supports one student', price: 2500, inventory: 0, maxPerOrder: 20, seats: 0, itemCategory: 'scholarship', benefits: tierBenefits.scholarship },
    { id: 'ad-double-spread', name: 'Double Spread Advert', price: 2050, inventory: 0, maxPerOrder: 2, seats: 0, itemCategory: 'ad' },
    { id: 'ad-back-page', name: 'Back Page Advert', price: 1500, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-inside-front', name: 'Inside Front Page Advert', price: 1300, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-inside-back', name: 'Inside Back Page Advert', price: 1300, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-full-page', name: 'Full Page Advert', price: 1200, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'ad-half-page', name: 'Half Page Advert', price: 650, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'ad-quarter-page', name: 'Quarter Page Advert', price: 500, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'booth-full', name: 'Full Booth Space', description: '10×10 booth (+ HST)', price: 1000, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'booth' },
    { id: 'booth-half', name: 'Half Booth Space', description: 'Half booth (+ HST)', price: 500, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'booth' },
  ];

  const fields: FormField[] = [
    { id: 'company-org', type: 'text', label: 'Organization Name', required: true },
    { id: 'company-contact-name', type: 'text', label: 'Contact Name', required: true },
    { id: 'company-contact-title', type: 'text', label: 'Contact Title', required: false },
    { id: 'company-email', type: 'email', label: 'Email Address', required: true },
    { id: 'company-phone', type: 'phone', label: 'Phone', required: false },
    { id: 'company-address', type: 'address', label: 'Mailing Address', required: false },
    { id: 'company-website', type: 'text', label: 'Website', required: false },
    {
      id: 'sponsor-items',
      type: 'ticket',
      label: 'Sponsorship Selection',
      required: true,
      ticketConfig: {
        currency: 'CAD',
        items: tickets,
        promoCodes: [],
      },
    },
  ];

  return {
    id,
    title: 'Sponsor the Hope Gala & Awards 2026',
    description: 'Partner with SCAGO to support the Hope Gala & Awards 2026 on June 13, 2026 at Renaissance By the Creek, Mississauga.',
    formType: 'sponsor',
    createdAt: new Date().toISOString(),
    status: 'active',
    fields,
    settings: {
      submitButtonText: 'Submit Sponsorship',
      successTitle: 'Thank you for your sponsorship!',
      formAccentColor: '#C8262A',
    },
  };
};
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/createSponsorForm.ts
git commit -m "feat(sponsor): add sponsor form seed helper with all tiers, ads, booth"
```

---

## Task 8: "Create Sponsor Form" button in FormsManager

**Files:**
- Modify: `components/FormsManager.tsx`

- [ ] **Step 1: Read `components/FormsManager.tsx` and find the existing "Create Form" handler**

Locate the button/handler used to create a new blank form. You'll add a sibling "Create Sponsor Form" button that calls `createSponsorForm()` from Task 7, saves it via `saveForm`, and navigates the user to `/admin/builder/<new-form-id>`.

- [ ] **Step 2: Add the import and button**

At the top of `FormsManager.tsx`, add:

```typescript
import { createSponsorForm } from './Sponsors/createSponsorForm';
import { Handshake } from 'lucide-react';
```

Near the existing "Create Form" button, add:

```tsx
<button
  onClick={async () => {
    const newForm = createSponsorForm();
    await saveForm(newForm);
    navigate(`/admin/builder/${newForm.id}`);
  }}
  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md font-semibold"
>
  <Handshake className="w-4 h-4" />
  Create Sponsor Form
</button>
```

(Use the existing Tailwind pattern already in the file — adjust class names to match the neighbouring button's style if they differ.)

- [ ] **Step 3: Type-check and manual verify**

```bash
npx tsc --noEmit
npm run dev
```

Open the app → log in → navigate to `/admin/forms` → click "Create Sponsor Form" → verify it opens FormBuilder with the seeded fields + tickets populated.

Expected: FormBuilder shows 7 company-info fields + a single ticket field containing 14 items.

- [ ] **Step 4: Commit**

```bash
git add components/FormsManager.tsx
git commit -m "feat(forms): add 'Create Sponsor Form' button that seeds all tiers and ads"
```

---

## Task 9: Public sponsor form component

**Files:**
- Create: `components/Sponsors/PublicSponsorForm.tsx`

This is a large component. Keep the logic inside `PublicSponsorForm` lean by delegating submission to the existing `verify-payment` edge function (extended in Task 11).

- [ ] **Step 1: Create the skeleton**

```typescript
import React, { useState, useMemo, useEffect } from 'react';
import { Form, AppSettings, Attendee, SponsorItem, SponsorTier, CompanyInfo } from '../../types';
import { useNotifications } from '../NotificationSystem';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { CreditCard, Mail, Check, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateReceiptPDF } from '../../utils/receiptGenerator';
import { generateTicketPDF } from '../../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../../services/smtpService';
import { buildSponsorEmailContext, mergeTemplate } from '../../utils/sponsorEmailTemplates';

interface Props {
  form: Form;
  settings: AppSettings;
}

const GOLD_AWARDS = ['Nursing', 'Humanitarian'];
const SILVER_AWARDS = ['Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];
const ALL_AWARDS = ['Medical', 'Humanitarian', 'Best Hospital', 'Nursing', 'Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];

const tierItemIdToSponsorTier = (id: string): SponsorTier | null => {
  if (id === 'tier-signature') return 'signature';
  if (id === 'tier-gold') return 'gold';
  if (id === 'tier-silver') return 'silver';
  if (id === 'tier-award') return 'award';
  if (id === 'item-scholarship') return 'scholarship';
  return null;
};

export const PublicSponsorForm: React.FC<Props> = ({ form, settings }) => {
  const { showNotification } = useNotifications();
  const ticketField = form.fields.find(f => f.type === 'ticket');
  const items = ticketField?.ticketConfig?.items || [];
  const companyFields = form.fields.filter(f => f.type !== 'ticket');

  const [company, setCompany] = useState<CompanyInfo>({ orgName: '' });
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [scholarshipQty, setScholarshipQty] = useState(0);
  const [adQuantities, setAdQuantities] = useState<Record<string, number>>({});
  const [boothChoice, setBoothChoice] = useState<'none' | 'half' | 'full'>('none');
  const [awardCategory, setAwardCategory] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'cheque'>('paypal');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [resultTier, setResultTier] = useState<SponsorTier | null>(null);

  // Compute line items
  const lineItems: SponsorItem[] = useMemo(() => {
    const out: SponsorItem[] = [];
    if (selectedTierId) {
      const t = items.find(i => i.id === selectedTierId);
      if (t) out.push({ type: 'package', key: t.id, label: t.name, qty: 1, unitPrice: t.price, subtotal: t.price });
    }
    if (scholarshipQty > 0) {
      const s = items.find(i => i.id === 'item-scholarship');
      if (s) out.push({ type: 'scholarship', key: s.id, label: s.name, qty: scholarshipQty, unitPrice: s.price, subtotal: s.price * scholarshipQty });
    }
    for (const [id, qty] of Object.entries(adQuantities)) {
      if (qty > 0) {
        const ad = items.find(i => i.id === id);
        if (ad) out.push({ type: 'ad', key: ad.id, label: ad.name, qty, unitPrice: ad.price, subtotal: ad.price * qty });
      }
    }
    if (boothChoice !== 'none') {
      const key = boothChoice === 'full' ? 'booth-full' : 'booth-half';
      const b = items.find(i => i.id === key);
      if (b) out.push({ type: 'booth', key: b.id, label: b.name, qty: 1, unitPrice: b.price, subtotal: b.price });
    }
    return out;
  }, [selectedTierId, scholarshipQty, adQuantities, boothChoice, items]);

  const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
  const boothLineTotal = lineItems.filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0);
  const hst = boothLineTotal * (settings.sponsorHstRate || 0.13);
  const total = subtotal + hst;

  const eligibleAwards = (() => {
    if (selectedTierId === 'tier-gold') return GOLD_AWARDS;
    if (selectedTierId === 'tier-silver') return SILVER_AWARDS;
    if (selectedTierId === 'tier-award') return ALL_AWARDS;
    return [];
  })();
  const requiresAwardSelection = eligibleAwards.length > 0;

  const handleSubmit = async (paypalOrderId?: string) => {
    if (!company.orgName || !company.email) {
      showNotification('Please fill in organization name and email.', 'error');
      return;
    }
    if (lineItems.length === 0) {
      showNotification('Please select at least one sponsorship option.', 'error');
      return;
    }
    if (requiresAwardSelection && !awardCategory) {
      showNotification('Please choose an award category for your tier.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const attendeeId = crypto.randomUUID();
      const tier = tierItemIdToSponsorTier(selectedTierId || '');
      const ticketSummary = lineItems.map(i => `${i.label} x${i.qty}`).join(', ');

      const sponsorMeta = {
        tier,
        items: lineItems,
        companyInfo: company,
        sponsoredAwards: awardCategory ? [awardCategory] : [],
        total,
        hst,
      };

      const primaryAttendee: Partial<Attendee> & Record<string, any> = {
        id: attendeeId,
        form_id: form.id,
        form_title: form.title,
        name: company.orgName,
        email: company.email,
        ticket_type: ticketSummary,
        registered_at: new Date().toISOString(),
        qr_payload: JSON.stringify({ id: attendeeId }),
        is_primary: true,
        is_test: false,
        invoice_id: attendeeId.slice(0, 13).toUpperCase(),
      };

      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: {
          formId: form.id,
          paypalOrderId: paymentMethod === 'paypal' ? paypalOrderId : undefined,
          paymentMethod,
          sponsorMeta,
          attendees: [primaryAttendee],
          mode: paymentMethod === 'cheque' ? 'cheque' : 'paid',
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Submission failed');
      }

      setResultTier(tier);
      setStep('success');
      showNotification(
        paymentMethod === 'cheque' ? 'Pledge received — check your email for mailing instructions.' : 'Thank you for your sponsorship!',
        'success'
      );
    } catch (e: any) {
      showNotification(e.message || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-4">
          {paymentMethod === 'cheque' ? 'Pledge received' : 'Thank you for your sponsorship!'}
        </h1>
        <p className="text-slate-600">
          {paymentMethod === 'cheque'
            ? 'We have emailed you mailing instructions and a pending receipt. Your tickets will be sent once the cheque is received.'
            : 'A confirmation email with your receipt and tickets (if applicable) is on the way.'}
        </p>
      </div>
    );
  }

  // Main form render
  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold text-slate-900">{form.title}</h1>
        <p className="text-slate-600 mt-2">{form.description}</p>
      </header>

      {/* Section 1: Company Info — render companyFields */}
      <Section title="Company Information">
        <div className="grid md:grid-cols-2 gap-4">
          {companyFields.map(f => (
            <Input
              key={f.id}
              field={f}
              value={(company as any)[f.id.replace('company-', '').replace(/-/g, '')] || ''}
              onChange={val => {
                const prop = f.id.replace('company-', '');
                setCompany(prev => ({
                  ...prev,
                  orgName: prop === 'org' ? val : prev.orgName,
                  contactName: prop === 'contact-name' ? val : prev.contactName,
                  contactTitle: prop === 'contact-title' ? val : prev.contactTitle,
                  email: prop === 'email' ? val : prev.email,
                  phone: prop === 'phone' ? val : prev.phone,
                  address: prop === 'address' ? val : prev.address,
                  website: prop === 'website' ? val : prev.website,
                } as CompanyInfo));
              }}
            />
          ))}
        </div>
      </Section>

      {/* Section 2: Tier selection */}
      <Section title="Sponsorship Package">
        <div className="grid md:grid-cols-2 gap-4">
          {items.filter(i => i.itemCategory === 'package').map(tier => (
            <label
              key={tier.id}
              className={`border-2 rounded-xl p-5 cursor-pointer transition ${selectedTierId === tier.id ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:border-slate-400'}`}
            >
              <input
                type="radio"
                name="tier"
                className="sr-only"
                checked={selectedTierId === tier.id}
                onChange={() => setSelectedTierId(tier.id)}
              />
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{tier.name}</h3>
                  {tier.description && <p className="text-sm text-slate-500">{tier.description}</p>}
                </div>
                <div className="text-xl font-extrabold text-red-700">${tier.price.toLocaleString()}</div>
              </div>
              {tier.benefits && (
                <ul className="mt-3 text-sm text-slate-700 space-y-1 list-disc pl-5">
                  {tier.benefits.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </label>
          ))}
          <button type="button" onClick={() => setSelectedTierId(null)} className={`border-2 rounded-xl p-5 text-left ${!selectedTierId ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
            <h3 className="font-bold">No tier — custom support</h3>
            <p className="text-sm text-slate-500">I'd like to support via scholarships, ads, or booth only.</p>
          </button>
        </div>
      </Section>

      {/* Section 3: Award category (conditional) */}
      {requiresAwardSelection && (
        <Section title="Award Category">
          <p className="text-sm text-slate-600 mb-3">Choose which Award of Excellence your sponsorship supports:</p>
          <div className="flex flex-wrap gap-2">
            {eligibleAwards.map(a => (
              <label key={a} className={`px-4 py-2 rounded-full border-2 cursor-pointer ${awardCategory === a ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
                <input type="radio" name="award" className="sr-only" checked={awardCategory === a} onChange={() => setAwardCategory(a)} />
                {a}
              </label>
            ))}
          </div>
        </Section>
      )}

      {/* Section 4: Scholarships */}
      <Section title="Sunday Afolabi Scholarships ($2,500 each)">
        <QtyStepper value={scholarshipQty} onChange={setScholarshipQty} min={0} max={20} />
        <p className="text-xs text-slate-500 mt-2">Each scholarship: $2,000 to the student, $300 for two complimentary tickets, $200 admin.</p>
      </Section>

      {/* Section 5: Advertisements */}
      <Section title="Advertisements in the Gala Program Book">
        <div className="grid md:grid-cols-2 gap-3">
          {items.filter(i => i.itemCategory === 'ad').map(ad => (
            <div key={ad.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
              <div>
                <div className="font-semibold">{ad.name}</div>
                <div className="text-sm text-slate-500">${ad.price.toLocaleString()}</div>
              </div>
              <QtyStepper
                value={adQuantities[ad.id] || 0}
                onChange={v => setAdQuantities(prev => ({ ...prev, [ad.id]: v }))}
                min={0}
                max={ad.maxPerOrder}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Section 6: Booth */}
      <Section title="Exhibit / Booth Space">
        <div className="flex gap-3">
          {(['none', 'half', 'full'] as const).map(opt => (
            <label key={opt} className={`flex-1 p-4 rounded-xl border-2 cursor-pointer text-center ${boothChoice === opt ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
              <input type="radio" className="sr-only" checked={boothChoice === opt} onChange={() => setBoothChoice(opt)} />
              <div className="font-semibold">{opt === 'none' ? 'None' : opt === 'half' ? 'Half Booth ($500)' : 'Full Booth ($1,000)'}</div>
              {opt !== 'none' && <div className="text-xs text-slate-500">+ HST</div>}
            </label>
          ))}
        </div>
      </Section>

      {/* Order summary */}
      <div className="bg-slate-50 rounded-xl p-6 sticky top-6 border border-slate-200 mb-6">
        <h3 className="font-bold text-lg mb-3">Order Summary</h3>
        {lineItems.length === 0 && <p className="text-slate-500 text-sm">No items selected yet.</p>}
        {lineItems.map(i => (
          <div key={i.key} className="flex justify-between text-sm py-1">
            <span>{i.label}{i.qty > 1 ? ` × ${i.qty}` : ''}</span>
            <span className="font-semibold">${i.subtotal.toLocaleString()}</span>
          </div>
        ))}
        {hst > 0 && <div className="flex justify-between text-sm pt-2 border-t mt-2"><span>HST on booth</span><span>${hst.toFixed(2)}</span></div>}
        <div className="flex justify-between font-extrabold text-lg pt-2 border-t mt-2">
          <span>Total</span><span>${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {settings.currency || 'CAD'}</span>
        </div>
      </div>

      {/* Payment method */}
      <Section title="Payment Method">
        <div className="flex gap-4 mb-4">
          <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer ${paymentMethod === 'paypal' ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
            <input type="radio" className="sr-only" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} />
            <CreditCard className="w-5 h-5 inline mr-2" /> Credit Card / PayPal
          </label>
          <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer ${paymentMethod === 'cheque' ? 'border-red-600 bg-red-50' : 'border-slate-200'}`}>
            <input type="radio" className="sr-only" checked={paymentMethod === 'cheque'} onChange={() => setPaymentMethod('cheque')} />
            <Mail className="w-5 h-5 inline mr-2" /> Pay by Cheque
          </label>
        </div>

        {paymentMethod === 'paypal' && settings.paypalClientId && total > 0 && (
          <PayPalScriptProvider options={{ clientId: settings.paypalClientId, currency: settings.currency || 'CAD' }}>
            <PayPalButtons
              disabled={submitting || !company.orgName || !company.email || lineItems.length === 0}
              createOrder={(_data, actions) => actions.order.create({
                intent: 'CAPTURE',
                purchase_units: [{ amount: { value: total.toFixed(2), currency_code: settings.currency || 'CAD' } }],
              })}
              onApprove={async (data) => { await handleSubmit(data.orderID); }}
            />
          </PayPalScriptProvider>
        )}

        {paymentMethod === 'cheque' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm mb-3">Please mail your cheque to:</p>
            <pre className="text-sm whitespace-pre-wrap font-sans">{settings.sponsorChequeMailingAddress}</pre>
            <button
              onClick={() => handleSubmit()}
              disabled={submitting}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Submit Pledge
            </button>
          </div>
        )}
      </Section>
    </div>
  );
};

// ── Local subcomponents ──

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
    <h2 className="text-xl font-bold mb-4">{title}</h2>
    {children}
  </section>
);

const Input: React.FC<{ field: any; value: string; onChange: (v: string) => void }> = ({ field, value, onChange }) => (
  <label className="block">
    <span className="text-sm font-semibold text-slate-700">{field.label}{field.required && ' *'}</span>
    <input
      type={field.type === 'email' ? 'email' : 'text'}
      required={field.required}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
    />
  </label>
);

const QtyStepper: React.FC<{ value: number; onChange: (v: number) => void; min: number; max: number }> = ({ value, onChange, min, max }) => (
  <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="px-3 py-2 hover:bg-slate-100">−</button>
    <span className="px-4 font-semibold">{value}</span>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="px-3 py-2 hover:bg-slate-100">+</button>
  </div>
);

export default PublicSponsorForm;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Fix any errors. Common issues: missing imports, indexer usage on `(company as any)[prop]`. Adjust as needed.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/PublicSponsorForm.tsx
git commit -m "feat(sponsor): add PublicSponsorForm component with tier/ad/booth/cheque flows"
```

---

## Task 10: Wire PublicRegistration to dispatch to PublicSponsorForm

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Add the branch near the top of the component render**

In [components/PublicRegistration.tsx](../../../components/PublicRegistration.tsx), find where the form is rendered (after `if (!form) return <Loader/>` or similar). Add, at the earliest point both `form` and `settings` are guaranteed non-null:

```tsx
if (form.formType === 'sponsor' && !guestRef) {
  return <PublicSponsorForm form={form} settings={settings} />;
}
```

Import near the top:

```typescript
import PublicSponsorForm from './Sponsors/PublicSponsorForm';
```

Note: when `guestRef` is set, we keep the existing guest-claim flow — sponsor guests claim their ticket the same way event guests do.

- [ ] **Step 2: Type-check + manual verify**

```bash
npx tsc --noEmit
npm run dev
```

Manual check: Visit `/form/<sponsor-form-id>` — should see the new sponsor layout. Visit a regular event form — unchanged.

- [ ] **Step 3: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "feat(sponsor): route sponsor-typed forms to PublicSponsorForm"
```

---

## Task 11: Extend `verify-payment` edge function with sponsor branch

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Add sponsor-aware handling at the top of the function**

Open [supabase/functions/verify-payment/index.ts](../../../supabase/functions/verify-payment/index.ts). After the body-destructuring at line 52, add `sponsorMeta` and `paymentMethod` to the extracted fields:

```typescript
    const {
      paypalOrderId,
      attendees,
      formId,
      ticketQuantities,
      promoCode,
      donatedSeats: clientDonatedSeats,
      mode: clientMode,
      paymentMethod,         // NEW: 'paypal' | 'cheque' | undefined
      sponsorMeta,           // NEW: { tier, items, companyInfo, sponsoredAwards, total, hst }
      expectedAmount: legacyExpectedAmount,
      expectedCurrency: legacyExpectedCurrency,
    } = body;
```

- [ ] **Step 2: Add the sponsor pre-branch**

Immediately after `if (!attendees || attendees.length === 0)` guard, add:

```typescript
    // ── SPONSOR BRANCH: special handling before the standard event flow ──
    if (sponsorMeta) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const primary = attendees[0];
      primary.sponsor_tier = sponsorMeta.tier || null;
      primary.sponsor_items = sponsorMeta.items || [];
      primary.company_info = sponsorMeta.companyInfo || {};
      primary.sponsored_awards = sponsorMeta.sponsoredAwards || [];
      primary.payment_method = paymentMethod === 'cheque' ? 'cheque' : 'paypal';

      const computedTotal = Number(sponsorMeta.total || 0);
      const currency = 'CAD';

      // ─── CHEQUE: skip PayPal, save pending, no guest tickets yet ───
      if (paymentMethod === 'cheque') {
        primary.payment_status = 'pending';
        primary.payment_amount = `${computedTotal.toFixed(2)} ${currency} (PENDING CHEQUE)`;
        const { error } = await supabase.from('attendees').upsert([primary]);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({
          success: true,
          cheque: true,
          attendeeId: primary.id,
          total: computedTotal,
        });
      }

      // ─── PAYPAL: verify, then save sponsor + guest placeholders ───
      if (!paypalOrderId) return jsonResponse({ error: 'paypalOrderId required for PayPal sponsor payment' }, 400);

      // Reuse existing PayPal capture logic (extracted inline here for clarity)
      const paypalMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
      const allAreTest = attendees.every((a: any) => a.is_test === true);
      let useSandbox: boolean;
      if (paypalMode === 'production') useSandbox = false;
      else if (paypalMode === 'sandbox') useSandbox = true;
      else if (allAreTest) useSandbox = true;
      else {
        const origin = (req.headers.get('origin') || '').toLowerCase();
        useSandbox = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
      }
      const PAYPAL_CLIENT_ID = (useSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID')) : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
      const PAYPAL_CLIENT_SECRET = (useSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET')) : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
      const PAYPAL_API_BASE = Deno.env.get('PAYPAL_API_BASE') || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return jsonResponse({ error: 'PayPal credentials not configured' }, 500);
      }

      const authResp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!authResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
      const { access_token } = await authResp.json();

      const capResp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      });
      const capData = await capResp.json();
      if (!capResp.ok || capData.status !== 'COMPLETED') {
        return jsonResponse({ error: 'PayPal capture failed', details: capData }, 502);
      }
      const capture = capData.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) return jsonResponse({ error: 'No capture data' }, 502);
      const capturedAmount = parseFloat(capture.amount.value);
      if (Math.abs(capturedAmount - computedTotal) > 0.01) {
        return jsonResponse({ error: `Amount mismatch: expected ${computedTotal}, captured ${capturedAmount}` }, 422);
      }

      primary.payment_status = 'paid';
      primary.transaction_id = capture.id;
      primary.payment_amount = `${capturedAmount} ${capture.amount.currency_code}`;

      // Build guest placeholder rows if the tier includes seats
      const seatCount =
        sponsorMeta.tier === 'signature' ? 16 :
        sponsorMeta.tier === 'gold' || sponsorMeta.tier === 'silver' ? 8 : 0;
      const guestRows: any[] = [];
      for (let i = 1; i <= seatCount; i++) {
        guestRows.push({
          id: crypto.randomUUID(),
          form_id: primary.form_id,
          form_title: primary.form_title,
          name: `${primary.company_info?.orgName || primary.name} - Guest Ticket #${i}`,
          email: primary.email,
          ticket_type: `${sponsorMeta.tier} seat`,
          registered_at: new Date().toISOString(),
          qr_payload: JSON.stringify({ id: crypto.randomUUID() }),  // will be overwritten below
          is_primary: false,
          primary_attendee_id: primary.id,
          payment_status: 'paid',
          transaction_id: capture.id,
          is_test: false,
        });
        // QR payload must match the row's own id for scanner lookup
        guestRows[i - 1].qr_payload = JSON.stringify({ id: guestRows[i - 1].id });
      }

      const { error } = await supabase.from('attendees').upsert([primary, ...guestRows]);
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({
        success: true,
        sponsor: true,
        attendeeId: primary.id,
        transactionId: capture.id,
        guestCount: seatCount,
      });
    }
    // ── END SPONSOR BRANCH — fall through to existing event flow below ──
```

Keep everything that was previously below this line exactly as it was — the event flow remains untouched.

- [ ] **Step 3: Deploy the updated edge function**

```bash
supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs
```

Expected: deploy succeeds.

- [ ] **Step 4: Smoke test in the browser**

Run `npm run dev`. As a sponsor:
1. Open the sponsor form at `/form/<sponsor-form-id>`
2. Fill company info, pick Silver tier, pick 2 scholarships
3. Choose "Pay by Cheque" → click "Submit Pledge"

Then in Supabase SQL:

```sql
SELECT id, name, sponsor_tier, payment_status, payment_method,
       sponsor_items, company_info
FROM attendees
ORDER BY registered_at DESC LIMIT 1;
```

Expected: row with `sponsor_tier = 'silver'`, `payment_status = 'pending'`, `payment_method = 'cheque'`, `sponsor_items` containing 3 entries.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "feat(edge): add sponsor branch to verify-payment for PayPal + cheque flows"
```

---

## Task 12: Client-side email dispatch after successful sponsor submission

The edge function writes to DB, but the sponsor emails (confirmation + receipt attachment, or pledge + internal notification) are still sent client-side via `sendTicketEmail` so they can attach the PDFs that the client generates.

**Files:**
- Modify: `components/Sponsors/PublicSponsorForm.tsx`

- [ ] **Step 1: After successful `handleSubmit`, send the right emails**

In `handleSubmit`, after the line `if (error || data?.error) { throw … }` and before `setStep('success')`, add:

```typescript
      const savedAttendee: Attendee = {
        id: attendeeId,
        formId: form.id,
        formTitle: form.title,
        name: company.orgName,
        email: company.email || '',
        ticketType: ticketSummary,
        registeredAt: primaryAttendee.registered_at as string,
        qrPayload: primaryAttendee.qr_payload as string,
        isPrimary: true,
        sponsorTier: tier,
        sponsorItems: lineItems,
        paymentMethod: paymentMethod,
        companyInfo: company,
        sponsoredAwards: awardCategory ? [awardCategory] : [],
        transactionId: paymentMethod === 'paypal' ? (data as any)?.transactionId : undefined,
        paymentAmount: `${total.toFixed(2)} ${settings.currency || 'CAD'}`,
        invoiceId: primaryAttendee.invoice_id as string,
      };

      try {
        const receiptDoc = generateReceiptPDF(savedAttendee, settings, {
          status: paymentMethod === 'cheque' ? 'pending' : 'paid',
          hstLineAmount: hst,
        });
        const receiptB64 = arrayBufferToBase64(receiptDoc.output('arraybuffer') as ArrayBuffer);
        const receiptAttachment = {
          filename: `Receipt_${savedAttendee.invoiceId || savedAttendee.id.slice(0, 8)}.pdf`,
          content: receiptB64,
          contentType: 'application/pdf',
        };

        const ctx = buildSponsorEmailContext(savedAttendee, settings, {
          event: 'Hope Gala & Awards 2026',
          adminDashboardLink: window.location.origin + `/#/admin/sponsors`,
        });

        if (paymentMethod === 'cheque') {
          // Email sponsor — pledge
          await sendTicketEmail(settings, {
            to: savedAttendee.email,
            subject: mergeTemplate(settings.sponsorChequePledgeSubject, ctx),
            name: savedAttendee.companyInfo?.contactName || savedAttendee.name,
            message: mergeTemplate(settings.sponsorChequePledgeBody, ctx),
            attachments: [receiptAttachment],
          });
          // Email internal recipients — cheque request
          const internalRecipients = settings.sponsorChequeInternalRecipients.join(', ');
          await sendTicketEmail(settings, {
            to: internalRecipients,
            subject: mergeTemplate(settings.sponsorChequeInternalSubject, ctx),
            name: 'Gala Team',
            message: mergeTemplate(settings.sponsorChequeInternalBody, ctx),
            attachments: [receiptAttachment],
          });
        } else {
          // Generate ticket PDFs for tier sponsors with seats
          const seatCount = tier === 'signature' ? 16 : (tier === 'gold' || tier === 'silver') ? 8 : 0;
          const ticketAttachments: any[] = [receiptAttachment];
          // Fetch guest placeholder rows created by the edge function
          if (seatCount > 0) {
            const { data: guests } = await supabase
              .from('attendees')
              .select('*')
              .eq('primary_attendee_id', savedAttendee.id)
              .eq('is_primary', false);
            for (const g of guests || []) {
              const guestAttendee = { ...savedAttendee, id: g.id, name: g.name, qrPayload: g.qr_payload, isPrimary: false };
              const regUrl = `${window.location.origin}/#/form/${form.id}?ref=${g.id}`;
              const ticketDoc = generateTicketPDF(guestAttendee as Attendee, settings, form, regUrl);
              ticketAttachments.push({
                filename: `Ticket_${g.name.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                content: arrayBufferToBase64(ticketDoc.output('arraybuffer') as ArrayBuffer),
                contentType: 'application/pdf',
              });
            }
          }
          await sendTicketEmail(settings, {
            to: savedAttendee.email,
            subject: mergeTemplate(settings.sponsorConfirmationPaidSubject, ctx),
            name: savedAttendee.companyInfo?.contactName || savedAttendee.name,
            message: mergeTemplate(settings.sponsorConfirmationPaidBody, ctx),
            attachments: ticketAttachments,
          });
        }
      } catch (mailErr: any) {
        console.error('Sponsor email dispatch failed:', mailErr);
        showNotification(`Submission saved but email failed: ${mailErr?.message || mailErr}`, 'error');
      }
```

- [ ] **Step 2: Type-check + manual verify**

```bash
npx tsc --noEmit
```

Manual: submit a cheque sponsor form → check Supabase for row → check `gala@sicklecellanemia.ca` (or your test inbox) for both emails → check your own inbox for the pledge email + pending receipt PDF.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/PublicSponsorForm.tsx
git commit -m "feat(sponsor): send confirmation/pledge emails with receipt and ticket PDFs"
```

---

## Task 13: New edge function `confirm-sponsor-cheque`

**Files:**
- Create: `supabase/functions/confirm-sponsor-cheque/index.ts`

- [ ] **Step 1: Create the function**

```typescript
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { attendeeId } = await req.json();
    if (!attendeeId) return jsonResponse({ error: 'attendeeId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the sponsor row
    const { data: sponsor, error: fetchErr } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', attendeeId)
      .single();
    if (fetchErr || !sponsor) return jsonResponse({ error: 'Sponsor not found' }, 404);
    if (sponsor.payment_status === 'paid') return jsonResponse({ error: 'Already paid' }, 409);

    // Flip to paid
    const updates: any = {
      payment_status: 'paid',
      payment_amount: (sponsor.payment_amount || '').replace(/\s*\(PENDING CHEQUE\)/, '').trim(),
    };
    const { error: updErr } = await supabase.from('attendees').update(updates).eq('id', attendeeId);
    if (updErr) return jsonResponse({ error: updErr.message }, 500);

    // Create guest placeholder rows now (they weren't created when the pledge was submitted)
    const tier = sponsor.sponsor_tier;
    const seatCount = tier === 'signature' ? 16 : (tier === 'gold' || tier === 'silver') ? 8 : 0;
    const guestRows: any[] = [];
    if (seatCount > 0) {
      const company = sponsor.company_info || {};
      for (let i = 1; i <= seatCount; i++) {
        const gid = crypto.randomUUID();
        guestRows.push({
          id: gid,
          form_id: sponsor.form_id,
          form_title: sponsor.form_title,
          name: `${company.orgName || sponsor.name} - Guest Ticket #${i}`,
          email: sponsor.email,
          ticket_type: `${tier} seat`,
          registered_at: new Date().toISOString(),
          qr_payload: JSON.stringify({ id: gid }),
          is_primary: false,
          primary_attendee_id: sponsor.id,
          payment_status: 'paid',
          is_test: false,
        });
      }
      const { error: insErr } = await supabase.from('attendees').insert(guestRows);
      if (insErr) console.error('Guest row insert failed (continuing):', insErr);
    }

    // Return the updated sponsor + guests for the client to email out
    const { data: updatedSponsor } = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
    const { data: allGuests } = await supabase.from('attendees').select('*').eq('primary_attendee_id', attendeeId).eq('is_primary', false);

    return jsonResponse({ success: true, sponsor: updatedSponsor, guests: allGuests || [] });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'unknown' }, 500);
  }
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy confirm-sponsor-cheque --project-ref iigbgbgakevcgilucvbs
```

Expected: deploy succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/confirm-sponsor-cheque/index.ts
git commit -m "feat(edge): add confirm-sponsor-cheque function for admin cheque-received flow"
```

---

## Task 14: Sponsors dashboard shell + stats

**Files:**
- Create: `components/Sponsors/SponsorsDashboard.tsx`

- [ ] **Step 1: Create the dashboard shell**

```typescript
import React, { useEffect, useState } from 'react';
import { Handshake, DollarSign, Clock, Users, Send } from 'lucide-react';
import { Attendee, SponsorProspect, AppSettings } from '../../types';
import { getSponsorAttendees, getProspects, getSettings } from '../../services/storageService';
import SponsorsTable from './SponsorsTable';
import ProspectsTab from './ProspectsTab';
import SponsorTemplatesTab from './SponsorTemplatesTab';

const TABS = [
  { key: 'all', label: 'All Sponsors' },
  { key: 'packages', label: 'Packages' },
  { key: 'scholarships', label: 'Scholarships' },
  { key: 'ads', label: 'Advertisements' },
  { key: 'booth', label: 'Booth Space' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'templates', label: 'Templates' },
] as const;

type TabKey = typeof TABS[number]['key'];

export const SponsorsDashboard: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('all');
  const [sponsors, setSponsors] = useState<Attendee[]>([]);
  const [prospects, setProspects] = useState<SponsorProspect[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const reload = async () => {
    const [s, p, st] = await Promise.all([getSponsorAttendees(), getProspects(), getSettings()]);
    setSponsors(s); setProspects(p); setSettings(st);
  };
  useEffect(() => { reload(); }, []);

  const filtered = (() => {
    if (tab === 'all') return sponsors;
    if (tab === 'packages') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'package'));
    if (tab === 'scholarships') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'scholarship'));
    if (tab === 'ads') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'ad'));
    if (tab === 'booth') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'booth'));
    return sponsors;
  })();

  const totalRaised = sponsors.filter(s => s.paymentStatus === 'paid').reduce((sum, s) => sum + parseFloat(s.paymentAmount || '0'), 0);
  const committed = sponsors.filter(s => s.paymentStatus === 'pending').reduce((sum, s) => sum + parseFloat(s.paymentAmount || '0'), 0);
  const confirmed = sponsors.filter(s => s.paymentStatus === 'paid').length;
  const activeProspects = prospects.filter(p => p.status === 'prospect' || p.status === 'invited').length;

  return (
    <div>
      <header className="mb-8 bg-gradient-to-r from-red-700 to-red-900 p-8 rounded-3xl shadow-2xl text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-20 opacity-20 transform rotate-12 scale-150 pointer-events-none">
          <Handshake strokeWidth={1.5} className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3">SPONSORSHIP</div>
          <h2 className="text-4xl font-extrabold mb-2 drop-shadow-md">Sponsor Management</h2>
          <p className="text-red-100 text-lg max-w-lg">Track partnerships, manage outreach, and keep your gala's funding on target.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Raised" value={`$${totalRaised.toLocaleString()}`} color="emerald" />
        <StatCard icon={Clock} label="Committed (Pending)" value={`$${committed.toLocaleString()}`} color="amber" />
        <StatCard icon={Handshake} label="Confirmed Sponsors" value={String(confirmed)} color="indigo" />
        <StatCard icon={Send} label="Active Prospects" value={String(activeProspects)} color="blue" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 font-semibold text-sm whitespace-nowrap border-b-2 transition ${tab === t.key ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settings && (
        <>
          {tab === 'templates' ? (
            <SponsorTemplatesTab settings={settings} onSaved={reload} />
          ) : tab === 'prospects' ? (
            <ProspectsTab prospects={prospects} settings={settings} onChanged={reload} />
          ) : (
            <SponsorsTable sponsors={filtered} settings={settings} onChanged={reload} />
          )}
        </>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: any; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl border border-white/60">
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <Icon className={`w-5 h-5 text-${color}-500`} />
    </div>
    <div className="text-3xl font-extrabold text-slate-800">{value}</div>
  </div>
);

export default SponsorsDashboard;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Errors will appear for the three subcomponents (`SponsorsTable`, `ProspectsTab`, `SponsorTemplatesTab`) — ignore for now; we create them in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/SponsorsDashboard.tsx
git commit -m "feat(sponsor): add SponsorsDashboard shell with stats and tab routing"
```

---

## Task 15: `SponsorsTable` component

**Files:**
- Create: `components/Sponsors/SponsorsTable.tsx`

- [ ] **Step 1: Create the table**

```typescript
import React, { useState, useMemo } from 'react';
import { Attendee, AppSettings } from '../../types';
import { Eye, Check, MoreVertical, Search } from 'lucide-react';
import SponsorDetailModal from './SponsorDetailModal';
import ChequeReceivedModal from './ChequeReceivedModal';

interface Props {
  sponsors: Attendee[];
  settings: AppSettings;
  onChanged: () => void | Promise<void>;
}

export const SponsorsTable: React.FC<Props> = ({ sponsors, settings, onChanged }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'paypal' | 'cheque'>('all');
  const [detailFor, setDetailFor] = useState<Attendee | null>(null);
  const [chequeFor, setChequeFor] = useState<Attendee | null>(null);

  const filtered = useMemo(() => sponsors.filter(s => {
    if (statusFilter !== 'all' && s.paymentStatus !== statusFilter) return false;
    if (methodFilter !== 'all' && s.paymentMethod !== methodFilter && !(methodFilter === 'paypal' && s.paymentMethod === 'card')) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.companyInfo?.orgName || s.name} ${s.companyInfo?.contactName || ''} ${s.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [sponsors, search, statusFilter, methodFilter]);

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 bg-white flex-1 min-w-64">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search org, contact, email" className="outline-none flex-1" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white">
          <option value="all">All methods</option>
          <option value="paypal">Card / PayPal</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-3">Organization</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailFor(s)}>
                <td className="px-4 py-3 font-semibold">{s.companyInfo?.orgName || s.name}</td>
                <td className="px-4 py-3">{s.companyInfo?.contactName || '—'}<div className="text-xs text-slate-500">{s.email}</div></td>
                <td className="px-4 py-3"><ItemBadges items={s.sponsorItems || []} /></td>
                <td className="px-4 py-3 font-semibold">{s.paymentAmount || '—'}</td>
                <td className="px-4 py-3 capitalize">{s.paymentMethod === 'cheque' ? 'Cheque' : 'PayPal'}</td>
                <td className="px-4 py-3"><StatusBadge status={s.paymentStatus} /></td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.registeredAt).toLocaleDateString()}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setDetailFor(s)} className="text-indigo-600 hover:underline text-xs mr-2">View</button>
                  {s.paymentStatus === 'pending' && (
                    <button onClick={() => setChequeFor(s)} className="text-emerald-600 hover:underline text-xs">Mark Paid</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center p-12 text-slate-400">No sponsors yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailFor && <SponsorDetailModal attendee={detailFor} settings={settings} onClose={() => setDetailFor(null)} onChanged={onChanged} onMarkCheque={() => { setChequeFor(detailFor); setDetailFor(null); }} />}
      {chequeFor && <ChequeReceivedModal attendee={chequeFor} settings={settings} onClose={() => setChequeFor(null)} onConfirmed={async () => { setChequeFor(null); await onChanged(); }} />}
    </>
  );
};

const ItemBadges: React.FC<{ items: Attendee['sponsorItems'] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1">
    {(items || []).map(i => {
      const color = i.type === 'package' ? 'bg-red-100 text-red-700' : i.type === 'scholarship' ? 'bg-emerald-100 text-emerald-700' : i.type === 'ad' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700';
      return (
        <span key={i.key} className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
          {i.qty > 1 && `×${i.qty} `}{i.label}
        </span>
      );
    })}
  </div>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const color = status === 'paid' ? 'bg-emerald-100 text-emerald-700' : status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{status || 'unknown'}</span>;
};

export default SponsorsTable;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expect errors from missing `SponsorDetailModal` and `ChequeReceivedModal` — next tasks.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/SponsorsTable.tsx
git commit -m "feat(sponsor): add SponsorsTable with filters and status badges"
```

---

## Task 16: `SponsorDetailModal`

**Files:**
- Create: `components/Sponsors/SponsorDetailModal.tsx`

- [ ] **Step 1: Create the modal**

```typescript
import React, { useEffect, useState } from 'react';
import { Attendee, AppSettings } from '../../types';
import { X, Download, CheckCircle, Mail } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateReceiptPDF } from '../../utils/receiptGenerator';
import { updateAttendee, getSettings } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendee: Attendee;
  settings: AppSettings;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onMarkCheque: () => void;
}

const SponsorDetailModal: React.FC<Props> = ({ attendee, settings, onClose, onChanged, onMarkCheque }) => {
  const [guests, setGuests] = useState<any[]>([]);
  const [notes, setNotes] = useState(attendee.adminNotes || '');
  const { showNotification } = useNotifications();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('attendees').select('*').eq('primary_attendee_id', attendee.id).eq('is_primary', false);
      setGuests(data || []);
    })();
  }, [attendee.id]);

  const hstLine = (attendee.sponsorItems || []).filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0) * (settings.sponsorHstRate || 0.13);

  const downloadReceipt = () => {
    const doc = generateReceiptPDF(attendee, settings, {
      status: attendee.paymentStatus === 'paid' ? 'paid' : 'pending',
      hstLineAmount: hstLine,
    });
    doc.save(`Receipt_${attendee.invoiceId || attendee.id.slice(0, 8)}.pdf`);
  };

  const saveNotes = async () => {
    await updateAttendee(attendee.id, { adminNotes: notes });
    showNotification('Notes saved', 'success');
    await onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold">{attendee.companyInfo?.orgName || attendee.name}</h2>
            <p className="text-sm text-slate-500">{attendee.companyInfo?.contactName} • {attendee.email}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Items */}
          <section>
            <h3 className="font-bold mb-2">Sponsorship Items</h3>
            <table className="w-full text-sm">
              <tbody>
                {(attendee.sponsorItems || []).map(i => (
                  <tr key={i.key} className="border-b border-slate-100">
                    <td className="py-2">{i.label}{i.qty > 1 && ` × ${i.qty}`}</td>
                    <td className="py-2 text-right font-semibold">${i.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
                {hstLine > 0 && (
                  <tr><td className="py-2">HST ({((settings.sponsorHstRate || 0.13) * 100).toFixed(0)}%)</td><td className="py-2 text-right">${hstLine.toFixed(2)}</td></tr>
                )}
                <tr className="font-extrabold"><td className="py-2">Total</td><td className="py-2 text-right">{attendee.paymentAmount}</td></tr>
              </tbody>
            </table>
          </section>

          {/* Awards */}
          {(attendee.sponsoredAwards || []).length > 0 && (
            <section>
              <h3 className="font-bold mb-2">Sponsored Award</h3>
              <p>{(attendee.sponsoredAwards || []).join(', ')}</p>
            </section>
          )}

          {/* Tickets */}
          {guests.length > 0 && (
            <section>
              <h3 className="font-bold mb-2">Tickets Issued ({guests.length})</h3>
              <div className="space-y-2">
                {guests.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                    <div>
                      <div className="font-semibold">{g.name}</div>
                      <div className="text-xs text-slate-500">{g.name.includes('Guest Ticket #') ? 'Unclaimed' : 'Claimed'}</div>
                    </div>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/#/form/${attendee.formId}?ref=${g.id}`;
                        navigator.clipboard.writeText(url);
                        showNotification('Registration link copied', 'success');
                      }}
                      className="text-indigo-600 text-xs hover:underline"
                    >Copy link</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Admin notes */}
          <section>
            <h3 className="font-bold mb-2">Admin Notes</h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
              placeholder="Internal notes about this sponsor…"
            />
          </section>

          {/* Actions */}
          <section className="flex flex-wrap gap-2">
            <button onClick={downloadReceipt} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
              <Download className="w-4 h-4" /> Download Receipt
            </button>
            {attendee.paymentStatus === 'pending' && (
              <button onClick={onMarkCheque} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">
                <CheckCircle className="w-4 h-4" /> Mark Cheque Received
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SponsorDetailModal;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expect error from missing `ChequeReceivedModal` only.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/SponsorDetailModal.tsx
git commit -m "feat(sponsor): add SponsorDetailModal with items, tickets, notes, and receipt download"
```

---

## Task 17: `ChequeReceivedModal`

**Files:**
- Create: `components/Sponsors/ChequeReceivedModal.tsx`

- [ ] **Step 1: Create the modal**

```typescript
import React, { useState, useEffect } from 'react';
import { Attendee, AppSettings } from '../../types';
import { X, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateReceiptPDF } from '../../utils/receiptGenerator';
import { generateTicketPDF } from '../../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../../services/smtpService';
import { buildSponsorEmailContext, mergeTemplate } from '../../utils/sponsorEmailTemplates';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendee: Attendee;
  settings: AppSettings;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
}

const ChequeReceivedModal: React.FC<Props> = ({ attendee, settings, onClose, onConfirmed }) => {
  const { showNotification } = useNotifications();
  const [subject, setSubject] = useState(settings.sponsorChequeReceivedSubject);
  const [body, setBody] = useState(settings.sponsorChequeReceivedBody);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const ctx = buildSponsorEmailContext(attendee, settings, { event: 'Hope Gala & Awards 2026' });
    setSubject(mergeTemplate(settings.sponsorChequeReceivedSubject, ctx));
    setBody(mergeTemplate(settings.sponsorChequeReceivedBody, ctx));
  }, [attendee, settings]);

  const handleConfirm = async () => {
    setSending(true);
    try {
      // 1. Call edge function — flips to paid, creates guest rows
      const { data, error } = await supabase.functions.invoke('confirm-sponsor-cheque', { body: { attendeeId: attendee.id } });
      if (error || (data && data.error)) throw new Error(data?.error || error?.message || 'confirm-sponsor-cheque failed');

      // 2. Rebuild a full sponsor attendee (now 'paid') for PDF gen
      const updated = { ...attendee, paymentStatus: 'paid' as const };
      const hstLine = (updated.sponsorItems || []).filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0) * (settings.sponsorHstRate || 0.13);

      const receiptDoc = generateReceiptPDF(updated, settings, { status: 'paid', hstLineAmount: hstLine });
      const receiptAtt = { filename: `Receipt_${updated.invoiceId || updated.id.slice(0,8)}.pdf`, content: arrayBufferToBase64(receiptDoc.output('arraybuffer') as ArrayBuffer), contentType: 'application/pdf' };

      const attachments: any[] = [receiptAtt];
      for (const g of (data.guests || [])) {
        const guestAttendee = { ...updated, id: g.id, name: g.name, qrPayload: g.qr_payload, isPrimary: false };
        const regUrl = `${window.location.origin}/#/form/${updated.formId}?ref=${g.id}`;
        const ticketDoc = generateTicketPDF(guestAttendee as any, settings, undefined, regUrl);
        attachments.push({ filename: `Ticket_${g.name.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: arrayBufferToBase64(ticketDoc.output('arraybuffer') as ArrayBuffer), contentType: 'application/pdf' });
      }

      await sendTicketEmail(settings, {
        to: updated.email,
        subject,
        name: updated.companyInfo?.contactName || updated.name,
        message: body,
        attachments,
      });

      showNotification('Cheque confirmed and confirmation email sent.', 'success');
      await onConfirmed();
    } catch (e: any) {
      showNotification(`Failed: ${e.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Mark Cheque Received</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">This will flip the sponsor to <strong>Paid</strong>, generate guest tickets (if the tier includes seats), and send a confirmation email. Review and edit before sending.</p>
          <div>
            <label className="block text-sm font-semibold mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Email Body (HTML)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleConfirm} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirm & Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChequeReceivedModal;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Fix any import mismatches. Should compile cleanly now aside from the remaining `ProspectsTab` and `SponsorTemplatesTab` imports in the dashboard.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/ChequeReceivedModal.tsx
git commit -m "feat(sponsor): add ChequeReceivedModal with editable email and ticket issuance"
```

---

## Task 18: `ProspectsTab` + `AddProspectModal` + `SendInvitationModal`

**Files:**
- Create: `components/Sponsors/ProspectsTab.tsx`
- Create: `components/Sponsors/AddProspectModal.tsx`
- Create: `components/Sponsors/SendInvitationModal.tsx`

- [ ] **Step 1: Create `AddProspectModal.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { SponsorProspect, Form } from '../../types';
import { X } from 'lucide-react';
import { saveProspect, getForms } from '../../services/storageService';

interface Props {
  prospect?: SponsorProspect;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const AddProspectModal: React.FC<Props> = ({ prospect, onClose, onSaved }) => {
  const [p, setP] = useState<SponsorProspect>(prospect || {
    id: crypto.randomUUID(),
    orgName: '',
    contactEmail: '',
    status: 'prospect',
    emailHistory: [],
    createdAt: new Date().toISOString(),
  });
  const [forms, setForms] = useState<Form[]>([]);

  useEffect(() => { getForms().then(setForms); }, []);

  const sponsorForms = forms.filter(f => f.formType === 'sponsor');

  const handleSave = async () => {
    if (!p.orgName || !p.contactEmail) return;
    await saveProspect(p);
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">{prospect ? 'Edit' : 'Add'} Prospect</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          <Field label="Organization *"><input value={p.orgName} onChange={e => setP({ ...p, orgName: e.target.value })} className="input" /></Field>
          <Field label="Contact Name"><input value={p.contactName || ''} onChange={e => setP({ ...p, contactName: e.target.value })} className="input" /></Field>
          <Field label="Contact Title"><input value={p.contactTitle || ''} onChange={e => setP({ ...p, contactTitle: e.target.value })} className="input" /></Field>
          <Field label="Contact Email *"><input type="email" value={p.contactEmail} onChange={e => setP({ ...p, contactEmail: e.target.value })} className="input" /></Field>
          <Field label="Contact Phone"><input value={p.contactPhone || ''} onChange={e => setP({ ...p, contactPhone: e.target.value })} className="input" /></Field>
          <Field label="Sponsor Form (for invite link)">
            <select value={p.sponsorFormId || ''} onChange={e => setP({ ...p, sponsorFormId: e.target.value || null })} className="input">
              <option value="">— Select —</option>
              {sponsorForms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </Field>
          <Field label="Notes"><textarea value={p.notes || ''} onChange={e => setP({ ...p, notes: e.target.value })} rows={2} className="input" /></Field>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-red-600 text-white rounded-lg">Save</button>
        </div>
      </div>
      <style>{`.input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 14px; }`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
    {children}
  </label>
);

export default AddProspectModal;
```

- [ ] **Step 2: Create `SendInvitationModal.tsx`**

```typescript
import React, { useState, useMemo } from 'react';
import { SponsorProspect, AppSettings, Form } from '../../types';
import { X, Send, Loader2 } from 'lucide-react';
import { sendTicketEmail } from '../../services/smtpService';
import { logProspectEmail, getForms } from '../../services/storageService';
import { buildProspectEmailContext, mergeTemplate } from '../../utils/sponsorEmailTemplates';
import { useNotifications } from '../NotificationSystem';

interface Props {
  prospects: SponsorProspect[];
  settings: AppSettings;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}

const SendInvitationModal: React.FC<Props> = ({ prospects, settings, onClose, onSent }) => {
  const { showNotification } = useNotifications();
  const [subject, setSubject] = useState(settings.sponsorInvitationSubject);
  const [body, setBody] = useState(settings.sponsorInvitationBody);
  const [sending, setSending] = useState(false);
  const [forms, setForms] = useState<Form[]>([]);

  React.useEffect(() => { getForms().then(setForms); }, []);

  const preview = useMemo(() => {
    if (!prospects[0]) return { subject, body };
    const formId = prospects[0].sponsorFormId;
    const formUrl = formId ? `${window.location.origin}/#/form/${formId}` : '';
    const ctx = buildProspectEmailContext(prospects[0], formUrl);
    return { subject: mergeTemplate(subject, ctx), body: mergeTemplate(body, ctx) };
  }, [prospects, subject, body]);

  const handleSend = async () => {
    setSending(true);
    try {
      for (const p of prospects) {
        const formId = p.sponsorFormId;
        const formUrl = formId ? `${window.location.origin}/#/form/${formId}` : '';
        const ctx = buildProspectEmailContext(p, formUrl);
        const mergedSubject = mergeTemplate(subject, ctx);
        const mergedBody = mergeTemplate(body, ctx);
        await sendTicketEmail(settings, {
          to: p.contactEmail,
          subject: mergedSubject,
          name: p.contactName || p.orgName,
          message: mergedBody,
        });
        await logProspectEmail(p.id, {
          sentAt: new Date().toISOString(),
          subject: mergedSubject,
          templateKey: 'sponsor-invitation',
          recipientEmail: p.contactEmail,
        });
      }
      showNotification(`Sent ${prospects.length} invitation(s)`, 'success');
      await onSent();
      onClose();
    } catch (e: any) {
      showNotification(`Send failed: ${e.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Send Invitation ({prospects.length} recipient{prospects.length !== 1 ? 's' : ''})</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600">Recipients: {prospects.map(p => p.contactEmail).join(', ')}</div>
          <div>
            <label className="block text-sm font-semibold mb-1">Subject (template)</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Body (HTML, template)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="text-xs font-bold uppercase text-slate-500 mb-2">Preview (first recipient)</div>
            <div className="text-sm font-semibold">{preview.subject}</div>
            <div className="text-sm mt-2" dangerouslySetInnerHTML={{ __html: preview.body }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send {prospects.length} invitation{prospects.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendInvitationModal;
```

- [ ] **Step 3: Create `ProspectsTab.tsx`**

```typescript
import React, { useState } from 'react';
import { SponsorProspect, AppSettings } from '../../types';
import { Plus, Send, Edit, Trash } from 'lucide-react';
import { deleteProspect } from '../../services/storageService';
import AddProspectModal from './AddProspectModal';
import SendInvitationModal from './SendInvitationModal';

interface Props {
  prospects: SponsorProspect[];
  settings: AppSettings;
  onChanged: () => void | Promise<void>;
}

const ProspectsTab: React.FC<Props> = ({ prospects, settings, onChanged }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorProspect | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectedProspects = prospects.filter(p => selected.has(p.id));

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg">
          <Plus className="w-4 h-4" /> Add Prospect
        </button>
        <button
          onClick={() => setSendOpen(true)}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-40"
        >
          <Send className="w-4 h-4" /> Send Invitation ({selected.size})
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="px-3 py-3 w-10"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(prospects.map(p => p.id)) : new Set())} checked={selected.size === prospects.length && prospects.length > 0} /></th>
              <th className="text-left px-4 py-3">Organization</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Last Emailed</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {prospects.map(p => (
              <tr key={p.id}>
                <td className="px-3 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td className="px-4 py-3 font-semibold">{p.orgName}</td>
                <td className="px-4 py-3">{p.contactName || '—'}</td>
                <td className="px-4 py-3">{p.contactEmail}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.lastEmailedAt ? new Date(p.lastEmailedAt).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing(p)} className="text-indigo-600 text-xs mr-2"><Edit className="w-4 h-4 inline" /></button>
                  <button onClick={async () => { if (confirm('Delete prospect?')) { await deleteProspect(p.id); await onChanged(); } }} className="text-red-600 text-xs"><Trash className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-400">No prospects yet. Add one to start outreach.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(addOpen || editing) && (
        <AddProspectModal
          prospect={editing || undefined}
          onClose={() => { setAddOpen(false); setEditing(null); }}
          onSaved={onChanged}
        />
      )}
      {sendOpen && (
        <SendInvitationModal
          prospects={selectedProspects}
          settings={settings}
          onClose={() => setSendOpen(false)}
          onSent={async () => { setSelected(new Set()); await onChanged(); }}
        />
      )}
    </>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : status === 'invited' ? 'bg-blue-100 text-blue-700' : status === 'responded' ? 'bg-amber-100 text-amber-700' : status === 'declined' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{status}</span>;
};

export default ProspectsTab;
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/Sponsors/AddProspectModal.tsx components/Sponsors/SendInvitationModal.tsx components/Sponsors/ProspectsTab.tsx
git commit -m "feat(sponsor): add ProspectsTab with add/edit/delete and bulk-invite"
```

---

## Task 19: `SponsorTemplatesTab`

**Files:**
- Create: `components/Sponsors/SponsorTemplatesTab.tsx`

- [ ] **Step 1: Create the template editor**

```typescript
import React, { useState } from 'react';
import { AppSettings } from '../../types';
import { Save } from 'lucide-react';
import { saveSettings } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';

interface Props {
  settings: AppSettings;
  onSaved: () => void | Promise<void>;
}

const TEMPLATES: Array<{ key: keyof AppSettings; subjectKey: keyof AppSettings; bodyKey: keyof AppSettings; title: string; placeholders: string[] }> = [
  { key: 'sponsorInvitationSubject', subjectKey: 'sponsorInvitationSubject', bodyKey: 'sponsorInvitationBody', title: 'Sponsor Invitation', placeholders: ['orgName', 'contactName', 'event', 'eventDate', 'sponsorFormLink'] },
  { key: 'sponsorConfirmationPaidSubject', subjectKey: 'sponsorConfirmationPaidSubject', bodyKey: 'sponsorConfirmationPaidBody', title: 'Sponsor Confirmation (Paid)', placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'transactionId', 'event'] },
  { key: 'sponsorChequePledgeSubject', subjectKey: 'sponsorChequePledgeSubject', bodyKey: 'sponsorChequePledgeBody', title: 'Sponsor Cheque Pledge', placeholders: ['orgName', 'contactName', 'itemsList', 'total', 'mailingAddress', 'event'] },
  { key: 'sponsorChequeInternalSubject', subjectKey: 'sponsorChequeInternalSubject', bodyKey: 'sponsorChequeInternalBody', title: 'Cheque Notification (internal)', placeholders: ['orgName', 'contactName', 'contactEmail', 'contactPhone', 'itemsList', 'total', 'adminDashboardLink'] },
  { key: 'sponsorChequeReceivedSubject', subjectKey: 'sponsorChequeReceivedSubject', bodyKey: 'sponsorChequeReceivedBody', title: 'Cheque Received Confirmation', placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'event'] },
];

const SponsorTemplatesTab: React.FC<Props> = ({ settings, onSaved }) => {
  const { showNotification } = useNotifications();
  const [s, setS] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(s);
      showNotification('Sponsor templates saved', 'success');
      await onSaved();
    } catch (e: any) {
      showNotification(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">Internal Cheque-Notification Recipients</h3>
        <p className="text-sm text-slate-600 mb-2">These addresses receive the internal notification when a sponsor submits a cheque pledge.</p>
        <textarea
          value={(s.sponsorChequeInternalRecipients || []).join('\n')}
          onChange={e => setS({ ...s, sponsorChequeInternalRecipients: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
          rows={3}
          className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono"
          placeholder="gala@sicklecellanemia.ca&#10;communication@sicklecellanemia.ca"
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">Cheque Mailing Address</h3>
        <textarea
          value={s.sponsorChequeMailingAddress || ''}
          onChange={e => setS({ ...s, sponsorChequeMailingAddress: e.target.value })}
          rows={4}
          className="w-full border border-slate-300 rounded-lg p-2 text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">HST Rate</h3>
        <input
          type="number"
          step="0.01"
          value={s.sponsorHstRate}
          onChange={e => setS({ ...s, sponsorHstRate: parseFloat(e.target.value) || 0 })}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
        />
        <span className="ml-2 text-sm text-slate-500">e.g. 0.13 for 13%</span>
      </div>

      {TEMPLATES.map(t => (
        <div key={t.title} className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-bold mb-4">{t.title}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">SUBJECT</label>
              <input
                value={String(s[t.subjectKey] || '')}
                onChange={e => setS({ ...s, [t.subjectKey]: e.target.value } as AppSettings)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">BODY (HTML)</label>
              <textarea
                value={String(s[t.bodyKey] || '')}
                onChange={e => setS({ ...s, [t.bodyKey]: e.target.value } as AppSettings)}
                rows={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="text-xs text-slate-500">
              <strong>Placeholders:</strong> {t.placeholders.map(p => `{{${p}}}`).join(', ')}
            </div>
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
          <Save className="w-4 h-4" /> Save All Templates
        </button>
      </div>
    </div>
  );
};

export default SponsorTemplatesTab;
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors in Sponsors/ components now.

- [ ] **Step 3: Commit**

```bash
git add components/Sponsors/SponsorTemplatesTab.tsx
git commit -m "feat(sponsor): add SponsorTemplatesTab for inline template editing"
```

---

## Task 20: Register `/admin/sponsors` route + nav item

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Import icon and component**

Near the top of [App.tsx](../../../App.tsx), add to the icon import and new component import:

```typescript
import { Handshake } from 'lucide-react';
import SponsorsDashboard from './components/Sponsors/SponsorsDashboard';
```

- [ ] **Step 2: Add nav item in sidebar**

In the `<nav>` element inside `AdminLayout` (around lines 272–290), between `Manage Forms` and `Seating Chart`, add:

```tsx
<NavLink to="/admin/sponsors" icon={Handshake} collapsed={isSidebarCollapsed && !isSidebarPinned}>Sponsors</NavLink>
```

And in the mobile bottom-nav block (around lines 207–224), add a sibling link to the existing ones:

```tsx
<Link to="/admin/sponsors" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
  <Handshake className="w-6 h-6" />
</Link>
```

- [ ] **Step 3: Add route**

In the `<Routes>` block inside `AdminLayout` (around lines 306–352), add after the `/forms` route:

```tsx
<Route path="/sponsors" element={
  <SponsorsDashboard />
} />
```

- [ ] **Step 4: Type-check and manual verify**

```bash
npx tsc --noEmit
npm run dev
```

Manual: log in → click Sponsors in sidebar → verify dashboard loads, tabs work, Templates/Prospects tabs render.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat(sponsor): register /admin/sponsors route and sidebar nav"
```

---

## Task 21: "Sponsor Tickets" tab in `AttendeeList`

**Files:**
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Widen the `activeTab` type**

In [components/AttendeeList.tsx:28](../../../components/AttendeeList.tsx#L28) change:

```typescript
const [activeTab, setActiveTab] = useState<'live' | 'test' | 'donated' | 'tables'>('live');
```

to:

```typescript
const [activeTab, setActiveTab] = useState<'live' | 'test' | 'donated' | 'tables' | 'sponsor-tickets'>('live');
```

- [ ] **Step 2: Add the derived `sponsorTicketIds` set near the other `useMemo` blocks**

Just above where the filtered/visible attendees list is computed, add:

```typescript
const sponsorPrimaryIds = useMemo(
  () => new Set(attendees.filter(a => a.isPrimary && a.sponsorTier).map(a => a.id)),
  [attendees]
);
```

- [ ] **Step 3: Add the tab-filter branch inside the visible-attendees computation**

Find the place where `activeTab` is checked (e.g. `if (activeTab === 'donated')`). Add a sibling branch:

```typescript
if (activeTab === 'sponsor-tickets') {
  return list.filter(a => !a.isPrimary && a.primaryAttendeeId && sponsorPrimaryIds.has(a.primaryAttendeeId));
}
```

(Adapt to whether your variable is called `list`, `filteredAttendees`, etc. — whatever the existing filter chain uses.)

- [ ] **Step 4: Add the tab button in the UI**

Find the group of `<button>` elements rendering the existing tabs (Live / Test / Donated / Tables). Copy the pattern for one of them and add:

```tsx
<button
  onClick={() => setActiveTab('sponsor-tickets')}
  className={`[existing-class-pattern] ${activeTab === 'sponsor-tickets' ? '[active-class]' : '[inactive-class]'}`}
>
  Sponsor Tickets
</button>
```

Copy the exact class names from the neighbouring `Tables` tab button so the styling is consistent.

- [ ] **Step 5: Type-check + manual verify**

```bash
npx tsc --noEmit
npm run dev
```

Manual: after submitting a paid sponsor form as a Gold tier, navigate to `/admin` → verify 8 new guest rows appear → click "Sponsor Tickets" tab → verify only those 8 show up.

- [ ] **Step 6: Commit**

```bash
git add components/AttendeeList.tsx
git commit -m "feat(sponsor): add 'Sponsor Tickets' tab filter to AttendeeList"
```

---

## Task 22: End-to-end manual test checklist

**Files:**
- None (testing only)

- [ ] **Step 1: Happy-path Gold PayPal sponsor**

1. In admin, create a sponsor form via "Create Sponsor Form" button → confirm form saved.
2. Open `/form/<id>` in incognito.
3. Fill company info (use a real test email).
4. Pick Gold tier, choose "Nursing" award, add 2 scholarships, 1 Full Page ad.
5. Pick Credit Card / PayPal, complete PayPal sandbox checkout.
6. Verify: success screen shows; confirmation email arrives with receipt PDF + 8 ticket PDFs; dashboard shows the sponsor as paid; AttendeeList has 8 new guest rows; Sponsor Tickets tab shows them.

- [ ] **Step 2: Cheque pledge flow**

1. From the same form, submit as Silver + 1 scholarship + Half Booth with payment method = cheque.
2. Verify: success screen shows "Pledge received"; pledge email arrives with pending-receipt PDF; internal email arrives at the 3 configured addresses.
3. In admin, open Sponsors dashboard → verify row with status "Pending".
4. Click row → detail modal shows items and sponsor info with NO guest tickets yet.
5. Click "Mark Cheque Received" → modal opens with editable subject/body.
6. Edit a word in the body → click "Confirm & Send".
7. Verify: row flips to "Paid"; 8 new guest ticket rows appear in AttendeeList; confirmation email arrives at sponsor's inbox with receipt (marked Paid) + 8 ticket PDFs.

- [ ] **Step 3: Prospect invitation flow**

1. In admin Sponsors → Prospects tab → click "Add Prospect" → fill in org, email, link to sponsor form.
2. Select the checkbox → click "Send Invitation".
3. Edit subject slightly in the modal → click send.
4. Verify: the prospect's email arrives with the merged-template body + clickable link to `/form/<id>`; prospect row now shows status "Invited" + Last Emailed timestamp.

- [ ] **Step 4: Templates tab**

1. In admin → Sponsors → Templates.
2. Change the subject of "Sponsor Invitation" to something new → Save.
3. Re-run Step 3's invitation → verify the new subject is used.

- [ ] **Step 5: Record completion in a commit**

```bash
git commit --allow-empty -m "test: full sponsor management end-to-end manual test pass"
```

---

## Task 23: Final type-check and build

**Files:**
- None (verification only)

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Expected: no new errors introduced by the sponsor management work.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Tag the feature**

```bash
git tag -a v-sponsor-mgmt-2026-04-14 -m "Sponsor management feature complete"
```

(Skip this step if the user doesn't use tags.)

---

## Post-implementation notes

- **If PayPal payment succeeds but DB insert fails:** the edge function logs a CRITICAL line — search Supabase edge function logs for `CRITICAL: Payment captured but DB insert failed` and use the logged transaction id to manually create the sponsor row.
- **Logo uploads:** the sponsor-logos bucket is public-read, anon-upload. If abuse becomes an issue, tighten to authenticated-only and have the public form write via a signed URL instead.
- **Prospect CSV import:** deferred. If needed later, add a button next to "Add Prospect" that parses a pasted CSV (one row per prospect) and calls `saveProspect` for each.
- **Ad-specific artwork collection:** the form collects the selection but not the ad artwork file. Handle this via a follow-up email (manually for now; automate later if volume justifies).
