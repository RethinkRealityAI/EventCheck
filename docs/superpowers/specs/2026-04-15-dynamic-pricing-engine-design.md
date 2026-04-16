# Dynamic Pricing Engine — Design

**Date:** 2026-04-15
**Status:** Design approved, ready for implementation plan
**Scope:** Sub-project 1 of Phase 2 (GANSID Congress form capabilities). This spec covers the pricing engine + country field type. Subsequent sub-projects (group registration, exhibitor form, admin registration-type tabs) will have their own specs.

## Background

GANSID Congress 2026 registration requires pricing that varies by:
- **Date bracket** — Early Bird (through Jun 30), Regular (Jul 1 – Sep 15), On-site (Sep 16 – Oct 25)
- **Geographic tier** — Tier 1 (Asia, Africa, South America, Central America, Mexico) vs Tier 2 (US, Canada, Europe, Australia, NZ), detected from the registrant's country
- **Registration category** — 7 options from Physicians/Researchers through Patients/Family Members, each with its own tier × bracket matrix

That's a 7 × 2 × 3 = 42-cell pricing matrix, plus an optional Networking Reception add-on at flat $50. The existing EventCheck pricing model supports only static per-ticket prices.

SCAGO's existing events use static flat pricing and must continue to work unchanged. The pricing engine is opt-in per form.

## Approach: pricing templates as a shared system-level resource

Pricing configuration lives in a new `pricing_templates` table — one row per template, cloneable for future years. Forms opt in by setting `form.settings.pricingTemplateId`; forms that don't opt in continue using the existing static `TicketItem` flow. Admins manage templates from a new **Pricing Templates** section in Settings (only visible when the feature toggle is enabled).

This approach decouples pricing logic from form builder UI bloat, supports cloning ("GANSID Congress 2027" = duplicate 2026 + bump dates + +10% prices), and allows multiple templates per site (e.g. GANSID Congress main registration + a separate workshop pricing template).

### Alternatives considered

- **Per-form pricing config embedded in `form.settings`** — rejected. Bloats form builder UI, forces duplication for similar events, makes cross-year cloning awkward.
- **System-wide singleton pricing config in `app_settings`** — rejected. Doesn't allow two events on one site to have different pricing structures (SCAGO's hypothetical future ticketed event + GANSID Congress would collide).
- **Normalized tables** (separate tables for tiers, brackets, categories, prices) — rejected. Dataset is small (~42 prices), always read/written in bulk, never queried by individual price rows. JSONB gives atomic reads/writes, easy cloning, and simpler schema for a config blob.

## Data model

```sql
CREATE TABLE public.pricing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',              -- IANA string
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,

  tiers JSONB NOT NULL DEFAULT '[]',
  date_brackets JSONB NOT NULL DEFAULT '[]',
  active_bracket_override TEXT,                       -- bracket ID or null for auto-detect
  categories JSONB NOT NULL DEFAULT '[]',
  addons JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_can_view_templates" ON public.pricing_templates
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "admin_manage_templates" ON public.pricing_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_manage_templates" ON public.pricing_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Additive columns on `attendees`** (all nullable, backward-compatible):

```sql
ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS pricing_template_id UUID REFERENCES public.pricing_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_bracket TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS pricing_category_id TEXT;
```

These are populated by `verify-payment` after server-side price resolution and exist for auditing/reporting (not used by read paths — the registrant-facing price is always recomputed from the template).

### JSONB shapes (TypeScript source of truth)

```typescript
// types.ts additions

export interface PricingTemplate {
  id: string;
  name: string;
  timezone: string;           // IANA, e.g. "Asia/Kolkata"
  currency: string;           // ISO 4217, e.g. "USD"
  isActive: boolean;

  tiers: PricingTier[];
  dateBrackets: DateBracket[];
  activeBracketOverride: string | null;
  categories: PricingCategory[];
  addons: PricingAddon[];

  createdAt: string;
  updatedAt: string;
}

export interface PricingTier {
  id: string;                 // e.g. "tier1"
  name: string;               // e.g. "Tier 1"
  label: string;              // e.g. "Asia, Africa, South America, Central America, Mexico"
  countries: string[];        // ISO 3166-1 alpha-2 codes
}

