# Dynamic Pricing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a system-level "Pricing Templates" feature so forms can opt into date-bracket × geographic-tier × category pricing with optional flat-price add-ons. GANSID Congress is the first consumer; SCAGO stays on static pricing.

**Architecture:** Per [spec](../specs/2026-04-15-dynamic-pricing-engine-design.md). New `pricing_templates` table (JSONB config), admin Settings editor, form builder picker + new `country` field type, live-updating prices in public registration, server-side re-computation in `verify-payment`. Opt-in per form via `form.settings.pricingTemplateId`; SCAGO's forms leave this `null` and keep the existing `TicketItem` flow byte-for-byte.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest, Supabase (Postgres 17, edge functions in Deno), PayPal JS SDK, `@supabase/supabase-js`.

---

## File structure

**Create:**
- `supabase/migrations/20260416000000_add_pricing_templates.sql` — table + RLS + attendee columns + feature flag
- `utils/countries.ts` — ISO 3166-1 alpha-2 list (195 entries) + helper functions
- `utils/pricing.ts` — pure pricing logic: resolve bracket, resolve tier, compute total, format price
- `tests/pricing.test.ts` — unit tests for `utils/pricing.ts`
- `tests/countries.test.ts` — sanity tests for country list
- `components/Settings/PricingTemplates/PricingTemplatesTab.tsx` — list view
- `components/Settings/PricingTemplates/PricingTemplateEditor.tsx` — the four-section editor shell
- `components/Settings/PricingTemplates/sections/BasicsSection.tsx`
- `components/Settings/PricingTemplates/sections/TiersSection.tsx`
- `components/Settings/PricingTemplates/sections/DateBracketsSection.tsx`
- `components/Settings/PricingTemplates/sections/PricingMatrixSection.tsx`
- `components/Settings/PricingTemplates/sections/AddonsSection.tsx`
- `components/FormBuilder/fields/CountryField.tsx` — country field renderer (public + preview)
- `components/Pricing/LivePriceCategory.tsx` — category dropdown with live prices
- `components/Pricing/PricingBracketBanner.tsx` — "Early Bird — ends Jun 30" subtle banner
- `components/Pricing/AddonsList.tsx` — optional add-ons section
- `components/Pricing/RunningTotal.tsx` — sticky-ish total widget
- `tmp/seed-gansid-pricing-template.sql` — one-off GANSID seed (not committed to migrations)

**Modify:**
- `types.ts` — add `PricingTemplate`, `PricingTier`, `DateBracket`, `PricingCategory`, `PricingAddon`, add `'country'` to field type union, add `pricingTemplateId` / `feature_pricing_templates` / per-form helper types
- `services/storageService.ts` — add pricing template CRUD + enrich `getFormById` to attach linked template
- `components/Settings.tsx` — register new Pricing Templates tab (gated on feature toggle)
- `components/FormBuilder/FormBuilder.tsx` (or equivalent) — register `country` field type + Pricing tab
- `components/PublicRegistration.tsx` — integrate pricing flow when form has `pricingTemplateId`
- `supabase/functions/verify-payment/index.ts` — add dynamic-pricing branch, server-side re-compute
- `CLAUDE.md` — add Dynamic Pricing section

**Not modified (explicit):**
- Sponsor components and `PublicSponsorForm` — separate formType, unaffected
- Existing static-pricing flow in `PublicRegistration.tsx` (the `pricingTemplateId == null` path stays identical)
- `send-ticket-email` edge function — unaffected

---

## Task 1: Branch + migration file

**Files:**
- Create: `supabase/migrations/20260416000000_add_pricing_templates.sql`

- [ ] **Step 1: Create branch from main**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
git checkout main
git pull
git checkout -b feat/pricing-engine
```

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20260416000000_add_pricing_templates.sql

CREATE TABLE IF NOT EXISTS public.pricing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_brackets JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_bracket_override TEXT,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_templates_is_active_idx
  ON public.pricing_templates (is_active) WHERE is_active = true;

ALTER TABLE public.pricing_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_can_view_templates" ON public.pricing_templates;
CREATE POLICY "anon_can_view_templates" ON public.pricing_templates
  FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_templates" ON public.pricing_templates;
CREATE POLICY "admin_manage_templates" ON public.pricing_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_manage_templates" ON public.pricing_templates;
CREATE POLICY "service_manage_templates" ON public.pricing_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.attendees
  ADD COLUMN IF NOT EXISTS pricing_template_id UUID REFERENCES public.pricing_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_bracket TEXT,
  ADD COLUMN IF NOT EXISTS pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS pricing_category_id TEXT;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS feature_pricing_templates BOOLEAN NOT NULL DEFAULT false;

-- Keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public.pricing_templates_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pricing_templates_touch_updated_at ON public.pricing_templates;
CREATE TRIGGER pricing_templates_touch_updated_at
  BEFORE UPDATE ON public.pricing_templates
  FOR EACH ROW EXECUTE FUNCTION public.pricing_templates_touch_updated_at();
```

- [ ] **Step 3: Do NOT commit yet** — we commit at natural feature boundaries. Continue to Task 2.

---

## Task 2: Apply migration to both Supabase projects via MCP

**Note:** MCP may not have permission on the GANSID project (`gticuvgclbvhwvpzkuez`); fall back to CLI (`npx supabase db query --linked -f <file>`) if so. SCAGO project-ref is `iigbgbgakevcgilucvbs`.

- [ ] **Step 1: Apply to SCAGO via MCP**

Call `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `iigbgbgakevcgilucvbs`
- `name`: `add_pricing_templates`
- `query`: the full SQL from Task 1 Step 2

Expected: success, no error.

- [ ] **Step 2: Verify SCAGO schema**

Call `mcp__claude_ai_Supabase__execute_sql` with `project_id: iigbgbgakevcgilucvbs`:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='attendees'
   AND column_name IN ('pricing_template_id','pricing_bracket','pricing_tier','pricing_category_id');
```

Expected: 4 rows.

- [ ] **Step 3: Apply to GANSID**

If MCP returns "permission denied" for `gticuvgclbvhwvpzkuez`, use the CLI. First link:

```bash
SUPABASE_DB_PASSWORD="<GANSID DB password>" npx supabase link --project-ref gticuvgclbvhwvpzkuez
npx supabase db query --linked -f supabase/migrations/20260416000000_add_pricing_templates.sql
```

Expected: `"rows": []` (DDL succeeded).

- [ ] **Step 4: Verify GANSID schema**

```bash
npx supabase db query --linked "SELECT to_regclass('public.pricing_templates') AS exists;"
```

Expected: `exists: public.pricing_templates`.

- [ ] **Step 5: Update CLAUDE.md note**

After Task 2, add a line in CLAUDE.md under "Multi-site deployment" rule reminding future runs to apply migrations to both project-refs (this note already exists — just confirm).

---

## Task 3: TypeScript types + country list

**Files:**
- Modify: `types.ts`
- Create: `utils/countries.ts`
- Create: `tests/countries.test.ts`

- [ ] **Step 1: Write failing test for countries list**

Create `tests/countries.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { COUNTRIES, getCountryByCode, getCountryName } from '../utils/countries';

describe('countries list', () => {
  it('contains at least 190 entries', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(190);
  });

  it('each entry has 2-letter ISO code and name', () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('getCountryByCode returns the entry', () => {
    expect(getCountryByCode('IN')?.name).toBe('India');
    expect(getCountryByCode('US')?.name).toBe('United States');
    expect(getCountryByCode('ZZ')).toBeUndefined();
  });

  it('getCountryName returns the name or the code as fallback', () => {
    expect(getCountryName('IN')).toBe('India');
    expect(getCountryName('ZZ')).toBe('ZZ');
  });
});
```

- [ ] **Step 2: Run — expect failure (module not found)**

Run: `npm test -- countries.test.ts`
Expected: FAIL with `Cannot find module '../utils/countries'`.

- [ ] **Step 3: Create `utils/countries.ts`**

