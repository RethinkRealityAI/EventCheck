# Form Template Registry + Group Registration Flow — Design

**Date:** 2026-04-16
**Status:** Design approved, ready for implementation plan
**Scope:** Phase 2 sub-project 2 (combined with 2a). Covers the form template registry + picker UX, the Individual/Group registration flow as a single form with a path selector, and the seeded GANSID Individual/Group form. Exhibitor form + staff roster (sub-project 3) is a separate spec.

## Background

GANSID Congress 2026 needs a registration form that handles two paths within one URL:
- **Individual** — a single person registering themselves
- **Group** — one contact person registering up to 5 people (themselves + up to 4 others), with the option to fill in everyone's details inline OR send each person a registration link to complete themselves

Both paths share the same field set (name, email, country, category, dietary, etc. from the GANSID PDF) and use the dynamic pricing engine shipped in Phase 2 sub-project 1. The contact pays one upfront total via PayPal covering all group members.

The existing `FormsManager` admin UI has a hardcoded "Create Sponsor Form" button. To add more pre-built forms (GANSID Individual/Group, GANSID Exhibitor later, etc.) without cluttering the UI with per-template buttons, a generic **template picker** replaces it — a modal with cards for each available template, filtered by site.

SCAGO's behavior must not change. SCAGO's existing attendee flows continue byte-identically.

## Approach: template registry + single-form path selector

Two loosely coupled pieces ship together:

1. **Form Template Registry** (`config/formTemplates.ts`) — a file-based registry of named templates. Each template is a pure function returning a partial `Form` shape (title, description, fields, settings). Adding a new template is a one-file change. Templates can declare a `siteFilter: SiteKey[]` to restrict visibility to specific deployments.

2. **Single form with path selector** (`registration-mode-selector` field type) — a new form field type that, on the public side, renders the Individual/Group choice + the group-specific UX (how-many, have-all-info toggle, same-country/category shortcuts, per-person pricing grid). Admins add this field once per form to enable the path selector.

The GANSID Individual/Group form is seeded via SQL on the GANSID Supabase project (like the pricing template seed from sub-project 1). Admins see the form pre-created in Manage Forms on day one, ready to review and publish.

### Alternatives considered

- **Separate Individual and Group forms as distinct URLs** — rejected because the GANSID PDF explicitly shows a single entry point ("Select: Individual / Group / Exhibitor") and the shared field set would force duplicate maintenance.
- **Hardcoded GANSID button alongside "Create Sponsor Form"** — rejected because it doesn't scale. Exhibitor and future templates would each need their own button, cluttering the UI.
- **Runtime database-stored templates managed in admin** — rejected as over-engineered for this phase. File-based templates are version-controlled, reviewable, and a new template is a one-PR change. Can be revisited if admins ever need to edit templates in-UI.

## Form Template Registry

### Module structure

```
config/
  formTemplates.ts                      — registry: interface + TEMPLATES array
  formTemplates/
    buildBlank.ts                        — empty form
    buildSponsorForm.ts                  — MOVED from components/Sponsors/createSponsorForm.ts
    buildGansidIndividualGroup.ts        — new
```

Moving the existing sponsor template into the registry folder is not a functional change — it's a relocation so all templates live side-by-side. The existing `components/Sponsors/createSponsorForm.ts` becomes a thin re-export or is replaced by the import from `config/formTemplates/buildSponsorForm.ts`. If the move is invasive, we can keep it in place and just have the registry import from its current path — plan decides at implementation time.

### Registry shape

```typescript
// config/formTemplates.ts

import type { Form } from '../types';
import type { SiteKey } from './sites';

export interface FormTemplate {
  key: string;
  displayName: string;
  description: string;
  siteFilter?: SiteKey[];
  build: () => Omit<Form, 'id' | 'status' | 'createdAt'>;
}

export const TEMPLATES: FormTemplate[] = [
  { key: 'blank', displayName: 'Blank form',
    description: 'Start with an empty form and add fields manually.',
    build: buildBlank },
  { key: 'sponsor', displayName: 'Sponsor form',
    description: 'Outreach, tiers, scholarship/ad/booth add-ons, PayPal or cheque.',
    build: buildSponsorForm },
  { key: 'gansid-individual-group', displayName: 'GANSID Individual + Group Registration',
    description: 'Congress registration with Individual/Group path selector and dynamic per-person pricing.',
    siteFilter: ['gansid'],
    build: buildGansidIndividualGroup },
];

export function availableTemplatesForSite(siteKey: SiteKey): FormTemplate[] {
  return TEMPLATES.filter(t => !t.siteFilter || t.siteFilter.includes(siteKey));
}
```