export interface DateBracket {
  id: string;                 // e.g. "early_bird"
  name: string;               // e.g. "Early Bird Registration"
  startDate: string;          // ISO date "2026-01-01"
  endDate: string;            // ISO date "2026-06-30"
}

export interface PricingCategory {
  id: string;                 // e.g. "physician"
  name: string;               // e.g. "Physicians/Researchers"
  prices: Record<string, Record<string, number>>;
  // tier_id → bracket_id → price in minor currency units (cents for USD)
}

export interface PricingAddon {
  id: string;
  name: string;
  description: string;
  price: number;              // minor currency units
}
```

### Form linkage

`form.settings.pricingTemplateId: string | null`. Null or absent → form uses existing static `TicketItem` pricing (SCAGO's current behavior). Non-null → form uses the pricing engine; existing `TicketItem[]` on the form is ignored for the registration fee (add-ons from the template take its place).

## Pricing resolution flow (public registration)

1. **Form load** — `storageService.getFormById(id)` returns the form + its linked `PricingTemplate` (or null). Cached client-side for the session.
2. **Active bracket** — computed from `now()` in `template.timezone`; `activeBracketOverride` wins if set. Exposed as a subtle banner: "Early Bird pricing — ends June 30, 2026".
3. **Tier detection** — triggered when the registrant selects a country in the form's flagged `country` field. Looks up the ISO code in `template.tiers[].countries`. Country not found anywhere → defaults to the last tier in the `tiers` array (safe fallback — if admin forgot to classify a country, the registrant pays the higher price rather than the lower one). Admins are expected to keep country mappings complete; a follow-up sub-project may add an admin-notification when unclassified countries are hit, but that is out of scope here.
4. **Category dropdown** — each option renders with its current price: `"Physicians/Researchers — $175 USD"`. Prices update live when the registrant changes country (CSS transition, no page reload).
5. **Fee summary** — a single line appears after category selection: `"Registration fee: $175 USD (Early Bird — Tier 1)"` with an info icon that expands tooltip text explaining bracket + tier logic.
6. **Add-ons section** — checkbox rows rendered after main registration fields. Each row shows name, description, price.
7. **Running total** — total appears only after category is selected (no premature "$0"). Updates on add-on toggle.
8. **Payment** — PayPal flow captures the computed total. Client sends `{ countryCode, categoryId, addonIds[], expectedTotal }` to `verify-payment` alongside the order ID. The server re-derives tier and bracket from `countryCode` + server clock — it does NOT trust the client's tier/bracket claim.

## Server-side verification (`verify-payment`)

New branch in the edge function when `form.settings.pricingTemplateId` is present:

```
1. Load pricing template by ID
2. Resolve current bracket in template.timezone (server clock; activeBracketOverride wins)
3. Look up registrant's country → tier via template.tiers
4. Look up price = template.categories[categoryId].prices[tierId][bracketId]
5. Add selected add-on prices
6. expectedTotal = fee + add-ons
7. Fetch PayPal order details; compare capturedAmount to expectedTotal
8. Reject if |capturedAmount - expectedTotal| > 1 cent (rounding tolerance)
9. On accept: persist attendee with pricing_template_id / pricing_bracket / pricing_tier / pricing_category_id set
```

This path short-circuits the sponsor branch and the static-pricing branch; the three paths are mutually exclusive and selected by `form.form_type` + `form.settings.pricingTemplateId` presence.

## Settings UI — Pricing Templates manager

### Feature toggle
A new row in Settings → General: **Enable Pricing Templates**. When off (default), the Pricing Templates tab is hidden and form builder shows no pricing template picker. Stored in `app_settings` as `feature_pricing_templates BOOLEAN DEFAULT false`. SCAGO leaves this off; GANSID turns it on.

### Template list
Table: Name · Linked to N forms · Currency · Active bracket (auto/manual indicator) · Last modified · Actions (Edit / Duplicate / Archive).

### Template editor (single page, stacked sections)

**Section A: Basics** — name, currency dropdown, timezone dropdown (IANA list, auto-detect from browser), active bracket override (auto or force a specific bracket).

**Section B: Tiers & country mapping** — per-tier card with search-and-add country chips. Drag a country chip between tiers to reassign. Unassigned countries shown at the bottom with a warning badge — they default to the highest-price tier at resolution time. Supports ≥1 tier (minimum 1, no hard max; UI tested up to 5).

**Section C: Date brackets** — ordered list of bracket rows with inline date pickers. Green dot on the currently-active bracket. Warning banners for gaps and overlaps.

**Section D: Pricing matrix** — spreadsheet-style grid, rows = categories, columns = tier × bracket cells. Click-to-edit inline with tab-to-next-cell. Helpers: "copy row", "copy column", and "bulk adjust by %". Currency symbol from Section A.

**Add-ons block** (below the matrix) — list of name + description + price rows with +/Edit/Delete.

All changes save atomically via a single UPDATE on the `pricing_templates` row. No in-place versioning; cloning (Duplicate button) covers the version-for-next-year use case.

### Form builder integration

New tab in the form builder (or section on the existing Settings tab): **Pricing**.
- Toggle: "Use dynamic pricing" (off by default)
- When on: dropdown listing available templates
- Preview card shows: currently-active bracket, tier count, category count, currency, count of add-ons
- A flag field appears elsewhere in the form builder on any `country` field: "Used for pricing tier detection?" — only one country field per form can be flagged

## Country field type (new form-builder field)

- New field type: `country`
- Static data source: `utils/countries.ts` — ISO 3166-1 alpha-2 list of ~195 countries, bundled at build time
- Search/autocomplete input (not a native `<select>` — 195 items is too many for a native dropdown on mobile)
- Stores the ISO code in `answers[fieldId]` (e.g. `"IN"`); display name resolved on render
- Optional field config: `usedForPricing: boolean` — at most one country field per form may have this flag, enforced by the form builder with an inline warning. If a form has no flagged country field but is linked to a pricing template, the registrant lands in the fallback tier (same behavior as an unclassified country).

## Backward compatibility

- Zero schema changes to `forms` (only adds a key in `settings` JSON — nullable)
- Zero changes to existing `attendees` rows (new columns are nullable)
- Zero changes to the existing static `TicketItem` flow
- SCAGO continues to work byte-identically when `feature_pricing_templates = false`
- Any form with `pricingTemplateId == null` runs the current static flow

## Out of scope (deferred)

- Currency conversion between tiers (all prices stored in one currency per template)
- Promo codes applied to dynamic pricing (current promo codes stay on static pricing)
- Per-user pricing overrides (use `payment_status='free'` for comps)
- Multi-currency display (local currency conversion on the registration page)
- Historical pricing audit trail on template edits (Duplicate covers main use case; versioning can be added later if needed)
- Group registration mode — separate sub-project
- Exhibitor form + staff roster — separate sub-project
- Admin dashboard registration-type tabs — separate sub-project
- RLS hardening beyond what's in the initial migration (admin-role scoping to templates)

## Migration plan

One migration applied to BOTH Supabase projects (SCAGO iigbgbgakevcgilucvbs + GANSID gticuvgclbvhwvpzkuez) per the multi-site rule in CLAUDE.md:

1. `CREATE TABLE public.pricing_templates` with RLS policies as above
2. `ALTER TABLE public.attendees ADD COLUMN` × 4 (pricing_template_id, pricing_bracket, pricing_tier, pricing_category_id)
3. `ALTER TABLE public.app_settings ADD COLUMN feature_pricing_templates BOOLEAN DEFAULT false`

After deploy, one-off seed SQL for GANSID only creates the initial "GANSID Congress 2026 Pricing" template with all 42 prices + both tiers' country lists + three date brackets + Networking Reception add-on. SCAGO stays on the default (`feature_pricing_templates = false`, no template rows).

## Definition of done

- Migration applied to both Supabase projects
- Settings UI for pricing templates ships behind feature toggle; SCAGO unaffected
- Form builder exposes pricing template selector + country field type
- Public registration form renders live-updating prices as country + category change
- `verify-payment` re-computes and validates totals server-side; rejects mismatches
- GANSID template seeded with the 2026 pricing data
- A test GANSID registration successfully charges the correct amount for at least one combination of (Tier 1, Early Bird, Physician) and (Tier 2, Regular, Student), with PDFs issued and emails sent
- SCAGO live flow unchanged (flat pricing, existing TicketItem-based forms work byte-identically)