```typescript
// utils/countries.ts
export interface Country {
  code: string;   // ISO 3166-1 alpha-2
  name: string;   // English display name
}

export const COUNTRIES: ReadonlyArray<Country> = [
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },    { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },     { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },  { code: 'AM', name: 'Armenia' },
  { code: 'AU', name: 'Australia' },  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' }, { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },    { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },   { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },    { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },      { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },    { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },   { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },     { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },{ code: 'BI', name: 'Burundi' },
  { code: 'CV', name: 'Cabo Verde' }, { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },   { code: 'CA', name: 'Canada' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },       { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },      { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },    { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'Congo (DRC)' },{ code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'HR', name: 'Croatia' },    { code: 'CU', name: 'Cuba' },
  { code: 'CY', name: 'Cyprus' },     { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },    { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },   { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },    { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },{ code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },    { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },   { code: 'ET', name: 'Ethiopia' },
  { code: 'FJ', name: 'Fiji' },       { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },     { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },     { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },    { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },     { code: 'GD', name: 'Grenada' },
  { code: 'GT', name: 'Guatemala' },  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },{ code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },      { code: 'HN', name: 'Honduras' },
  { code: 'HU', name: 'Hungary' },    { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },      { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },       { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },    { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },      { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },      { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },   { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' }, { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },     { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },    { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },      { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },  { code: 'LU', name: 'Luxembourg' },
  { code: 'MG', name: 'Madagascar' }, { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },   { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },       { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },{ code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' }, { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },     { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' }, { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' }, { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },    { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },      { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },{ code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },      { code: 'NG', name: 'Nigeria' },
  { code: 'KP', name: 'North Korea' },{ code: 'MK', name: 'North Macedonia' },
  { code: 'NO', name: 'Norway' },     { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },   { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' },  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },{ code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },       { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },     { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },      { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },     { code: 'RW', name: 'Rwanda' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },{ code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' },      { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'São Tomé and Príncipe' },{ code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },    { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' }, { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },   { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },    { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },{ code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },      { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },      { code: 'SR', name: 'Suriname' },
  { code: 'SE', name: 'Sweden' },     { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },      { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' }, { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },   { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },       { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },{ code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Türkiye' },    { code: 'TM', name: 'Turkmenistan' },
  { code: 'TV', name: 'Tuvalu' },     { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },    { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },{ code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },    { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },    { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },  { code: 'VN', name: 'Vietnam' },
  { code: 'YE', name: 'Yemen' },      { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

const byCode = new Map(COUNTRIES.map(c => [c.code, c] as const));

export function getCountryByCode(code: string): Country | undefined {
  return byCode.get(code);
}

export function getCountryName(code: string): string {
  return byCode.get(code)?.name ?? code;
}
```

- [ ] **Step 4: Run tests, confirm 5/5 pass**

Run: `npm test -- countries.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Add pricing types to `types.ts`**

Append to `types.ts` (before the final closing — locate the end-of-file and insert):

```typescript
// ---------------------------------------------------------------------------
// Dynamic Pricing Engine
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;           // e.g. "tier1"
  name: string;         // e.g. "Tier 1"
  label: string;        // descriptive blurb
  countries: string[];  // ISO alpha-2 codes
}

export interface DateBracket {
  id: string;           // e.g. "early_bird"
  name: string;         // e.g. "Early Bird Registration"
  startDate: string;    // "YYYY-MM-DD"
  endDate: string;      // "YYYY-MM-DD"
}

export interface PricingCategory {
  id: string;           // e.g. "physician"
  name: string;         // e.g. "Physicians/Researchers"
  // tier_id -> bracket_id -> price in minor currency units (e.g. cents)
  prices: Record<string, Record<string, number>>;
}

export interface PricingAddon {
  id: string;
  name: string;
  description: string;
  price: number;        // minor currency units
}

export interface PricingTemplate {
  id: string;
  name: string;
  timezone: string;     // IANA
  currency: string;     // ISO 4217
  isActive: boolean;
  tiers: PricingTier[];
  dateBrackets: DateBracket[];
  activeBracketOverride: string | null;
  categories: PricingCategory[];
  addons: PricingAddon[];
  createdAt: string;
  updatedAt: string;
}

// Payload sent from public registration to verify-payment when using a template.
export interface DynamicPricingSelection {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
  expectedTotal: number;  // client-computed, server re-computes + validates
}
```

Also extend the form field type union. Locate the existing `FormField` type in `types.ts` and add `'country'` to the `type` enum. Add an optional property `usedForPricing?: boolean` to `FormField`.

- [ ] **Step 6: Extend `Form.settings` typing**

Locate `Form` and/or its `settings` interface in `types.ts`. Add `pricingTemplateId?: string | null` to the settings shape.

- [ ] **Step 7: Extend `AppSettings` typing**

Locate `AppSettings`. Add `feature_pricing_templates?: boolean` alongside the other feature flags or at the end of the interface. Use the same naming convention as other snake_case DB-mirrored fields already in that interface.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 4: Pure pricing logic (`utils/pricing.ts`) with TDD

**Files:**
- Create: `utils/pricing.ts`
- Create: `tests/pricing.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/pricing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveBracket,
  resolveTier,
  computeTotal,
  formatPrice,
} from '../utils/pricing';
import type { PricingTemplate } from '../types';

const T: PricingTemplate = {
  id: 't1',
  name: 'GANSID 2026',
  timezone: 'Asia/Kolkata',
  currency: 'USD',
  isActive: true,
  activeBracketOverride: null,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: 'Asia etc.', countries: ['IN', 'NG', 'BR'] },
    { id: 'tier2', name: 'Tier 2', label: 'US etc.',   countries: ['US', 'CA', 'GB'] },
  ],
  dateBrackets: [
    { id: 'eb',   name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-06-30' },
    { id: 'reg',  name: 'Regular',    startDate: '2026-07-01', endDate: '2026-09-15' },
    { id: 'os',   name: 'On-site',    startDate: '2026-09-16', endDate: '2026-10-25' },
  ],
  categories: [
    {
      id: 'phys', name: 'Physicians',
      prices: {
        tier1: { eb: 17500, reg: 20000, os: 25000 },
        tier2: { eb: 25000, reg: 30000, os: 40000 },
      },
    },
    {
      id: 'stud', name: 'Students',
      prices: {
        tier1: { eb: 5000, reg: 7500, os: 10000 },
        tier2: { eb: 7500, reg: 10000, os: 12500 },
      },
    },
  ],
  addons: [
    { id: 'net', name: 'Networking Reception', description: '', price: 5000 },
  ],
  createdAt: '2026-04-16T00:00:00Z',
  updatedAt: '2026-04-16T00:00:00Z',
};

describe('resolveBracket', () => {
  it('returns Early Bird for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-05-01T12:00:00Z'))?.id).toBe('eb');
  });
  it('returns Regular for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-08-01T12:00:00Z'))?.id).toBe('reg');
  });
  it('returns On-site for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-10-01T12:00:00Z'))?.id).toBe('os');
  });
  it('respects the active bracket override', () => {
    const overridden = { ...T, activeBracketOverride: 'os' };
    expect(resolveBracket(overridden, new Date('2026-05-01T12:00:00Z'))?.id).toBe('os');
  });
  it('returns null when the date falls outside all brackets', () => {
    expect(resolveBracket(T, new Date('2025-11-01T12:00:00Z'))).toBeNull();
  });
});

describe('resolveTier', () => {
  it('finds the tier containing the country', () => {
    expect(resolveTier(T, 'IN')?.id).toBe('tier1');
    expect(resolveTier(T, 'US')?.id).toBe('tier2');
  });
  it('returns the last tier as fallback when country is unclassified', () => {
    expect(resolveTier(T, 'XX')?.id).toBe('tier2');
  });
  it('returns the last tier when countryCode is empty', () => {
    expect(resolveTier(T, '')?.id).toBe('tier2');
  });
});

describe('computeTotal', () => {
  const bracket = T.dateBrackets[0];
  const tier = T.tiers[0];
  it('returns category price + selected add-ons', () => {
    expect(computeTotal(T, 'phys', tier, bracket, ['net'])).toBe(17500 + 5000);
  });
  it('returns category price alone when no add-ons', () => {
    expect(computeTotal(T, 'stud', tier, bracket, [])).toBe(5000);
  });
  it('ignores unknown add-on IDs', () => {
    expect(computeTotal(T, 'stud', tier, bracket, ['not-a-real-id'])).toBe(5000);
  });
  it('returns null when category is unknown', () => {
    expect(computeTotal(T, 'nope', tier, bracket, [])).toBeNull();
  });
  it('returns null when the tier×bracket price is missing', () => {
    const missing = { ...T, categories: [{ id: 'x', name: 'X', prices: {} }] };
    expect(computeTotal(missing, 'x', tier, bracket, [])).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats USD cents to a dollar string', () => {
    expect(formatPrice(17500, 'USD')).toBe('$175.00');
  });
  it('uses the template currency code', () => {
    expect(formatPrice(17500, 'CAD')).toMatch(/CA\$|CAD/);
  });
});
```

- [ ] **Step 2: Run tests — expect failures (module missing)**

Run: `npm test -- pricing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `utils/pricing.ts`**