### Template picker UX

- `components/FormsManager.tsx` — replace the hardcoded "Create Sponsor Form" button with a single **Create Form** button that opens a modal.
- New component: `components/FormBuilder/TemplatePickerModal.tsx` — grid of cards, one per template returned from `availableTemplatesForSite(CURRENT_SITE.key)`. Each card has icon, displayName, description, and a **Use this template** button.
- On button click → call `build()` → call `createForm(partialForm)` via storageService → close modal → navigate to the new form in the builder.
- Blank template is always shown; it produces the same result as today's "Create Blank Form" behavior (which is preserved).

## Single form with Individual/Group path selector

### New field type: `registration-mode-selector`

Added to the `FormField.type` union. A form may have at most one field of this type — the form builder enforces the single-flag constraint (same pattern as the `usedForPricing` constraint on country fields). Validation error on save if more than one exists.

Config options (on `FormField` when type is `registration-mode-selector`):
```typescript
{
  type: 'registration-mode-selector',
  id: string,
  label: string,            // e.g. "How are you registering?"
  groupEnabled: boolean,    // default true — when false, field hides and form is Individual-only
  groupMaxSize: number,     // default 5; template sets 5 for GANSID
  groupLabel: string,       // e.g. "Group — up to 5 people"
  individualLabel: string,  // e.g. "Individual — just me"
}
```

### Public-form rendering

When the visitor reaches the form, the selector field renders near the top. Two radio options: Individual / Group. Selection is required to proceed.

**If Individual:** the rest of the form renders exactly as today — field-by-field in the order the admin configured. Pricing engine (if the form is linked to a pricing template) computes a single price from the visitor's country + category.

**If Group:** a group-specific section renders *below* the selector, before the rest of the form:

1. **Size picker:** "How many people total?" with options 2 through `groupMaxSize`. Selecting a size reveals the per-person grid.
2. **"Have all details now" toggle** — a checkbox defaulting to unchecked (send-links mode). When checked, per-person blocks expand to full-field mode.
3. **Same-country / same-category shortcuts:**
   ```
   ☐ All members are from the same country    [ Country dropdown ]
   ☐ All members are the same category        [ Category dropdown ]
   ```
   When a shortcut is checked, the corresponding per-person dropdown hides and the single dropdown applies to all. Toggling off reveals per-person dropdowns pre-filled with the last "same" value, so users can override one person without losing their work.
4. **Per-person blocks:**
   - **Send-links mode (default):** Name · Email · Country · Category (4 fields per person — pricing-affecting only)
   - **Have-all-details mode:** full Individual field set repeated per person (minus the path selector itself)
5. **Running total:** sum of per-person prices updates live as countries and categories change.
6. The selector field's sibling fields in the form (dietary, emergency contact, etc.) render **only** for the contact (primary) in group mode — each group member fills in their own copy via the per-person block (if inline) or via the claim link (if send-links).

### Submit + PayPal

- Submit button disabled until all required fields are filled for the chosen path:
  - **Individual:** full field set
  - **Group inline:** full field set × N
  - **Group send-links:** (Name + Email + Country + Category) × N + contact's full field set
- PayPal `createOrder` uses the computed group total (already the sum of per-person prices) as its amount
- Request body to `verify-payment` extended with `groupPricingSelections[]` (array, one per registrant) alongside the existing `pricingSelection` (used for single-person flows)

## Data model

**No new tables.** Group registrations use the existing `attendees` table + its primary/guest relationship.

On a group purchase:
- **1 primary row** (`is_primary = true`) — contact's full registration
- **N-1 guest rows** (`is_primary = false`, `primary_attendee_id = primary.id`)
  - Inline mode: each guest's full field set saved upfront
  - Send-links mode: Name + Email + Country + Category saved; all other personal fields null
- All N rows share:
  - `transaction_id` (PayPal capture ID)
  - `form_id`, `registered_at`
  - `payment_status = 'paid'`
- Each row has its own:
  - `pricing_tier`, `pricing_bracket`, `pricing_category_id`, `payment_amount` (per-person values)

### New `guest_type` value

`guest_type` column already exists and is nullable. A new value `'pending-claim'` flags send-links guests who haven't filled in their personal details yet. When a guest claims their link and completes the form, the column flips to `'claimed'` (or any existing "completed" value — plan reconciles). The admin dashboard uses this to drive the status badges.

No migration needed — `guest_type` is already `TEXT NULL`.

## Server-side verification

### `verify-payment` edge function extensions

The existing dynamic-pricing branch handles single-person registrations with `pricingSelection`. Extended to also accept `groupPricingSelections: Array<{ countryCode, categoryId, addonIds }>` for group purchases.