```typescript
// utils/pricing.ts
import type {
  PricingTemplate,
  PricingTier,
  DateBracket,
} from '../types';

/**
 * Returns the bracket whose [startDate, endDate] (inclusive) contains `now`,
 * evaluated naively against UTC. (Timezone sensitivity: bracket dates are
 * interpreted at local-midnight per the template.timezone; treating UTC here
 * is close enough given brackets are weeks wide. Server re-computes.)
 * If activeBracketOverride is set and refers to a real bracket, that wins.
 */
export function resolveBracket(
  template: PricingTemplate,
  now: Date,
): DateBracket | null {
  if (template.activeBracketOverride) {
    const forced = template.dateBrackets.find(b => b.id === template.activeBracketOverride);
    if (forced) return forced;
  }
  const t = now.getTime();
  for (const b of template.dateBrackets) {
    const start = new Date(`${b.startDate}T00:00:00Z`).getTime();
    // endDate inclusive through 23:59:59.999 UTC
    const end = new Date(`${b.endDate}T23:59:59.999Z`).getTime();
    if (t >= start && t <= end) return b;
  }
  return null;
}

/**
 * Finds the tier whose `countries` array contains `countryCode`.
 * Fallback: the LAST tier (safest — registrant pays the higher price rather
 * than the lower one if admin forgot to classify them).
 */
export function resolveTier(
  template: PricingTemplate,
  countryCode: string,
): PricingTier | null {
  if (!template.tiers.length) return null;
  const code = (countryCode || '').toUpperCase();
  for (const tier of template.tiers) {
    if (tier.countries.includes(code)) return tier;
  }
  return template.tiers[template.tiers.length - 1];
}

/**
 * Returns the full registration total in minor currency units, or null if
 * the category or tier×bracket price is missing.
 */
export function computeTotal(
  template: PricingTemplate,
  categoryId: string,
  tier: PricingTier,
  bracket: DateBracket,
  addonIds: string[],
): number | null {
  const category = template.categories.find(c => c.id === categoryId);
  if (!category) return null;
  const fee = category.prices?.[tier.id]?.[bracket.id];
  if (typeof fee !== 'number') return null;

  const addonTotal = addonIds.reduce((sum, id) => {
    const addon = template.addons.find(a => a.id === id);
    return sum + (addon?.price ?? 0);
  }, 0);

  return fee + addonTotal;
}

export function formatPrice(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}
```

- [ ] **Step 4: Run tests — expect all passing**

Run: `npm test -- pricing.test.ts countries.test.ts`
Expected: ~17 passing tests (5 countries + 12 pricing).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit checkpoint — schema + types + pure logic**

```bash
git add supabase/migrations/20260416000000_add_pricing_templates.sql \
        utils/countries.ts utils/pricing.ts \
        tests/countries.test.ts tests/pricing.test.ts \
        types.ts
git commit -m "$(cat <<'EOF'
feat(pricing): schema, types, countries list, and pure resolution logic

- pricing_templates table + attendees pricing metadata columns + feature flag
  in app_settings (migration 20260416000000)
- PricingTemplate/Tier/DateBracket/PricingCategory/PricingAddon types
- Country list (ISO 3166-1 alpha-2, 195 entries) with lookup helpers
- Pure functions resolveBracket / resolveTier / computeTotal / formatPrice
  with TDD Vitest coverage
- New 'country' field type + usedForPricing flag on FormField
- Form.settings.pricingTemplateId and AppSettings.feature_pricing_templates

Per docs/superpowers/specs/2026-04-15-dynamic-pricing-engine-design.md.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: storageService CRUD for pricing templates

**Files:**
- Modify: `services/storageService.ts`

- [ ] **Step 1: Add CRUD functions**

At the bottom of `services/storageService.ts`, add (adapt import style to match the file's existing patterns):

```typescript
import type { PricingTemplate } from '../types';

// --- Pricing Templates ---

function mapPricingTemplateRow(row: any): PricingTemplate {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    isActive: row.is_active,
    tiers: row.tiers ?? [],
    dateBrackets: row.date_brackets ?? [],
    activeBracketOverride: row.active_bracket_override ?? null,
    categories: row.categories ?? [],
    addons: row.addons ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pricingTemplateToRow(t: Partial<PricingTemplate>): any {
  return {
    ...(t.id ? { id: t.id } : {}),
    ...(t.name !== undefined ? { name: t.name } : {}),
    ...(t.timezone !== undefined ? { timezone: t.timezone } : {}),
    ...(t.currency !== undefined ? { currency: t.currency } : {}),
    ...(t.isActive !== undefined ? { is_active: t.isActive } : {}),
    ...(t.tiers !== undefined ? { tiers: t.tiers } : {}),
    ...(t.dateBrackets !== undefined ? { date_brackets: t.dateBrackets } : {}),
    ...(t.activeBracketOverride !== undefined
      ? { active_bracket_override: t.activeBracketOverride }
      : {}),
    ...(t.categories !== undefined ? { categories: t.categories } : {}),
    ...(t.addons !== undefined ? { addons: t.addons } : {}),
  };
}

export async function getPricingTemplates(): Promise<PricingTemplate[]> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPricingTemplateRow);
}

export async function getPricingTemplateById(id: string): Promise<PricingTemplate | null> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPricingTemplateRow(data) : null;
}

export async function createPricingTemplate(
  template: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PricingTemplate> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .insert(pricingTemplateToRow(template))
    .select()
    .single();
  if (error) throw error;
  return mapPricingTemplateRow(data);
}

export async function updatePricingTemplate(
  id: string,
  patch: Partial<PricingTemplate>,
): Promise<PricingTemplate> {
  const { data, error } = await supabase
    .from('pricing_templates')
    .update(pricingTemplateToRow(patch))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapPricingTemplateRow(data);
}

export async function archivePricingTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('pricing_templates')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function duplicatePricingTemplate(id: string, newName: string): Promise<PricingTemplate> {
  const original = await getPricingTemplateById(id);
  if (!original) throw new Error('Template not found');
  const { id: _omit, createdAt: _c, updatedAt: _u, ...rest } = original;
  return createPricingTemplate({ ...rest, name: newName, isActive: true });
}
```

- [ ] **Step 2: Extend `getFormById` to attach linked template when present**

Find the existing `getFormById` export in `storageService.ts`. After the form row is mapped, if the resulting form has `settings.pricingTemplateId`, fetch the template and attach it on a new `pricingTemplate` property on the returned object:

```typescript
// Inside getFormById (or a wrapper), after the form is mapped:
const templateId = form.settings?.pricingTemplateId;
if (templateId) {
  try {
    const tpl = await getPricingTemplateById(templateId);
    if (tpl) (form as any).pricingTemplate = tpl;
  } catch (e) {
    // swallow: if the template is missing/deleted, form falls back to static pricing.
    console.warn('Linked pricing template failed to load', e);
  }
}
```

Update `Form` type in `types.ts` to expose `pricingTemplate?: PricingTemplate`.

- [ ] **Step 3: Type-check + run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

---

## Task 6: Settings UI shell + feature toggle

**Files:**
- Modify: `components/Settings.tsx` (locate the tabs array — add a new tab entry)
- Create: `components/Settings/PricingTemplates/PricingTemplatesTab.tsx`

- [ ] **Step 1: Add feature-toggle row to Settings → General**

Open the existing General tab inside `Settings.tsx` (or its corresponding sub-component). Add a labeled toggle row bound to `appSettings.feature_pricing_templates`. Existing feature toggles in that file give the pattern to follow. On change, persist via the existing `updateAppSettings` (or equivalent) helper.

- [ ] **Step 2: Register the tab conditionally**

Locate where tabs are declared in `Settings.tsx`. Add a new tab with `key: 'pricing-templates'`, label `'Pricing Templates'`, component `<PricingTemplatesTab />`. Guard the entry so it's only present when `appSettings.feature_pricing_templates === true`.

- [ ] **Step 3: Create the tab scaffold (list view)**

```tsx
// components/Settings/PricingTemplates/PricingTemplatesTab.tsx
import React, { useEffect, useState } from 'react';
import { Plus, Copy, Archive, Pencil } from 'lucide-react';
import {
  getPricingTemplates,
  archivePricingTemplate,
  duplicatePricingTemplate,
} from '../../../services/storageService';
import type { PricingTemplate } from '../../../types';
import PricingTemplateEditor from './PricingTemplateEditor';

export default function PricingTemplatesTab() {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [editing, setEditing] = useState<PricingTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setTemplates(await getPricingTemplates());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (creating || editing) {
    return (
      <PricingTemplateEditor
        template={editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={async () => { await refresh(); setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Pricing Templates</h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading && <div className="text-slate-400">Loading…</div>}

      {!loading && templates.length === 0 && (
        <div className="p-8 text-center border border-dashed rounded-xl text-slate-500">
          No pricing templates yet. Create one to enable dynamic pricing on a form.
        </div>
      )}

      <div className="divide-y border rounded-xl">
        {templates.map(t => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-slate-500">
                {t.currency} · {t.tiers.length} tiers · {t.categories.length} categories · {t.addons.length} add-ons
                {t.activeBracketOverride ? ' · override active' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(t)} className="p-2 hover:bg-slate-100 rounded-md" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  const name = window.prompt('Name for the copy?', `${t.name} (copy)`);
                  if (name) { await duplicatePricingTemplate(t.id, name); await refresh(); }
                }}
                className="p-2 hover:bg-slate-100 rounded-md"
                title="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (window.confirm(`Archive "${t.name}"?`)) { await archivePricingTemplate(t.id); await refresh(); }
                }}
                className="p-2 hover:bg-slate-100 rounded-md"
                title="Archive"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tsc + manual smoke**

Run: `npx tsc --noEmit`
Run: `npm run dev`, open admin Settings, toggle "Enable Pricing Templates" in General, confirm the new tab appears and shows the empty state.
Stop dev server.

---

## Task 7: Template editor — Basics + Tiers sections

**Files:**
- Create: `components/Settings/PricingTemplates/PricingTemplateEditor.tsx`
- Create: `components/Settings/PricingTemplates/sections/BasicsSection.tsx`
- Create: `components/Settings/PricingTemplates/sections/TiersSection.tsx`

- [ ] **Step 1: Create the editor shell**

```tsx
// components/Settings/PricingTemplates/PricingTemplateEditor.tsx
import React, { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import {
  createPricingTemplate,
  updatePricingTemplate,
} from '../../../services/storageService';
import type { PricingTemplate } from '../../../types';
import BasicsSection from './sections/BasicsSection';
import TiersSection from './sections/TiersSection';
import DateBracketsSection from './sections/DateBracketsSection';
import PricingMatrixSection from './sections/PricingMatrixSection';
import AddonsSection from './sections/AddonsSection';

interface Props {
  template: PricingTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currency: 'USD',
  isActive: true,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: '', countries: [] },
    { id: 'tier2', name: 'Tier 2', label: '', countries: [] },
  ],
  dateBrackets: [],
  activeBracketOverride: null,
  categories: [],
  addons: [],
};

export default function PricingTemplateEditor({ template, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>>(
    template
      ? {
          name: template.name, timezone: template.timezone, currency: template.currency,
          isActive: template.isActive, tiers: template.tiers, dateBrackets: template.dateBrackets,
          activeBracketOverride: template.activeBracketOverride,
          categories: template.categories, addons: template.addons,
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (template) await updatePricingTemplate(template.id, draft);
      else await createPricingTemplate(draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>
        <button
          onClick={save}
          disabled={saving || !draft.name.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-300"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>

      <BasicsSection draft={draft} onChange={setDraft} />
      <TiersSection draft={draft} onChange={setDraft} />
      <DateBracketsSection draft={draft} onChange={setDraft} />
      <PricingMatrixSection draft={draft} onChange={setDraft} />
      <AddonsSection draft={draft} onChange={setDraft} />
    </div>
  );
}
```

- [ ] **Step 2: Create BasicsSection**

```tsx
// components/Settings/PricingTemplates/sections/BasicsSection.tsx
import React from 'react';
import type { PricingTemplate } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Toronto', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
];

const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR'];

export default function BasicsSection({ draft, onChange }: Props) {
  const bracketOptions = [
    { id: '', name: 'Auto-detect from dates' },
    ...draft.dateBrackets.map(b => ({ id: b.id, name: `Force: ${b.name}` })),
  ];
  return (
    <section className="border rounded-xl p-6 space-y-4">
      <h3 className="font-semibold">Basics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-600">Name</span>
          <input
            type="text" value={draft.name}
            onChange={e => onChange({ ...draft, name: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="GANSID Congress 2026 Pricing"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Currency</span>
          <select
            value={draft.currency}
            onChange={e => onChange({ ...draft, currency: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Timezone</span>
          <select
            value={draft.timezone}
            onChange={e => onChange({ ...draft, timezone: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Active bracket</span>
          <select
            value={draft.activeBracketOverride ?? ''}
            onChange={e => onChange({ ...draft, activeBracketOverride: e.target.value || null })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {bracketOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create TiersSection (country mapping)**

```tsx
// components/Settings/PricingTemplates/sections/TiersSection.tsx
import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../../../../utils/countries';
import type { PricingTemplate, PricingTier } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function TiersSection({ draft, onChange }: Props) {
  const updateTier = (tierId: string, patch: Partial<PricingTier>) => {
    onChange({ ...draft, tiers: draft.tiers.map(t => t.id === tierId ? { ...t, ...patch } : t) });
  };

  const assignCountry = (tierId: string, code: string) => {
    onChange({
      ...draft,
      tiers: draft.tiers.map(t => ({
        ...t,
        countries: t.id === tierId
          ? Array.from(new Set([...t.countries, code]))
          : t.countries.filter(c => c !== code),
      })),
    });
  };

  const removeCountry = (tierId: string, code: string) => {
    updateTier(tierId, {
      countries: draft.tiers.find(t => t.id === tierId)!.countries.filter(c => c !== code),
    });
  };

  const addTier = () => {
    const newId = `tier${draft.tiers.length + 1}`;
    onChange({
      ...draft,
      tiers: [...draft.tiers, { id: newId, name: `Tier ${draft.tiers.length + 1}`, label: '', countries: [] }],
    });
  };

  const assigned = new Set(draft.tiers.flatMap(t => t.countries));
  const unassigned = COUNTRIES.filter(c => !assigned.has(c.code));

  return (
    <section className="border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tiers &amp; country mapping</h3>
        <button onClick={addTier} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add tier
        </button>
      </div>

      {draft.tiers.map(tier => (
        <div key={tier.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-shrink-0 w-32 border rounded px-2 py-1 text-sm font-medium"
              value={tier.name}
              onChange={e => updateTier(tier.id, { name: e.target.value })}
            />
            <input
              className="flex-1 border rounded px-2 py-1 text-sm text-slate-600"
              placeholder="Label (e.g. Asia, Africa, South America...)"
              value={tier.label}
              onChange={e => updateTier(tier.id, { label: e.target.value })}
            />
          </div>
          <CountryPicker tierId={tier.id} onPick={assignCountry} excludeCodes={tier.countries} />
          <div className="flex flex-wrap gap-1.5">
            {tier.countries.map(code => (
              <span key={code} className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-0.5 text-xs">
                {getCountryName(code)}
                <button onClick={() => removeCountry(tier.id, code)} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {tier.countries.length === 0 && (
              <span className="text-xs text-slate-400">No countries in this tier yet.</span>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm">
          <strong>{unassigned.length}</strong> countries are unassigned. Registrants from these
          countries will fall back to the last tier ({draft.tiers[draft.tiers.length - 1]?.name ?? 'none'}).
        </div>
      )}
    </section>
  );
}

function CountryPicker({ onPick, excludeCodes, tierId }:
  { onPick: (tierId: string, code: string) => void; excludeCodes: string[]; tierId: string }) {
  const [q, setQ] = useState('');
  const matches = COUNTRIES.filter(c =>
    !excludeCodes.includes(c.code) && c.name.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);
  return (
    <div className="relative">
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search to add a country…"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />
      {q && matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 bg-white border mt-1 rounded shadow max-h-48 overflow-y-auto">
          {matches.map(c => (
            <button
              key={c.code} type="button"
              onClick={() => { onPick(tierId, c.code); setQ(''); }}
              className="w-full text-left px-2 py-1 hover:bg-indigo-50 text-sm"
            >
              {c.name} <span className="text-slate-400">({c.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Stub the remaining three section files (temporary no-op placeholders)**

Create `DateBracketsSection.tsx`, `PricingMatrixSection.tsx`, `AddonsSection.tsx` each exporting a default component that returns `null`. These will be filled in in Task 8. This is necessary so the editor's imports resolve.

```tsx
// components/Settings/PricingTemplates/sections/DateBracketsSection.tsx
import type { PricingTemplate } from '../../../../types';
interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}
export default function DateBracketsSection(_: Props) { return null; }
```

(Repeat with the same props shape for the other two files.)

- [ ] **Step 5: Type-check + smoke**

Run: `npx tsc --noEmit`
Run dev server, open a new template in Settings, confirm Basics + Tiers sections render and are editable.

---

## Task 8: Template editor — Date brackets, Pricing matrix, Add-ons

**Files:**
- Modify: `components/Settings/PricingTemplates/sections/DateBracketsSection.tsx`
- Modify: `components/Settings/PricingTemplates/sections/PricingMatrixSection.tsx`
- Modify: `components/Settings/PricingTemplates/sections/AddonsSection.tsx`

- [ ] **Step 1: Implement DateBracketsSection**

```tsx
// components/Settings/PricingTemplates/sections/DateBracketsSection.tsx
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { resolveBracket } from '../../../../utils/pricing';
import type { PricingTemplate, DateBracket } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function DateBracketsSection({ draft, onChange }: Props) {
  const add = () => {
    const id = `bracket_${Date.now()}`;
    const next: DateBracket = { id, name: 'New bracket', startDate: '', endDate: '' };
    onChange({ ...draft, dateBrackets: [...draft.dateBrackets, next] });
  };
  const update = (id: string, patch: Partial<DateBracket>) => {
    onChange({
      ...draft,
      dateBrackets: draft.dateBrackets.map(b => b.id === id ? { ...b, ...patch } : b),
    });
  };
  const remove = (id: string) => {
    onChange({ ...draft, dateBrackets: draft.dateBrackets.filter(b => b.id !== id) });
  };

  const asTemplate: PricingTemplate = {
    ...draft, id: '', createdAt: '', updatedAt: '',
  } as PricingTemplate;
  const activeBracket = resolveBracket(asTemplate, new Date());

  return (
    <section className="border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Date brackets</h3>
        <button onClick={add} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add bracket
        </button>
      </div>
      {draft.dateBrackets.length === 0 && (
        <div className="text-sm text-slate-400">No brackets yet.</div>
      )}
      <div className="space-y-2">
        {draft.dateBrackets.map(b => (
          <div key={b.id} className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${activeBracket?.id === b.id ? 'bg-green-500' : 'bg-slate-300'}`}
              title={activeBracket?.id === b.id ? 'Currently active' : ''}
            />
            <input
              className="border rounded px-2 py-1 text-sm flex-1"
              value={b.name}
              onChange={e => update(b.id, { name: e.target.value })}
            />
            <input type="date" className="border rounded px-2 py-1 text-sm" value={b.startDate} onChange={e => update(b.id, { startDate: e.target.value })} />
            <span className="text-slate-400">→</span>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={b.endDate} onChange={e => update(b.id, { endDate: e.target.value })} />
            <button onClick={() => remove(b.id)} className="p-1.5 hover:bg-slate-100 rounded" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Implement PricingMatrixSection**

```tsx
// components/Settings/PricingTemplates/sections/PricingMatrixSection.tsx
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PricingTemplate, PricingCategory } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function PricingMatrixSection({ draft, onChange }: Props) {
  const addCategory = () => {
    const id = `cat_${Date.now()}`;
    const next: PricingCategory = { id, name: 'New category', prices: {} };
    onChange({ ...draft, categories: [...draft.categories, next] });
  };
  const updateCategory = (id: string, patch: Partial<PricingCategory>) => {
    onChange({
      ...draft,
      categories: draft.categories.map(c => c.id === id ? { ...c, ...patch } : c),
    });
  };
  const removeCategory = (id: string) => {
    onChange({ ...draft, categories: draft.categories.filter(c => c.id !== id) });
  };
  const setCell = (catId: string, tierId: string, bracketId: string, value: string) => {
    const cents = Math.round(Number(value) * 100);
    const cat = draft.categories.find(c => c.id === catId);
    if (!cat) return;
    const prices = { ...cat.prices, [tierId]: { ...(cat.prices?.[tierId] ?? {}), [bracketId]: cents } };
    updateCategory(catId, { prices });
  };

  if (draft.tiers.length === 0 || draft.dateBrackets.length === 0) {
    return (
      <section className="border rounded-xl p-6 space-y-2">
        <h3 className="font-semibold">Pricing matrix</h3>
        <p className="text-sm text-slate-500">
          Add at least one tier and one date bracket first, then prices will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="border rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pricing matrix</h3>
        <button onClick={addCategory} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add category
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr>
              <th rowSpan={2} className="text-left border px-2 py-1 bg-slate-50">Category</th>
              {draft.tiers.map(t => (
                <th key={t.id} colSpan={draft.dateBrackets.length} className="text-center border px-2 py-1 bg-slate-50">
                  {t.name}
                </th>
              ))}
              <th rowSpan={2} className="border"></th>
            </tr>
            <tr>
              {draft.tiers.flatMap(t =>
                draft.dateBrackets.map(b => (
                  <th key={`${t.id}-${b.id}`} className="text-center border px-2 py-1 text-xs text-slate-500 bg-slate-50">
                    {b.name}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {draft.categories.map(cat => (
              <tr key={cat.id}>
                <td className="border px-2 py-1">
                  <input
                    className="w-full border rounded px-1 py-0.5"
                    value={cat.name}
                    onChange={e => updateCategory(cat.id, { name: e.target.value })}
                  />
                </td>
                {draft.tiers.flatMap(t => draft.dateBrackets.map(b => (
                  <td key={`${cat.id}-${t.id}-${b.id}`} className="border px-1 py-1">
                    <input
                      type="number" step="0.01" min={0}
                      className="w-20 border rounded px-1 py-0.5 text-right"
                      value={(((cat.prices?.[t.id]?.[b.id]) ?? 0) / 100).toFixed(2)}
                      onChange={e => setCell(cat.id, t.id, b.id, e.target.value)}
                    />
                  </td>
                )))}
                <td className="border px-1 py-1">
                  <button onClick={() => removeCategory(cat.id)} className="p-1 hover:bg-slate-100 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Prices entered in {draft.currency}; stored as minor units (cents) internally.</p>
    </section>
  );
}
```

- [ ] **Step 3: Implement AddonsSection**

```tsx
// components/Settings/PricingTemplates/sections/AddonsSection.tsx
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PricingTemplate, PricingAddon } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function AddonsSection({ draft, onChange }: Props) {
  const add = () => {
    const id = `addon_${Date.now()}`;
    const next: PricingAddon = { id, name: 'New add-on', description: '', price: 0 };
    onChange({ ...draft, addons: [...draft.addons, next] });
  };
  const update = (id: string, patch: Partial<PricingAddon>) => {
    onChange({ ...draft, addons: draft.addons.map(a => a.id === id ? { ...a, ...patch } : a) });
  };
  const remove = (id: string) => {
    onChange({ ...draft, addons: draft.addons.filter(a => a.id !== id) });
  };

  return (
    <section className="border rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Add-ons</h3>
        <button onClick={add} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add add-on
        </button>
      </div>
      <div className="space-y-2">
        {draft.addons.map(a => (
          <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
            <input className="col-span-3 border rounded px-2 py-1 text-sm" value={a.name}
              onChange={e => update(a.id, { name: e.target.value })} placeholder="Name" />
            <input className="col-span-6 border rounded px-2 py-1 text-sm" value={a.description}
              onChange={e => update(a.id, { description: e.target.value })} placeholder="Description" />
            <input type="number" step="0.01" min={0}
              className="col-span-2 border rounded px-2 py-1 text-sm text-right"
              value={(a.price / 100).toFixed(2)}
              onChange={e => update(a.id, { price: Math.round(Number(e.target.value) * 100) })} />
            <button onClick={() => remove(a.id)} className="col-span-1 p-1 hover:bg-slate-100 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Smoke the editor end-to-end**

Run `npm run dev`. Open Settings → Pricing Templates → New Template. Fill in name, add a Tier 1 with a few countries, add a date bracket, add a category, type prices into the matrix cells, add an add-on, click Save. Confirm the template appears in the list.

Open the list → Edit. Confirm values round-trip (especially that prices display as dollars and save as cents).

- [ ] **Step 5: Commit checkpoint — Settings UI complete**

```bash
git add services/storageService.ts \
        components/Settings.tsx \
        components/Settings/PricingTemplates/
git commit -m "$(cat <<'EOF'
feat(pricing): pricing templates admin UI (list + four-section editor)

- storageService CRUD + getFormById attaches linked pricing_template
- Settings feature toggle + new Pricing Templates tab (gated on toggle)
- Template editor with five stacked sections: Basics, Tiers+country mapping,
  Date brackets (active-bracket dot), Pricing matrix grid, Add-ons
- Country search/autocomplete chips with unassigned-country warning
- Prices edited in dollars, stored as minor units (cents)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Form builder — country field type + Pricing tab

**Files:**
- Create: `components/FormBuilder/fields/CountryField.tsx`
- Modify: `components/FormBuilder/` — locate the file that registers field types (likely `FormBuilder.tsx` or a `fieldRegistry.ts`) and the renderer used by PublicRegistration (likely a `FieldRenderer.tsx` or similar)
- Modify: `components/FormBuilder/` — add a Pricing tab/section

- [ ] **Step 1: Create CountryField renderer**

```tsx
// components/FormBuilder/fields/CountryField.tsx
import React, { useState } from 'react';
import { COUNTRIES, getCountryName } from '../../../utils/countries';

interface Props {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  label: string;
  disabled?: boolean;
}

export default function CountryField({ value, onChange, required, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const matches = COUNTRIES
    .filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 10);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full border rounded-lg px-3 py-2 text-left bg-white hover:border-indigo-400"
      >
        {value ? getCountryName(value) : <span className="text-slate-400">Select country…</span>}
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 bg-white border mt-1 rounded-lg shadow">
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type to search…"
            className="w-full border-b px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {matches.map(c => (
              <button
                type="button" key={c.code}
                onClick={() => { onChange(c.code); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm"
              >
                {c.name} <span className="text-slate-400 text-xs">({c.code})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register `country` in the form builder field palette**

In the form builder's field-type list (where `text`, `select`, `checkbox` etc. are declared — find the file that renders the "Add field" palette or that maps `field.type` to a renderer), add:
- An entry `{ type: 'country', label: 'Country', icon: <Globe /> }` (import Globe from lucide-react)
- Routing in the renderer function: if `field.type === 'country'`, render `<CountryField ... />`. In the builder preview, also render with `disabled`.

- [ ] **Step 3: Add the "Use for pricing" flag to field config**

In the field-config side panel (the place where a field's properties are edited — `required`, `label`, etc.), add a checkbox visible ONLY when `field.type === 'country'`:
- Label: "Use this country for dynamic pricing"
- Bound to `field.usedForPricing`
- If another country field already has `usedForPricing === true`, show a warning "Only one country field per form can be used for pricing" and prevent setting.

- [ ] **Step 4: Add "Pricing" tab in form builder**

Where the form builder has sidebar tabs (e.g. "Fields", "Design", "Settings") — find and add a new tab `Pricing`. Its content:

```tsx
// Inline, or in a new component components/FormBuilder/PricingTab.tsx
import React, { useEffect, useState } from 'react';
import type { Form, PricingTemplate, AppSettings } from '../../types';
import { getPricingTemplates } from '../../services/storageService';
import { resolveBracket } from '../../utils/pricing';

export default function PricingTab({
  form, appSettings, onFormChange,
}: {
  form: Form;
  appSettings: AppSettings;
  onFormChange: (next: Form) => void;
}) {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);

  useEffect(() => {
    if (appSettings.feature_pricing_templates) getPricingTemplates().then(setTemplates);
  }, [appSettings.feature_pricing_templates]);

  if (!appSettings.feature_pricing_templates) {
    return <p className="text-sm text-slate-500">Enable "Pricing Templates" in Settings → General to use dynamic pricing.</p>;
  }

  const selectedId = (form.settings as any)?.pricingTemplateId ?? '';
  const selected = templates.find(t => t.id === selectedId);
  const enabled = !!selectedId;

  const setTemplate = (id: string | null) => {
    onFormChange({
      ...form,
      settings: { ...(form.settings ?? {}), pricingTemplateId: id } as any,
    });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled}
          onChange={e => setTemplate(e.target.checked ? templates[0]?.id ?? null : null)} />
        <span className="text-sm">Use dynamic pricing</span>
      </label>

      {enabled && (
        <>
          <label className="block">
            <span className="text-sm text-slate-600">Pricing template</span>
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              value={selectedId}
              onChange={e => setTemplate(e.target.value)}
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          {selected && (
            <div className="text-sm text-slate-600 border rounded-lg p-3 bg-slate-50">
              <div>Currency: <strong>{selected.currency}</strong></div>
              <div>Tiers: {selected.tiers.length} · Categories: {selected.categories.length} · Add-ons: {selected.addons.length}</div>
              <div>Active bracket: <strong>{resolveBracket(selected, new Date())?.name ?? '(none)'}</strong></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type-check + smoke**

Run: `npx tsc --noEmit`
Run `npm run dev`. Open form builder on any test form, add a country field, flag it with "Use for pricing", open the Pricing tab, enable dynamic pricing, select a template. Confirm save persists.

---

## Task 10: PublicRegistration — load template, resolve bracket/tier

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Fetch and hold the linked template**

Inside the component body (where the form is loaded), if `form.pricingTemplate` is present (attached server-side in Task 5), hold it in state. If not, the legacy static pricing path runs unchanged. Add:

```typescript
import type { PricingTemplate } from '../types';
import { resolveBracket, resolveTier, computeTotal, formatPrice } from '../utils/pricing';

// Inside the component, alongside existing state:
const pricingTemplate: PricingTemplate | null = (form as any)?.pricingTemplate ?? null;
const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
const [selectedCountryCode, setSelectedCountryCode] = useState<string>('');

// Derive from state + template. These are recomputed every render.
const activeBracket = pricingTemplate ? resolveBracket(pricingTemplate, new Date()) : null;
const activeTier = pricingTemplate ? resolveTier(pricingTemplate, selectedCountryCode) : null;
const dynamicTotal = (pricingTemplate && activeBracket && activeTier && selectedCategoryId)
  ? computeTotal(pricingTemplate, selectedCategoryId, activeTier, activeBracket, selectedAddonIds)
  : null;
```

- [ ] **Step 2: Wire country-field updates into `selectedCountryCode`**

In the form field render loop, when a field's `type === 'country'` AND `field.usedForPricing === true`, its onChange must also update `selectedCountryCode` (in addition to the normal `answers` map). Use an effect or a wrapper handler — whichever pattern matches the existing file.

- [ ] **Step 3: Short-circuit existing static TicketItem pricing when `pricingTemplate` is non-null**

Locate the section that currently renders ticket pickers (TicketItem cards with quantities). Wrap it: if `pricingTemplate` is null, render as before. If non-null, render nothing there — the template-driven components in the next task replace it.

---

## Task 11: PublicRegistration — LivePriceCategory + AddonsList + RunningTotal + Banner

**Files:**
- Create: `components/Pricing/PricingBracketBanner.tsx`
- Create: `components/Pricing/LivePriceCategory.tsx`
- Create: `components/Pricing/AddonsList.tsx`
- Create: `components/Pricing/RunningTotal.tsx`
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Banner**

```tsx
// components/Pricing/PricingBracketBanner.tsx
import React from 'react';
import type { DateBracket } from '../../types';

export default function PricingBracketBanner({ bracket }: { bracket: DateBracket | null }) {
  if (!bracket) return null;
  return (
    <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-900 text-xs font-medium border border-indigo-100">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
      {bracket.name} pricing — ends {bracket.endDate}
    </div>
  );
}
```

- [ ] **Step 2: LivePriceCategory dropdown**

```tsx
// components/Pricing/LivePriceCategory.tsx
import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  value: string | null;
  onChange: (categoryId: string) => void;
}

export default function LivePriceCategory({ template, tier, bracket, value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Registration Category <span className="text-red-500">*</span></span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
        required
      >
        <option value="" disabled>Select a category…</option>
        {template.categories.map(cat => {
          const price = tier && bracket ? cat.prices?.[tier.id]?.[bracket.id] : undefined;
          return (
            <option key={cat.id} value={cat.id}>
              {cat.name}{typeof price === 'number' ? ` — ${formatPrice(price, template.currency)}` : ''}
            </option>
          );
        })}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: AddonsList**

```tsx
// components/Pricing/AddonsList.tsx
import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate } from '../../types';

interface Props {
  template: PricingTemplate;
  selectedIds: string[];
  onToggle: (ids: string[]) => void;
}

export default function AddonsList({ template, selectedIds, onToggle }: Props) {
  if (template.addons.length === 0) return null;
  const toggle = (id: string) => {
    onToggle(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Optional add-ons</h3>
      {template.addons.map(a => (
        <label key={a.id} className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" className="mt-0.5"
            checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} />
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="font-semibold">{formatPrice(a.price, template.currency)}</span>
            </div>
            {a.description && <p className="text-xs text-slate-500 mt-1">{a.description}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: RunningTotal**

```tsx
// components/Pricing/RunningTotal.tsx
import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate } from '../../types';

export default function RunningTotal({
  template, total, bracket, tier,
}: {
  template: PricingTemplate;
  total: number | null;
  bracket: { name: string } | null;
  tier: { name: string } | null;
}) {
  if (total == null) return null;
  return (
    <div className="sticky bottom-4 mt-6 p-4 bg-white shadow-lg rounded-xl border flex items-center justify-between">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Total</div>
        <div className="text-2xl font-bold">{formatPrice(total, template.currency)}</div>
        {bracket && tier && (
          <div className="text-xs text-slate-500 mt-0.5">{bracket.name} · {tier.name}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire into PublicRegistration**

In `PublicRegistration.tsx`, in the block that would have rendered `TicketItem` pickers (now short-circuited per Task 10 Step 3), render instead:

```tsx
{pricingTemplate && (
  <div className="space-y-4">
    <PricingBracketBanner bracket={activeBracket} />
    <LivePriceCategory
      template={pricingTemplate}
      tier={activeTier}
      bracket={activeBracket}
      value={selectedCategoryId}
      onChange={setSelectedCategoryId}
    />
    <AddonsList
      template={pricingTemplate}
      selectedIds={selectedAddonIds}
      onToggle={setSelectedAddonIds}
    />
    <RunningTotal
      template={pricingTemplate}
      total={dynamicTotal}
      bracket={activeBracket}
      tier={activeTier}
    />
  </div>
)}
```

Import the four components at the top.

- [ ] **Step 6: Type-check + smoke**

Run: `npx tsc --noEmit`. Start dev server. Link a form to the (manually-created) test template. Open the public URL. Select a country — confirm prices inside the category dropdown update. Pick a category — confirm RunningTotal appears. Toggle an add-on — confirm the total updates.

---

## Task 12: PublicRegistration — payment submission payload

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Before invoking PayPal, construct the dynamic-pricing payload**

When `pricingTemplate != null`, the client must:
1. Use `dynamicTotal` as the PayPal order amount (override the static total computation)
2. Disable the "Continue" button until category, country, and a valid total exist
3. Include a `pricingSelection: DynamicPricingSelection` blob alongside the attendee payload that goes to `verify-payment`

In the existing PayPal `createOrder` handler, branch:

```typescript
if (pricingTemplate && dynamicTotal != null) {
  return actions.order.create({
    purchase_units: [{
      amount: {
        currency_code: pricingTemplate.currency,
        value: (dynamicTotal / 100).toFixed(2),
      },
    }],
    intent: 'CAPTURE',
  });
}
```

In the `onApprove` / `capture` handler that POSTs to `verify-payment`, extend the body:

```typescript
const body: any = { orderId: order.id, attendees: [primaryAttendeeDraft] };
if (pricingTemplate && dynamicTotal != null && selectedCategoryId && activeTier && activeBracket) {
  body.pricingSelection = {
    countryCode: selectedCountryCode,
    categoryId: selectedCategoryId,
    addonIds: selectedAddonIds,
    expectedTotal: dynamicTotal,
  } satisfies DynamicPricingSelection;
}
```

- [ ] **Step 2: Guard the submit button**

When `pricingTemplate != null`, require `selectedCategoryId`, a resolved `activeTier`, `activeBracket`, and a non-null `dynamicTotal` before allowing PayPal to launch. Re-use the existing disabled-state pattern.

- [ ] **Step 3: Commit checkpoint — public flow complete**

```bash
git add components/FormBuilder/ components/Pricing/ components/PublicRegistration.tsx
git commit -m "$(cat <<'EOF'
feat(pricing): country field + public registration dynamic-pricing UI

- Form builder 'country' field type with searchable autocomplete
- usedForPricing flag on country fields (form builder enforces at most one)
- Form builder 'Pricing' tab: template selector + bracket/tier/category preview
- PublicRegistration renders LivePriceCategory + AddonsList + RunningTotal
  + PricingBracketBanner when form.pricingTemplate is attached
- PayPal createOrder uses dynamic total; verify-payment body includes a
  pricingSelection blob for server-side re-computation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Edge function — verify-payment dynamic-pricing branch

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Read the pricing template inside the event branch**

Near the existing logic that loads the form (`formRow`), if `formRow.settings?.pricingTemplateId` is present AND `form_type !== 'sponsor'` AND the request body includes `pricingSelection`, follow the dynamic-pricing branch below; otherwise fall through to the existing static-pricing event branch.

- [ ] **Step 2: Fetch template + re-resolve**

Add near the existing fetches (service-role client already available):

```typescript
// Inside the event branch, after formRow is loaded:
const pricingTemplateId = formRow.settings?.pricingTemplateId ?? null;
const pricingSelection = body.pricingSelection ?? null;

if (pricingTemplateId && pricingSelection) {
  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from('pricing_templates')
    .select('*')
    .eq('id', pricingTemplateId)
    .maybeSingle();

  if (tplErr || !tpl) {
    return jsonResponse({ error: 'Pricing template not found' }, 400);
  }

  // Mini re-implementation of resolveBracket / resolveTier / computeTotal (server side).
  // Duplicated inline to avoid pulling the frontend module into Deno.
  const now = Date.now();
  let activeBracket = null;
  if (tpl.active_bracket_override) {
    activeBracket = (tpl.date_brackets ?? []).find((b: any) => b.id === tpl.active_bracket_override) ?? null;
  }
  if (!activeBracket) {
    for (const b of (tpl.date_brackets ?? [])) {
      const start = Date.parse(`${b.startDate}T00:00:00Z`);
      const end = Date.parse(`${b.endDate}T23:59:59.999Z`);
      if (now >= start && now <= end) { activeBracket = b; break; }
    }
  }
  if (!activeBracket) return jsonResponse({ error: 'No active pricing bracket' }, 400);

  const code = (pricingSelection.countryCode ?? '').toUpperCase();
  const tiers = tpl.tiers ?? [];
  let activeTier = tiers.find((t: any) => (t.countries ?? []).includes(code)) ?? tiers[tiers.length - 1];
  if (!activeTier) return jsonResponse({ error: 'No tiers configured' }, 400);

  const cat = (tpl.categories ?? []).find((c: any) => c.id === pricingSelection.categoryId);
  if (!cat) return jsonResponse({ error: 'Unknown category' }, 400);
  const fee = cat.prices?.[activeTier.id]?.[activeBracket.id];
  if (typeof fee !== 'number') return jsonResponse({ error: 'Price not configured' }, 400);

  const addonIds: string[] = Array.isArray(pricingSelection.addonIds) ? pricingSelection.addonIds : [];
  const addonTotal = addonIds.reduce((sum: number, id: string) => {
    const a = (tpl.addons ?? []).find((x: any) => x.id === id);
    return sum + (a?.price ?? 0);
  }, 0);
  const expectedCents = fee + addonTotal;

  // Capture PayPal order and validate amount.
  const order = await getPayPalOrder(body.orderId);  // existing helper in this file
  const captured = Math.round(Number(order.purchase_units?.[0]?.amount?.value ?? 0) * 100);
  if (Math.abs(captured - expectedCents) > 1) {
    return jsonResponse({
      error: 'Price mismatch',
      expected: expectedCents,
      received: captured,
    }, 400);
  }

  // Persist attendee with pricing metadata; mirror existing insert pattern.
  const payload = {
    ...attendeeRow(body.attendees[0], formRow), // existing mapper pattern
    pricing_template_id: tpl.id,
    pricing_bracket: activeBracket.id,
    pricing_tier: activeTier.id,
    pricing_category_id: cat.id,
    payment_amount: `${(expectedCents / 100).toFixed(2)} ${tpl.currency}`,
    payment_status: 'paid',
  };
  const { error: insertErr } = await supabaseAdmin.from('attendees').insert(payload);
  if (insertErr) return jsonResponse({ error: insertErr.message }, 500);

  return jsonResponse({ ok: true, total: expectedCents, currency: tpl.currency });
}

// Otherwise, fall through to existing static-pricing logic (no change).
```

Note: the exact helper names (`getPayPalOrder`, `attendeeRow`, `supabaseAdmin`) already exist in this file — look them up and reuse directly; don't introduce new ones.

- [ ] **Step 3: Deploy edge function to both projects**

```bash
npx supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez --use-api
```

Expected: both print `Deployed Functions on project <ref>: verify-payment`.

- [ ] **Step 4: Commit checkpoint — edge function complete**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "$(cat <<'EOF'
feat(pricing): verify-payment dynamic pricing branch

Adds a server-side re-computation path for forms linked to a pricing
template. Resolves active bracket from server time + template timezone (with
override), resolves tier from the registrant's declared country (fallback to
last tier), looks up fee + add-ons, and rejects if the PayPal captured
amount differs from the expected total by more than 1 cent. Persisted
attendees carry pricing_template_id / pricing_bracket / pricing_tier /
pricing_category_id for audit.

Existing static-pricing and sponsor paths are unchanged.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: GANSID seed + final CLAUDE.md update + push

**Files:**
- Create: `tmp/seed-gansid-pricing-template.sql` (not committed)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the GANSID seed SQL**

Dollar prices from the GANSID fees PDF, converted to cents. All Tier 1 and Tier 2 countries per the PDF's geographic groupings. Date brackets from the PDF.

```sql
-- tmp/seed-gansid-pricing-template.sql
INSERT INTO public.pricing_templates
  (name, timezone, currency, is_active, tiers, date_brackets, active_bracket_override, categories, addons)
VALUES (
  'GANSID Congress 2026 Pricing',
  'Asia/Kolkata',
  'USD',
  true,
  $tiers$[
    {
      "id": "tier1",
      "name": "Tier 1",
      "label": "Asia, Africa, South America, Central America, Mexico",
      "countries": ["AF","AM","AZ","BD","BH","BN","BT","IN","ID","IR","IQ","JO","KZ","KG","KH","KP","KR","KW","LA","LB","LK","MM","MN","MY","MV","NP","OM","PH","PK","PS","QA","SA","SG","SY","TH","TJ","TL","TM","TR","TW","UZ","VN","YE","AE","DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW","AR","BO","BR","CL","CO","EC","GY","PY","PE","SR","UY","VE","BZ","CR","SV","GT","HN","NI","PA","MX","AG","BS","BB","CU","DM","DO","GD","HT","JM","KN","LC","VC","TT"]
    },
    {
      "id": "tier2",
      "name": "Tier 2",
      "label": "United States, Canada, Europe, Australia, New Zealand",
      "countries": ["US","CA","AL","AD","AT","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE","CH","UA","GB","BY","VA","XK","IL","AU","NZ","FJ","PG","SB","VU","WS","TO","KI","MH","FM","NR","PW","TV","JP"]
    }
  ]$tiers$::jsonb,
  $brackets$[
    {"id":"early_bird","name":"Early Bird","startDate":"2026-01-01","endDate":"2026-06-30"},
    {"id":"regular","name":"Regular","startDate":"2026-07-01","endDate":"2026-09-15"},
    {"id":"onsite","name":"On-site","startDate":"2026-09-16","endDate":"2026-10-25"}
  ]$brackets$::jsonb,
  NULL,
  $categories$[
    {"id":"physician","name":"Physicians/Researchers","prices":{"tier1":{"early_bird":17500,"regular":20000,"onsite":25000},"tier2":{"early_bird":25000,"regular":30000,"onsite":40000}}},
    {"id":"trainee","name":"Medical Trainees (Residents, Fellows)","prices":{"tier1":{"early_bird":15000,"regular":17500,"onsite":20000},"tier2":{"early_bird":20000,"regular":25000,"onsite":27500}}},
    {"id":"student","name":"Undergraduate, Medical, Graduate Students","prices":{"tier1":{"early_bird":5000,"regular":7500,"onsite":10000},"tier2":{"early_bird":7500,"regular":10000,"onsite":12500}}},
    {"id":"nurse","name":"Nurses or Allied Health Professionals","prices":{"tier1":{"early_bird":10000,"regular":12500,"onsite":15000},"tier2":{"early_bird":15000,"regular":20000,"onsite":25000}}},
    {"id":"industry","name":"Industry Partners","prices":{"tier1":{"early_bird":25000,"regular":30000,"onsite":35000},"tier2":{"early_bird":30000,"regular":35000,"onsite":45000}}},
    {"id":"patient_org","name":"Patient Organizations","prices":{"tier1":{"early_bird":5000,"regular":7500,"onsite":10000},"tier2":{"early_bird":7500,"regular":10000,"onsite":12500}}},
    {"id":"patient","name":"Patients or Family Members","prices":{"tier1":{"early_bird":2500,"regular":4000,"onsite":5000},"tier2":{"early_bird":3500,"regular":5000,"onsite":6000}}}
  ]$categories$::jsonb,
  $addons$[
    {"id":"networking","name":"Networking Reception","description":"Evening reception with colleagues, separate from the main congress.","price":5000}
  ]$addons$::jsonb
);

-- Also flip on the feature flag for the GANSID site.
UPDATE public.app_settings SET feature_pricing_templates = true WHERE id = 1;
```

- [ ] **Step 2: Apply to GANSID only**

```bash
npx supabase db query --linked -f tmp/seed-gansid-pricing-template.sql
```

(If the repo is linked to SCAGO, re-link first: `SUPABASE_DB_PASSWORD='...' npx supabase link --project-ref gticuvgclbvhwvpzkuez` — but only run the seed against GANSID.)

Expected: single row inserted, app_settings updated.

- [ ] **Step 3: Verify**

```bash
npx supabase db query --linked "SELECT name, jsonb_array_length(categories) as cats, jsonb_array_length(addons) as addons, jsonb_array_length(date_brackets) as brackets FROM pricing_templates;"
```

Expected: `GANSID Congress 2026 Pricing · 7 · 1 · 3`.

- [ ] **Step 4: Update CLAUDE.md**

Append under the existing "Multi-site deployment" section or as a new top-level section:

```markdown
## Dynamic Pricing Engine

Optional feature, gated on `app_settings.feature_pricing_templates`. Enabled on GANSID, disabled on SCAGO.

- Admin-managed templates live in `pricing_templates` (table). Each template contains tiers, date brackets, a category×tier×bracket price matrix, and flat-price add-ons.
- Forms link via `form.settings.pricingTemplateId`. When null/absent, the form uses the existing static `TicketItem` flow.
- Public registration uses `utils/pricing.ts` (resolveBracket / resolveTier / computeTotal) client-side.
- `verify-payment` re-computes the expected total server-side and rejects PayPal captures that don't match (within 1 cent).
- Attendee rows carry `pricing_template_id`, `pricing_bracket`, `pricing_tier`, `pricing_category_id` for auditing.
- Seed for GANSID 2026 lives (non-committed) in `tmp/seed-gansid-pricing-template.sql`.

Spec: `docs/superpowers/specs/2026-04-15-dynamic-pricing-engine-design.md`
Plan: `docs/superpowers/plans/2026-04-16-dynamic-pricing-engine.md`
```

- [ ] **Step 5: Full verification**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all green.

- [ ] **Step 6: Commit the final set + push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(pricing): record Dynamic Pricing Engine in CLAUDE.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/pricing-engine
```

- [ ] **Step 7: Manual end-to-end smoke test (user, in browser)**

On `gansid.netlify.app`:
1. Create a test event form, add a Country field (flag it for pricing), add a few other fields (name, email).
2. Open the Pricing tab, toggle "Use dynamic pricing", select "GANSID Congress 2026 Pricing".
3. Open the public URL in an incognito window.
4. Pick a Tier 1 country (e.g. India), select "Physicians/Researchers". Confirm the category dropdown shows $175.00. Toggle the Networking Reception. Confirm total = $225.00.
5. Switch country to United States. Confirm the category price updates to $250.00 (Tier 2 Early Bird).
6. Proceed through PayPal sandbox with the US/Physician/Networking selection; confirm the captured amount is $300.00 and the attendee record in GANSID Supabase has `pricing_tier='tier2'`, `pricing_bracket='early_bird'`, `pricing_category_id='physician'`.
7. On `qreventcheck.netlify.app` — load an existing SCAGO form, confirm behavior is unchanged (no pricing template attached, same static `TicketItem` flow as before).

If any of 4–7 fails, the task is not done; fix and re-test.

---

## Definition of done

- All unit tests pass (`npm test` green, including new pricing/countries tests)
- `npx tsc --noEmit` clean
- Both `npm run build` and `VITE_SITE=gansid npm run build` succeed
- `verify-payment` deployed to both Supabase projects with dynamic-pricing branch
- GANSID seed template in place; feature flag on
- SCAGO regression: unchanged behavior on at least one existing live form
- End-to-end sandbox test (Task 14 Step 7) completes with correct amount, correct attendee persistence
- `feat/pricing-engine` branch pushed to origin with all commits from Tasks 4, 8, 12, 13, and 14

## Not done here (explicit)

Per the spec's out-of-scope list: group registration, exhibitor form + staff roster, admin dashboard registration-type tabs, multi-currency display, promo codes on dynamic pricing, pricing edit audit trail, admin notifications for unclassified countries. Each of those is a future sub-project with its own spec.