Server logic:

1. Detect group mode: request body has `groupPricingSelections` with length ≥ 2 AND `attendees` array of matching length.
2. For each pair `(attendee, selection)`, run the existing per-person resolve (bracket/tier/category/addons) → compute `expectedCents[i]`.
3. `groupExpectedCents = sum(expectedCents[])`.
4. Capture PayPal order, compare `capturedCents` to `groupExpectedCents` with ±1 cent tolerance. Reject on mismatch.
5. Insert all N rows in a single `supabase.from('attendees').upsert([...])` call:
   - Each row carries its per-person pricing metadata (`pricing_tier[i]`, `pricing_bracket[i]`, `pricing_category_id[i]`, `payment_amount[i]`)
   - Primary row: `is_primary = true`, other group fields
   - Guest rows: `is_primary = false`, `primary_attendee_id = primary.id`, `guest_type = 'pending-claim'` (send-links) or `null`/existing value (inline)
6. Duplicate-transaction check remains the same — reject if any attendee with this `transaction_id` already exists.
7. Return `{ ok: true, total: groupExpectedCents, primaryId, guestIds: [...] }`.

Single-person dynamic pricing (existing `pricingSelection` branch) continues to work unchanged — group handling is an additional branch that short-circuits before the single-person path.

### Claim-link flow (send-links completion)

Existing `?ref=<attendeeId>` claim flow already works (guest registration). Extended to:
- Detect `guest_type = 'pending-claim'` → render the form in "complete your registration" mode
- Pre-fill Name, Email, Country, Category fields (read-only — they locked in pricing; editing would require a refund/re-charge)
- Show the remaining personal fields (dietary, accessibility, presenting, emergency contact, consent)
- On submit: update the existing placeholder row in-place via `supabase.from('attendees').update()` (no new INSERT, no new payment) → flip `guest_type` to `'claimed'` → regenerate the ticket PDF with full details → trigger a personal confirmation email to the claiming attendee

## Emails

Existing email infrastructure (the `send-ticket-email` edge function) handles per-attendee emails. Extended to:

- **Group purchase submit:**
  - **Contact (primary):** receives one email with N ticket PDFs attached (existing multi-seat behavior)
  - **Pending-claim guests:** receive a simpler invitation email — "Your colleague {contact.name} has registered you for {event}. Please click to complete your details: {claim URL}" + the placeholder ticket PDF as an attachment
  - **Inline guests:** no individual email by default (PDF says contact handles distribution)
- **Claim completion:** the claiming guest receives a personal confirmation email with their completed ticket; contact receives a brief notification "{guest.name} has completed their registration"

A per-form setting `sendGuestConfirmationEmails: boolean` (default `false`) controls whether inline guests get individual emails. For GANSID, the default `false` matches the PDF wording; admins can flip it per-form.

No schema change needed — `sendGuestConfirmationEmails` lives in `form.settings` JSONB alongside `pricingTemplateId`, `groupPath`, etc.

## Admin dashboard

The existing attendee list uses collapsible hierarchy (primary + guests) in the "Tables" tab. This spec extends the **main attendee list** (not just Tables tab) with:

- **Collapsible group rows** — each primary row is expandable to show its linked guests, nested with indentation
- **Status badges per guest:**
  - ✅ **Completed** — `guest_type != 'pending-claim'` (claimed or inline-pre-filled)
  - ⏳ **Pending** — `guest_type = 'pending-claim'`, registration link not yet claimed
  - ✏️ **Pre-filled** — added inline by the contact, no claim needed
- **Per-guest actions** (right-side of each row):
  - Copy registration link
  - Resend invitation email
  - Manually mark as completed
- **Pricing columns on the list** — tier / bracket / category visible inline so admin can see what each person was charged without opening the detail modal

No new admin tabs. Existing tab structure (live, test, donated, tables, sponsor-tickets) unchanged.

## Seeded GANSID form

One-off SQL seed executed against the GANSID Supabase project (`gticuvgclbvhwvpzkuez`) after the feature ships:

```sql
INSERT INTO public.forms (id, title, description, status, settings, fields, form_type)
VALUES (
  'gansid-congress-2026',
  'GANSID Congress 2026 Registration',
  'October 23–25, 2026 · Hyderabad, India',
  'draft',   -- admin switches to 'active' when ready to publish
  jsonb_build_object(
    'pricingTemplateId', '<UUID of the pricing template seeded in sub-project 1>',
    'groupPath', jsonb_build_object('enabled', true, 'maxSize', 5),
    'sendGuestConfirmationEmails', false,
    'currency', 'USD'
  ),
  '[ ...complete fields array matching the GANSID PDF Individual section + the registration-mode-selector at the top... ]',
  'event'
);
```

Fields in the seed (in order):
1. `registration-mode-selector` (new type) — labels configured per GANSID PDF
2. First Name (text, required)
3. Last Name (text, required)
4. Title (select: Mr., Ms., Mrs., Dr., Prof.)
5. Email Address (email, required)
6. WhatsApp Number (phone)
7. Institution/Organization (text, required)
8. City (text)
9. Country (country field, `usedForPricing: true`, required)
10. Which days will you be attending (checkbox multi-choice: Oct 23, Oct 24, Oct 25)
11. Dietary restrictions or allergies (textarea)
12. Accessibility needs (textarea)
13. Will you be presenting (radio: Oral, Poster, Not presenting, Unsure)
14. Emergency contact name (text)
15. Emergency contact phone (phone)
16. Emergency contact relationship (text)
17. Attendee list consent (radio: Yes/No)
18. Photo/video consent (boolean, required)
19. Promotional materials consent (radio: Yes/No)
20. Code of Conduct consent (boolean, required)
21. Terms & Conditions consent (boolean, required)
22. Disclaimer & Liability consent (boolean, required)

Registration Category is NOT in the fields array — it's driven by the pricing template's category list and rendered by `LivePriceCategory` inside the `ticket` field (a placeholder ticket field is the 23rd entry, same pattern as the current event forms).

Admin opens Manage Forms, sees the form as a Draft, reviews the fields, flips status to Active → GANSID Congress registration is live.

## Backward compatibility

- SCAGO's existing forms have no `registration-mode-selector` field → the new field type never renders for them. Static event and sponsor flows continue unchanged.
- SCAGO's `FormsManager` gets the template picker modal with Blank + Sponsor cards. "Create Sponsor Form" button's behavior is preserved — it's just moved into the modal.
- Admin who had bookmarked the "Create Sponsor Form" button will click "Create Form" → pick Sponsor → same result, one extra click.
- No schema migrations required for this sub-project. `guest_type = 'pending-claim'` is a new value for an existing nullable TEXT column.
- Existing `getFormById` + pricing template attach logic is unaffected.
- verify-payment: single-person dynamic branch continues to handle SCAGO-like forms with a pricing template (none today) or GANSID individual registrations. Group branch is additive.

## Out of scope (deferred)

- Exhibitor form + staff roster (sub-project 3 — next spec)
- Dashboard tabs segmented by registration type (sub-project 4)
- Editing a group post-purchase from the admin UI (swapping registrants, refund handling)
- Payment reminders to pending-claim guests who don't click their link within N days
- `<GansidOnly>` / `<ScagoOnly>` wrapper components (user-requested backlog item)
- Saving an admin-customized form back as a reusable template (database-driven templates)
- Group size > 5 (hard cap per the GANSID PDF)
- Split-payment groups (each member pays their share via individual PayPal capture)

## Migration plan

No DB migration required. Work is entirely code + seed data:

1. Code changes on a new `feat/form-templates-group-registration` branch (per established workflow)
2. After merge, run the one-off GANSID form seed SQL against project `gticuvgclbvhwvpzkuez`
3. SCAGO project `iigbgbgakevcgilucvbs` — no seed, no schema changes
4. Both edge functions (`verify-payment`, `send-ticket-email`) redeployed to both projects with the new group branch

## Definition of done

- Template picker modal appears in place of "Create Sponsor Form" button on both sites
- GANSID admin sees "GANSID Individual + Group Registration" card in the picker (SCAGO does not)
- GANSID Individual/Group form is seeded and visible in Manage Forms as a Draft on GANSID
- Admin can publish the GANSID form; public URL works
- Individual path: end-to-end registration + payment + ticket email as single-person dynamic pricing
- Group inline path: 3-person test with mixed countries/categories → one PayPal capture for correct total → 3 attendee rows inserted with correct per-person pricing metadata → contact receives email with all 3 tickets
- Group send-links path: 3-person test with Name+Email+Country+Category entered for each → 3 attendee rows inserted (2 with `guest_type='pending-claim'`) → pending guests receive invitation emails → one guest clicks link, completes details → their row updates in place, `guest_type` flips, they receive their personal ticket email, contact gets a "completed" notification
- "Same country / same category" shortcuts behave as designed
- Admin dashboard shows collapsible group rows with status badges
- SCAGO regression: existing sponsor form creation flow works through the new picker; live SCAGO forms render unchanged
- Tests green, tsc clean, both SCAGO + GANSID builds succeed
