# GANSID Sponsor & Exhibitor Combined Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the GANSID exhibitor form into a combined, payment-free Sponsor & Exhibitor form with a stepped UI, group-style staff collection, and portal team-table dashboard.

**Architecture:** New `form_type='sponsor_exhibitor'` dispatched from `PublicRegistration` to a new component-driven stepped form. Submits through an extended `verify-payment` branch that writes `payment_status='paid'` + `'PAID EXTERNALLY'` rows. New `send-ticket-email` modes handle staff invitations/confirmations. Portal dashboard grows a TeamTable component for sponsor/exhibitor primaries; claimed staff see a derived "Staff — {OrgName}" badge.

**Tech Stack:** React + TypeScript + Vite, Tailwind (portal Viscous glass primitives), Supabase (Postgres + Deno edge functions), Vitest for pure-unit tests.

**Spec:** `docs/superpowers/specs/2026-04-19-sponsor-exhibitor-combined-form-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/20260419120000_add_sponsor_exhibitor.sql` — schema
- `config/formTemplates/boothTypes.ts` — 6-booth-type config
- `components/SponsorExhibitor/PublicSponsorExhibitorForm.tsx` — top-level shell
- `components/SponsorExhibitor/steps/StepRegistrationType.tsx`
- `components/SponsorExhibitor/steps/StepOrgInfo.tsx`
- `components/SponsorExhibitor/steps/StepSponsorTier.tsx`
- `components/SponsorExhibitor/steps/StepExhibitorBooth.tsx`
- `components/SponsorExhibitor/steps/StepStaffRoster.tsx`
- `components/SponsorExhibitor/steps/StepConsents.tsx`
- `components/SponsorExhibitor/steps/StepReview.tsx`
- `components/SponsorExhibitor/TeamTable.tsx`
- `components/SponsorExhibitor/validation.ts` — pure payload validation helpers
- `tests/boothTypes.test.ts`
- `tests/sponsorExhibitorValidation.test.ts`
- `tests/staffEmailTemplates.test.ts`

**Modified files:**
- `types.ts` — `FormType` union, `GuestType` union, `Attendee.exhibitorBoothType`, `AppSettings.emailStaff*`
- `services/database.types.ts` — mirror
- `services/storageService.ts` — attendee mapper, app_settings mapper, new `updateAttendeeStaffFields` (if needed)
- `services/smtpService.ts` — `StaffInviteArgs`, `StaffConfirmedArgs` payload types
- `components/PublicRegistration.tsx` — dispatch `sponsor_exhibitor` + staff-pending claim headline
- `supabase/functions/verify-payment/index.ts` — `sponsorExhibitorSubmission` branch
- `supabase/functions/send-ticket-email/index.ts` — `'staff-invite'` + `'staff-claim-completed'` modes
- `config/formTemplates/buildGansidExhibitor.ts` — rename/refactor to `buildGansidSponsorExhibitor.ts`
- `config/formTemplates.ts` — template registry (replace old entry)
- `components/Portal/Dashboard/AvailableFormsGrid.tsx` — `ROLE_TO_FORM_TYPES` map
- `components/Portal/Dashboard/PortalDashboard.tsx` — render TeamTable for sponsor/exhibitor primaries
- `components/Portal/Dashboard/WelcomeBlock.tsx` — derived "Staff — {OrgName}" sub-line
- `components/Portal/PortalLayout.tsx` (or wherever the avatar pill renders) — derived Staff badge
- `components/Sponsors/SponsorsTable.tsx` — include `sponsor_exhibitor` in filter
- `components/Exhibitor/ExhibitorsTab.tsx` — include `sponsor_exhibitor` + booth-type column
- `components/Settings.tsx` — Staff email templates section (reuse existing tab)
- `tests/storageMappers.test.ts` — pass-through assertion for `sponsor_exhibitor`
- `tests/formTemplates.test.ts` — registry assertion for renamed template
- `CLAUDE.md` — Sponsor & Exhibitor Combined Form section

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260419120000_add_sponsor_exhibitor.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 1. Extend form_type to include sponsor_exhibitor
ALTER TABLE forms
  DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE forms
  ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor', 'sponsor_exhibitor'));

-- 2. Add exhibitor_booth_type column (informational — no payment)
ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS exhibitor_booth_type TEXT;
ALTER TABLE attendees
  DROP CONSTRAINT IF EXISTS attendees_exhibitor_booth_type_check;
ALTER TABLE attendees
  ADD CONSTRAINT attendees_exhibitor_booth_type_check
  CHECK (exhibitor_booth_type IS NULL OR exhibitor_booth_type IN (
    'booth_3x3_corner', 'booth_3x3', 'booth_3x6_corner',
    'booth_3x6_inline', 'booth_nonprofit', 'booth_commercial_publishers'
  ));

-- 3. Extend guest_type CHECK to cover new staff states
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
    '<p>Hi {{name}},</p><p>{{purchaser}} has registered you as a staff member for <strong>{{event}}</strong> ({{category}}).</p><p>Please complete your registration here: <a href="{{complete_url}}">{{complete_url}}</a></p><p>If you''d like to create a portal account at the same time, sign up here: <a href="{{signup_url}}">{{signup_url}}</a></p>'),
  email_staff_confirmed_subject = COALESCE(
    email_staff_confirmed_subject,
    'Your staff registration for {{event}} is confirmed'),
  email_staff_confirmed_body = COALESCE(
    email_staff_confirmed_body,
    '<p>Hi {{name}},</p><p>Your staff registration for <strong>{{event}}</strong> is confirmed. Your ticket QR is attached and also appears in your portal dashboard.</p><p>Attending with <strong>{{org_name}}</strong>.</p>');
```

- [ ] **Step 2: Verify SQL syntax** — open the file, eyeball for typos. No automated run — migrations applied during deploy (see Task 27).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419120000_add_sponsor_exhibitor.sql
git commit -m "feat(schema): add sponsor_exhibitor form_type + booth_type + staff email templates"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `types.ts`
- Modify: `services/database.types.ts`

- [ ] **Step 1: Update `types.ts`**

Find the existing `Form` interface's `formType` field and extend the union:

```ts
// was: formType?: 'event' | 'sponsor' | 'exhibitor';
formType?: 'event' | 'sponsor' | 'exhibitor' | 'sponsor_exhibitor';
```

Add to `Attendee`:

```ts
exhibitorBoothType?: string | null;
```

Extend `guestType` union on `Attendee` to include `'staff-pending' | 'staff-claimed'`.

Extend `AppSettings`:

```ts
emailStaffInviteSubject?: string;
emailStaffInviteBody?: string;
emailStaffConfirmedSubject?: string;
emailStaffConfirmedBody?: string;
```

- [ ] **Step 2: Update `services/database.types.ts`**

Mirror the same additions on the generated types: `attendees.exhibitor_booth_type`, `attendees.guest_type` (extend the string literal union), `app_settings.email_staff_*` columns (4 new nullable strings), `forms.form_type` (extend union).

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors; existing code continues to compile).

- [ ] **Step 4: Commit**

```bash
git add types.ts services/database.types.ts
git commit -m "feat(types): extend form_type + guest_type + attendee + app_settings for sponsor_exhibitor"
```

---

## Task 3: Booth type config

**Files:**
- Create: `config/formTemplates/boothTypes.ts`
- Create: `tests/boothTypes.test.ts`

- [ ] **Step 1: Write failing test**

`tests/boothTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EXHIBITOR_BOOTH_TYPES, getBoothType, type BoothType } from '../config/formTemplates/boothTypes';

describe('EXHIBITOR_BOOTH_TYPES', () => {
  it('exports exactly 6 booth types', () => {
    expect(EXHIBITOR_BOOTH_TYPES).toHaveLength(6);
  });

  it('has unique IDs', () => {
    const ids = EXHIBITOR_BOOTH_TYPES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every booth has non-empty label + positive quotas', () => {
    EXHIBITOR_BOOTH_TYPES.forEach(b => {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.hallOnlyQuota).toBeGreaterThan(0);
      expect(b.fullAccessQuota).toBeGreaterThan(0);
      expect(['CAD', 'USD']).toContain(b.currency);
    });
  });

  it('getBoothType returns matching booth by id', () => {
    const b = getBoothType('booth_3x3');
    expect(b?.label).toMatch(/3 × 3/);
  });

  it('getBoothType returns undefined for unknown id', () => {
    expect(getBoothType('nope')).toBeUndefined();
  });

  it('non-profit booth has a verification note', () => {
    const b = getBoothType('booth_nonprofit');
    expect(b?.note).toMatch(/[Vv]erification/);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run tests/boothTypes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `boothTypes.ts`**

```ts
export interface BoothType {
  id: string;
  label: string;
  priceDisplay: string;
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

export function getBoothType(id: string): BoothType | undefined {
  return EXHIBITOR_BOOTH_TYPES.find(b => b.id === id);
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npx vitest run tests/boothTypes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add config/formTemplates/boothTypes.ts tests/boothTypes.test.ts
git commit -m "feat(booth): add EXHIBITOR_BOOTH_TYPES config with 6 booth types"
```

---

## Task 4: Refactor exhibitor form template into sponsor_exhibitor

**Files:**
- Create: `config/formTemplates/buildGansidSponsorExhibitor.ts`
- Delete: `config/formTemplates/buildGansidExhibitor.ts` (after registry migration)
- Modify: `config/formTemplates.ts`
- Modify: `tests/formTemplates.test.ts`
- Modify: `tests/exhibitorTiers.test.ts` → delete or retarget (tiers are gone)

- [ ] **Step 1: Update failing test**

Edit `tests/formTemplates.test.ts` — replace any `buildGansidExhibitor` assertion with:

```ts
it('gansid-sponsor-exhibitor template declares form_type sponsor_exhibitor', () => {
  const template = TEMPLATES.find(t => t.id === 'gansid-sponsor-exhibitor');
  expect(template).toBeDefined();
  const built = template!.build();
  expect(built.formType).toBe('sponsor_exhibitor');
});

it('gansid-sponsor-exhibitor template is gansid-only', () => {
  const tpl = TEMPLATES.find(t => t.id === 'gansid-sponsor-exhibitor');
  expect(tpl?.siteFilter).toEqual(['gansid']);
});
```

Delete `tests/exhibitorTiers.test.ts` (tiers are obsolete).

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run tests/formTemplates.test.ts`
Expected: FAIL (template id not found).

- [ ] **Step 3: Create `buildGansidSponsorExhibitor.ts`**

```ts
import type { Form } from '../../types';

export function buildGansidSponsorExhibitor(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'GANSID Congress 2026 — Sponsor & Exhibitor Registration',
    description: 'Register your organization as a sponsor or exhibitor. Payment is handled externally; this form collects organizational info and staff rosters only.',
    thankYouMessage: 'Thank you. Your staff will receive invitation emails shortly. You can manage your team from your portal dashboard.',
    formType: 'sponsor_exhibitor',
    settings: {
      staffFormId: 'gansid-congress-2026',
    } as any,
    fields: [],
  };
}
```

- [ ] **Step 4: Update `config/formTemplates.ts`**

Replace the entry for the old `gansid-exhibitor` template with:

```ts
import { buildGansidSponsorExhibitor } from './formTemplates/buildGansidSponsorExhibitor';

// inside TEMPLATES:
{
  id: 'gansid-sponsor-exhibitor',
  name: 'GANSID Sponsor & Exhibitor Registration',
  description: 'Combined sponsor + exhibitor form with stepped UI, staff roster, no payment.',
  siteFilter: ['gansid'],
  build: buildGansidSponsorExhibitor,
},
```

Remove the old `buildGansidExhibitor` import + entry.

- [ ] **Step 5: Delete `config/formTemplates/buildGansidExhibitor.ts`**

```bash
git rm config/formTemplates/buildGansidExhibitor.ts
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/formTemplates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(templates): replace gansid-exhibitor with sponsor_exhibitor template"
```

---

## Task 5: Validation helpers + tests

**Files:**
- Create: `components/SponsorExhibitor/validation.ts`
- Create: `tests/sponsorExhibitorValidation.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  validateSubmission,
  getSponsorQuota,
  type SponsorExhibitorPayload,
} from '../components/SponsorExhibitor/validation';

const baseOrg = {
  orgName: 'Acme', contactName: 'Jane', email: 'jane@acme.test',
};

describe('getSponsorQuota', () => {
  it('signature=16, gold/silver=8, award/scholarship=0', () => {
    expect(getSponsorQuota('signature')).toBe(16);
    expect(getSponsorQuota('gold')).toBe(8);
    expect(getSponsorQuota('silver')).toBe(8);
    expect(getSponsorQuota('award')).toBe(0);
    expect(getSponsorQuota('scholarship')).toBe(0);
  });
});

describe('validateSubmission', () => {
  it('requires registrationType', () => {
    const r = validateSubmission({} as any);
    expect(r.ok).toBe(false);
    expect(r.errors?.[0]).toMatch(/registrationType/);
  });

  it('rejects both tier and boothType set', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold', boothType: 'booth_3x3',
      hasAllDetails: false, staff: [],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/exactly one of/);
  });

  it('rejects missing all three consents', () => {
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',
      hasAllDetails: false, staff: [],
      consents: { terms: false, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/consent/i);
  });

  it('rejects staff count exceeding booth quota', () => {
    const staff = Array.from({ length: 5 }, (_, i) => ({
      name: `S${i}`, email: `s${i}@a.test`, category: 'hall_only' as const,
    }));
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',   // hall_only quota = 4
      hasAllDetails: false, staff,
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/hall_only.*quota/);
  });

  it('accepts valid exhibitor payload under quota', () => {
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',
      hasAllDetails: false,
      staff: [{ name: 'S', email: 's@a.test', category: 'hall_only' }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(true);
  });

  it('accepts sponsor payload with empty placeholder slots', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold',
      hasAllDetails: false,
      staff: [
        { name: 'Known', email: 'k@a.test', category: 'sponsor_seat' },
        { name: '', email: '', category: 'sponsor_seat' },
      ],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(true);
  });

  it('rejects inline staff with missing name/email', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold',
      hasAllDetails: true,
      staff: [{ name: '', email: '', category: 'sponsor_seat', fullAnswers: {} }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run tests/sponsorExhibitorValidation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `validation.ts`**

```ts
import { getBoothType } from '../../config/formTemplates/boothTypes';

export type SponsorTier = 'signature' | 'gold' | 'silver' | 'award' | 'scholarship';
export type StaffCategory = 'hall_only' | 'full_access' | 'sponsor_seat';
export type RegistrationType = 'sponsor' | 'exhibitor';

export interface StaffEntry {
  name: string;
  email: string;
  category: StaffCategory;
  fullAnswers?: Record<string, unknown>;
}

export interface SponsorExhibitorPayload {
  registrationType: RegistrationType;
  org: {
    orgName: string;
    contactName: string;
    contactTitle?: string;
    email: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  sponsorTier?: SponsorTier;
  sponsorItems?: Array<{ id: string; category: string; qty?: number }>;
  sponsoredAwards?: string[];
  boothType?: string;
  hasAllDetails: boolean;
  staff: StaffEntry[];
  consents: { terms: boolean; disclaimer: boolean; photo: boolean };
}

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export function getSponsorQuota(tier: SponsorTier): number {
  if (tier === 'signature') return 16;
  if (tier === 'gold' || tier === 'silver') return 8;
  return 0;
}

function isPlaceholder(s: StaffEntry): boolean {
  return !s.name.trim() && !s.email.trim();
}

export function validateSubmission(p: SponsorExhibitorPayload): ValidationResult {
  const errors: string[] = [];

  if (p.registrationType !== 'sponsor' && p.registrationType !== 'exhibitor') {
    errors.push('registrationType must be "sponsor" or "exhibitor"');
    return { ok: false, errors };
  }

  const hasTier = !!p.sponsorTier;
  const hasBooth = !!p.boothType;
  if (hasTier === hasBooth) {
    errors.push('Payload must have exactly one of sponsorTier or boothType');
  }
  if (p.registrationType === 'sponsor' && !hasTier) errors.push('sponsor flow requires sponsorTier');
  if (p.registrationType === 'exhibitor' && !hasBooth) errors.push('exhibitor flow requires boothType');

  if (!p.org?.orgName?.trim()) errors.push('orgName required');
  if (!p.org?.contactName?.trim()) errors.push('contactName required');
  if (!p.org?.email?.trim()) errors.push('contact email required');

  if (!p.consents?.terms || !p.consents?.disclaimer || !p.consents?.photo) {
    errors.push('all three consents must be accepted');
  }

  if (p.boothType) {
    const booth = getBoothType(p.boothType);
    if (!booth) {
      errors.push(`Unknown boothType: ${p.boothType}`);
    } else {
      const hallOnly = p.staff.filter(s => s.category === 'hall_only').length;
      const fullAccess = p.staff.filter(s => s.category === 'full_access').length;
      if (hallOnly > booth.hallOnlyQuota) {
        errors.push(`hall_only staff exceeds quota (${hallOnly} > ${booth.hallOnlyQuota})`);
      }
      if (fullAccess > booth.fullAccessQuota) {
        errors.push(`full_access staff exceeds quota (${fullAccess} > ${booth.fullAccessQuota})`);
      }
    }
  }

  if (p.sponsorTier) {
    const quota = getSponsorQuota(p.sponsorTier);
    const seats = p.staff.filter(s => s.category === 'sponsor_seat').length;
    if (seats > quota) {
      errors.push(`sponsor_seat staff exceeds tier quota (${seats} > ${quota})`);
    }
  }

  if (p.hasAllDetails) {
    p.staff.forEach((s, i) => {
      if (!s.name.trim() || !s.email.trim()) {
        errors.push(`staff[${i}] missing name or email under inline-details mode`);
      }
    });
  } else {
    p.staff.forEach((s, i) => {
      if (!isPlaceholder(s) && (!s.name.trim() || !s.email.trim())) {
        errors.push(`staff[${i}] partial — must have both name and email or be empty`);
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/sponsorExhibitorValidation.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add components/SponsorExhibitor/validation.ts tests/sponsorExhibitorValidation.test.ts
git commit -m "feat(validation): add sponsor_exhibitor payload validation helpers"
```

---

## Task 6: Storage layer — mapper + app_settings fields

**Files:**
- Modify: `services/storageService.ts`

- [ ] **Step 1: Extend attendee mapper**

Find the existing `mapAttendeeFromDb` function (or equivalent). Add to the return shape:

```ts
exhibitorBoothType: row.exhibitor_booth_type ?? null,
```

Find the matching `mapAttendeeToDb` (or insert helper). Add:

```ts
exhibitor_booth_type: a.exhibitorBoothType ?? null,
```

- [ ] **Step 2: Extend app_settings mapper**

In the `mapSettingsFromDb` / `mapSettingsToDb` pair, add the four new fields:

```ts
// fromDb
emailStaffInviteSubject: row.email_staff_invite_subject ?? '',
emailStaffInviteBody: row.email_staff_invite_body ?? '',
emailStaffConfirmedSubject: row.email_staff_confirmed_subject ?? '',
emailStaffConfirmedBody: row.email_staff_confirmed_body ?? '',

// toDb
email_staff_invite_subject: s.emailStaffInviteSubject ?? null,
email_staff_invite_body: s.emailStaffInviteBody ?? null,
email_staff_confirmed_subject: s.emailStaffConfirmedSubject ?? null,
email_staff_confirmed_body: s.emailStaffConfirmedBody ?? null,
```

- [ ] **Step 3: Add `updateAttendeeFields` helper (if not already present)**

Grep the file for `updateAttendee`. If a generic patch function exists, no new code. Otherwise add:

```ts
export async function updateAttendeeFields(id: string, patch: Partial<Attendee>) {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.answers !== undefined) dbPatch.answers = patch.answers;
  if (patch.guestType !== undefined) dbPatch.guest_type = patch.guestType;
  const { error } = await supabase.from('attendees').update(dbPatch).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run mapper guard tests**

Run: `npx vitest run tests/storageMappers.test.ts`
Expected: PASS (existing tests).

- [ ] **Step 6: Commit**

```bash
git add services/storageService.ts
git commit -m "feat(storage): map exhibitor_booth_type + staff email templates"
```

---

## Task 7: smtpService typing for new modes

**Files:**
- Modify: `services/smtpService.ts`

- [ ] **Step 1: Extend `sendTicketEmail` arg type**

Find the existing `SendTicketEmailArgs` (or whatever union holds the `mode` discriminator). Add two new variants:

```ts
type StaffInviteArgs = {
  mode: 'staff-invite';
  to: string;
  name: string;
  purchaser: string;
  orgName: string;
  category: 'Hall-Only' | 'Full-Access' | 'Sponsor Seat';
  completeUrl: string;
  signupUrl: string;
  eventName: string;
};

type StaffConfirmedArgs = {
  mode: 'staff-claim-completed';
  to: string;
  name: string;
  orgName: string;
  eventName: string;
  attachments: Array<{ filename: string; content: string }>;   // base64
};
```

Add them to the union used by `sendTicketEmail`.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add services/smtpService.ts
git commit -m "feat(smtp): type staff-invite + staff-claim-completed modes"
```

---

## Task 8: send-ticket-email edge function — staff-invite mode

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts`

- [ ] **Step 1: Add staff-invite branch**

Near the existing `mode === 'group-invite'` branch, add:

```ts
if (mode === 'staff-invite') {
  const settings = await loadAppSettings(supabase);
  const subjectTpl = settings.email_staff_invite_subject || '';
  const bodyTpl    = settings.email_staff_invite_body || '';
  const placeholders = {
    name: body.name || '',
    purchaser: body.purchaser || '',
    org_name: body.orgName || '',
    category: body.category || '',
    complete_url: body.completeUrl || '',
    signup_url: body.signupUrl || '',
    event: body.eventName || '',
  };
  const subject = mergeTemplate(subjectTpl, placeholders);
  const html = mergeTemplate(bodyTpl, placeholders);
  // Do NOT include the "attachment is included" callout — staff-invite has no attachments.
  await sendSmtpEmail({
    to: body.to,
    subject,
    html,
    attachments: [],
    includeAttachmentCallout: false,
  });
  return jsonResponse({ ok: true });
}
```

Reuse whatever existing helpers the function already has (`loadAppSettings`, `mergeTemplate`, `sendSmtpEmail`). If these names differ, adapt — match the exact existing pattern in the file.

- [ ] **Step 2: Deploy** (post-integration — see Task 27)

- [ ] **Step 3: Commit (partial — combined with Task 9)**

Defer commit until Task 9 is complete so both modes land in one commit.

---

## Task 9: send-ticket-email — staff-claim-completed mode

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts`

- [ ] **Step 1: Add staff-claim-completed branch**

```ts
if (mode === 'staff-claim-completed') {
  const settings = await loadAppSettings(supabase);
  const subjectTpl = settings.email_staff_confirmed_subject || '';
  const bodyTpl    = settings.email_staff_confirmed_body || '';
  const placeholders = {
    name: body.name || '',
    org_name: body.orgName || '',
    event: body.eventName || '',
  };
  const subject = mergeTemplate(subjectTpl, placeholders);
  const html = mergeTemplate(bodyTpl, placeholders);
  await sendSmtpEmail({
    to: body.to,
    subject,
    html,
    attachments: body.attachments || [],
    includeAttachmentCallout: (body.attachments?.length ?? 0) > 0,
  });
  return jsonResponse({ ok: true });
}
```

- [ ] **Step 2: Commit Task 8 + Task 9 together**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "feat(edge): send-ticket-email supports staff-invite + staff-claim-completed"
```

---

## Task 10: Staff email template merge test

**Files:**
- Create: `tests/staffEmailTemplates.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect } from 'vitest';
import { mergeTemplate, escapeHtml } from '../utils/sponsorEmailTemplates';

describe('staff email placeholder merge', () => {
  it('substitutes all staff-invite placeholders', () => {
    const tpl = 'Hi {{name}}, {{purchaser}} registered you for {{event}} ({{category}}). Visit {{complete_url}} or sign up at {{signup_url}}. Org: {{org_name}}.';
    const out = mergeTemplate(tpl, {
      name: 'Ada', purchaser: 'Jane', event: 'GANSID 2026',
      category: 'Hall-Only', complete_url: 'https://x/y', signup_url: 'https://x/z',
      org_name: 'Acme',
    });
    expect(out).toContain('Hi Ada');
    expect(out).toContain('GANSID 2026');
    expect(out).toContain('Hall-Only');
    expect(out).toContain('Acme');
    expect(out).not.toContain('{{');
  });

  it('HTML-escapes purchaser values', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });
});
```

- [ ] **Step 2: Run — expect pass** (reuses existing utils)

Run: `npx vitest run tests/staffEmailTemplates.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/staffEmailTemplates.test.ts
git commit -m "test(email): staff-invite placeholder merge coverage"
```

---

## Task 11: verify-payment — sponsorExhibitorSubmission branch

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Add request interface + early branch**

Immediately after the existing `if (body.exhibitorSubmission === true) { ... }` block (around line 98), add:

```ts
if (body.sponsorExhibitorSubmission === true) {
  const {
    formId, registrationType, org,
    sponsorTier, sponsorItems, sponsoredAwards,
    boothType,
    hasAllDetails, staff, consents,
  } = body;

  // ─── Basic validation ───
  if (registrationType !== 'sponsor' && registrationType !== 'exhibitor') {
    return jsonResponse({ error: 'registrationType must be sponsor or exhibitor' }, 400);
  }
  const hasTier = !!sponsorTier;
  const hasBooth = !!boothType;
  if (hasTier === hasBooth) {
    return jsonResponse({ error: 'Exactly one of sponsorTier or boothType required' }, 400);
  }
  if (!org?.orgName || !org?.contactName || !org?.email) {
    return jsonResponse({ error: 'org.orgName, contactName, email required' }, 400);
  }
  if (!consents?.terms || !consents?.disclaimer || !consents?.photo) {
    return jsonResponse({ error: 'All three consents must be accepted' }, 400);
  }

  // ─── Staff quota validation (server-side mirror of client validation) ───
  const BOOTH_QUOTAS: Record<string, { hall_only: number; full_access: number }> = {
    booth_3x3_corner:            { hall_only: 4, full_access: 2 },
    booth_3x3:                   { hall_only: 4, full_access: 2 },
    booth_3x6_corner:            { hall_only: 6, full_access: 4 },
    booth_3x6_inline:            { hall_only: 6, full_access: 4 },
    booth_nonprofit:             { hall_only: 2, full_access: 1 },
    booth_commercial_publishers: { hall_only: 2, full_access: 1 },
  };
  const SPONSOR_QUOTAS: Record<string, number> = {
    signature: 16, gold: 8, silver: 8, award: 0, scholarship: 0,
  };

  if (boothType) {
    const q = BOOTH_QUOTAS[boothType];
    if (!q) return jsonResponse({ error: `Unknown boothType: ${boothType}` }, 400);
    const ho = staff.filter((s: any) => s.category === 'hall_only').length;
    const fa = staff.filter((s: any) => s.category === 'full_access').length;
    if (ho > q.hall_only || fa > q.full_access) {
      return jsonResponse({ error: 'Staff count exceeds booth quota' }, 400);
    }
  }
  if (sponsorTier) {
    const q = SPONSOR_QUOTAS[sponsorTier];
    if (q === undefined) return jsonResponse({ error: `Unknown sponsorTier: ${sponsorTier}` }, 400);
    const seats = staff.filter((s: any) => s.category === 'sponsor_seat').length;
    if (seats > q) return jsonResponse({ error: 'Sponsor seats exceed tier quota' }, 400);
  }

  // ─── Auth: derive user_id from JWT (optional) ───
  let authUserId: string | null = null;
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7);
    const { data: userData } = await supabase.auth.getUser(jwt);
    authUserId = userData?.user?.id ?? null;
  }

  // ─── Insert primary attendee ───
  const transactionId = crypto.randomUUID();
  const primary: Record<string, any> = {
    form_id: formId,
    name: org.orgName,
    email: org.email,
    ticket_type: registrationType === 'sponsor' ? 'Sponsor' : 'Exhibitor',
    payment_status: 'paid',
    payment_amount: 'PAID EXTERNALLY',
    payment_method: 'external',
    qr_payload: JSON.stringify({ t: transactionId, i: 0 }),
    registered_at: new Date().toISOString(),
    transaction_id: transactionId,
    is_primary: true,
    user_id: authUserId,
    company_info: org,
    answers: { registrationType, hasAllDetails },
  };
  if (sponsorTier) {
    primary.sponsor_tier = sponsorTier;
    primary.sponsor_items = sponsorItems || [];
    primary.sponsored_awards = sponsoredAwards || [];
  } else {
    primary.exhibitor_booth_type = boothType;
  }

  const { data: primaryRow, error: primaryErr } = await supabase
    .from('attendees').insert(primary).select('id').single();
  if (primaryErr) return jsonResponse({ error: primaryErr.message }, 500);

  // ─── Insert staff rows ───
  const staffRows = staff.map((s: any, i: number) => {
    const isPlaceholder = !s.name?.trim() && !s.email?.trim();
    const base: Record<string, any> = {
      form_id: formId,
      name: isPlaceholder ? `${org.orgName} — Staff slot #${i + 1}` : s.name,
      email: isPlaceholder ? null : s.email,
      ticket_type: s.category === 'full_access' ? 'Full Access' :
                   s.category === 'hall_only' ? 'Hall Only' : 'Sponsor Seat',
      payment_status: 'paid',
      payment_amount: 'PAID EXTERNALLY',
      qr_payload: JSON.stringify({ t: transactionId, i: i + 1 }),
      registered_at: new Date().toISOString(),
      transaction_id: transactionId,
      is_primary: false,
      primary_attendee_id: primaryRow.id,
      user_id: null,
      answers: hasAllDetails && !isPlaceholder
        ? { ...(s.fullAnswers || {}), staffCategory: s.category }
        : { staffCategory: s.category },
      guest_type: hasAllDetails && !isPlaceholder ? null : 'staff-pending',
    };
    return base;
  });

  let staffIds: string[] = [];
  if (staffRows.length > 0) {
    const { data: staffData, error: staffErr } = await supabase
      .from('attendees').insert(staffRows).select('id');
    if (staffErr) return jsonResponse({ error: staffErr.message }, 500);
    staffIds = (staffData || []).map((r: any) => r.id);
  }

  return jsonResponse({
    ok: true,
    primaryId: primaryRow.id,
    staffIds,
    transactionId,
  });
}
```

- [ ] **Step 2: Self-review — check qr_payload shape matches existing rows**

Grep for `qr_payload` in the same file (around the existing sponsor/group branches) and confirm the shape `{ t, i }` matches. If the existing code uses a different serialization, adapt.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "feat(edge): verify-payment sponsor_exhibitor branch (payment-free flow)"
```

---

## Task 12: Dispatch — PublicRegistration routes sponsor_exhibitor

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Add dispatch for new form_type**

Grep for the existing dispatch that routes `formType === 'sponsor'` to `PublicSponsorForm`. Immediately before or after it, add:

```tsx
if (form.formType === 'sponsor_exhibitor') {
  return <PublicSponsorExhibitorForm form={form} settings={settings} />;
}
```

Add the import at top:

```tsx
import PublicSponsorExhibitorForm from './SponsorExhibitor/PublicSponsorExhibitorForm';
```

Also — find the existing `formType === 'exhibitor'` dispatch to `PublicExhibitorForm`. Leave it in place (SCAGO may still have exhibitor forms; GANSID's exhibitor template has been upgraded but legacy pre-migration forms may still exist). No removal.

- [ ] **Step 2: Commit** (component doesn't exist yet — file will compile-fail until Task 13)

Defer commit — chain with Task 13.

---

## Task 13: PublicSponsorExhibitorForm shell

**Files:**
- Create: `components/SponsorExhibitor/PublicSponsorExhibitorForm.tsx`

- [ ] **Step 1: Write the shell**

```tsx
import React, { useMemo, useState } from 'react';
import type { Form, AppSettings } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import StepperSidebar from '../Portal/ui/StepperSidebar';
import GlassCard from '../Portal/ui/GlassCard';
import ViscousButton from '../Portal/ui/ViscousButton';
import StepRegistrationType from './steps/StepRegistrationType';
import StepOrgInfo from './steps/StepOrgInfo';
import StepSponsorTier from './steps/StepSponsorTier';
import StepExhibitorBooth from './steps/StepExhibitorBooth';
import StepStaffRoster from './steps/StepStaffRoster';
import StepConsents from './steps/StepConsents';
import StepReview from './steps/StepReview';
import { validateSubmission, type SponsorExhibitorPayload, type StaffEntry } from './validation';
import { supabase } from '../../services/supabaseClient';
import { sendTicketEmail } from '../../services/smtpService';
import { CURRENT_SITE } from '../../config/sites';

interface Props { form: Form; settings: AppSettings; }

export default function PublicSponsorExhibitorForm({ form, settings }: Props) {
  const { profile, user } = useAuth();
  const initialType = profile?.role === 'sponsor' ? 'sponsor'
                    : profile?.role === 'exhibitor' ? 'exhibitor'
                    : null;

  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] = useState<'sponsor' | 'exhibitor' | null>(initialType);
  const [org, setOrg] = useState({
    orgName: '', contactName: '', contactTitle: '', email: '',
    phone: '', address: '', website: '',
  });
  const [sponsorTier, setSponsorTier] = useState<string | null>(null);
  const [sponsorItems, setSponsorItems] = useState<Array<{ id: string; category: string; qty?: number }>>([]);
  const [sponsoredAwards, setSponsoredAwards] = useState<string[]>([]);
  const [boothType, setBoothType] = useState<string | null>(null);
  const [hasAllDetails, setHasAllDetails] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [consents, setConsents] = useState({ terms: false, disclaimer: false, photo: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(() => {
    const base = ['Type', 'Organization'];
    if (registrationType === 'sponsor') base.push('Tier');
    if (registrationType === 'exhibitor') base.push('Booth');
    const isAwardOrScholarship = sponsorTier === 'award' || sponsorTier === 'scholarship';
    if (!isAwardOrScholarship) base.push('Staff');
    base.push('Consents', 'Review');
    return base;
  }, [registrationType, sponsorTier]);

  const buildPayload = (): SponsorExhibitorPayload => ({
    registrationType: registrationType!,
    org, sponsorTier: sponsorTier as any, sponsorItems, sponsoredAwards,
    boothType: boothType || undefined, hasAllDetails, staff, consents,
  });

  const onSubmit = async () => {
    const payload = buildPayload();
    const v = validateSubmission(payload);
    if (!v.ok) { setError(v.errors?.join('; ') || 'Validation failed'); return; }
    setSubmitting(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('verify-payment', {
        body: { mode: 'paid', formId: form.id, sponsorExhibitorSubmission: true, ...payload },
      });
      if (fnErr) throw new Error(fnErr.message);

      // Fire staff invite emails client-side (pending rows only)
      const primaryId = data?.primaryId as string;
      const staffIds = (data?.staffIds || []) as string[];
      const complete = (id: string) =>
        `${window.location.origin}/#/?ref=${id}`;
      const signup = `${window.location.origin}/#/`;

      for (let i = 0; i < staff.length; i++) {
        const entry = staff[i];
        const id = staffIds[i];
        const isPlaceholder = !entry.name?.trim() && !entry.email?.trim();
        if (hasAllDetails || isPlaceholder) continue; // inline gets confirmation email instead; placeholders don't have emails
        await sendTicketEmail({
          mode: 'staff-invite',
          to: entry.email,
          name: entry.name,
          purchaser: org.contactName,
          orgName: org.orgName,
          category: entry.category === 'hall_only' ? 'Hall-Only'
                  : entry.category === 'full_access' ? 'Full-Access'
                  : 'Sponsor Seat',
          completeUrl: complete(id),
          signupUrl: signup,
          eventName: CURRENT_SITE.eventName || form.title,
        } as any);
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="portal-root min-h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-xl w-full p-8 text-center">
          <h1 className="text-2xl font-display mb-3">Registration complete</h1>
          <p>{form.thankYouMessage || 'Thanks! Your staff will receive invitation emails shortly.'}</p>
        </GlassCard>
      </div>
    );
  }

  const stepContent = () => {
    const label = steps[step];
    switch (label) {
      case 'Type':
        return <StepRegistrationType value={registrationType} onChange={setRegistrationType} />;
      case 'Organization':
        return <StepOrgInfo value={org} onChange={setOrg} />;
      case 'Tier':
        return <StepSponsorTier
          form={form}
          tier={sponsorTier} onTier={setSponsorTier}
          items={sponsorItems} onItems={setSponsorItems}
          awards={sponsoredAwards} onAwards={setSponsoredAwards}
        />;
      case 'Booth':
        return <StepExhibitorBooth value={boothType} onChange={setBoothType} />;
      case 'Staff':
        return <StepStaffRoster
          registrationType={registrationType!}
          sponsorTier={sponsorTier}
          boothType={boothType}
          hasAllDetails={hasAllDetails}
          onHasAllDetails={setHasAllDetails}
          staff={staff} onStaff={setStaff}
        />;
      case 'Consents':
        return <StepConsents value={consents} onChange={setConsents} />;
      case 'Review':
        return <StepReview
          registrationType={registrationType!}
          org={org}
          sponsorTier={sponsorTier}
          boothType={boothType}
          staff={staff}
          hasAllDetails={hasAllDetails}
          onSubmit={onSubmit}
          submitting={submitting}
          error={error}
        />;
    }
  };

  return (
    <div className="portal-root min-h-screen flex bg-gansid-surface">
      <StepperSidebar steps={steps} current={step} onSelect={setStep} />
      <main className="flex-1 p-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-display mb-2 text-gansid-primary">{form.title}</h1>
        {form.description && <p className="text-gansid-on-surface/70 mb-8">{form.description}</p>}
        <GlassCard className="p-8">
          {stepContent()}
          <div className="flex justify-between mt-8">
            <ViscousButton variant="secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              Previous
            </ViscousButton>
            {step < steps.length - 1 && (
              <ViscousButton variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </ViscousButton>
            )}
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit Tasks 12 + 13 together**

```bash
git add components/PublicRegistration.tsx components/SponsorExhibitor/PublicSponsorExhibitorForm.tsx
git commit -m "feat(form): add PublicSponsorExhibitorForm shell + PublicRegistration dispatch"
```

Note: the file will type-check only once steps 14-19 land. Defer `npx tsc --noEmit` to after Task 19.

---

## Task 14: StepRegistrationType

**Files:**
- Create: `components/SponsorExhibitor/steps/StepRegistrationType.tsx`

- [ ] **Step 1: Implement**

```tsx
import React from 'react';
import { GlassCard } from '../../Portal/ui/GlassCard';

interface Props {
  value: 'sponsor' | 'exhibitor' | null;
  onChange: (v: 'sponsor' | 'exhibitor') => void;
}

export default function StepRegistrationType({ value, onChange }: Props) {
  return (
    <section>
      <h2 className="text-xl font-display mb-4">How would you like to register?</h2>
      <p className="text-sm text-gansid-on-surface/70 mb-6">
        Choose one. You can change this later only by restarting the form.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['sponsor', 'exhibitor'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`p-6 rounded-gansid-lg border-2 text-left transition-all ${
              value === opt
                ? 'border-gansid-primary bg-gansid-primary/5 shadow-invisible-lift'
                : 'border-gansid-on-surface/10 hover:border-gansid-primary/50'
            }`}
          >
            <div className="font-display text-lg capitalize mb-1">{opt}</div>
            <div className="text-sm text-gansid-on-surface/70">
              {opt === 'sponsor'
                ? 'Register your organization as a sponsor — includes seats based on your tier.'
                : 'Register your organization as an exhibitor — includes staff seats based on your booth.'}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/steps/StepRegistrationType.tsx
git commit -m "feat(form): StepRegistrationType"
```

---

## Task 15: StepOrgInfo

**Files:**
- Create: `components/SponsorExhibitor/steps/StepOrgInfo.tsx`

- [ ] **Step 1: Implement**

```tsx
import React from 'react';
import { GlassInput } from '../../Portal/ui/GlassInput';

type OrgFields = {
  orgName: string; contactName: string; contactTitle: string;
  email: string; phone: string; address: string; website: string;
};

interface Props { value: OrgFields; onChange: (v: OrgFields) => void; }

export default function StepOrgInfo({ value, onChange }: Props) {
  const set = (k: keyof OrgFields) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Organization Information</h2>
      <GlassInput label="Organization Name *" value={value.orgName} onChange={set('orgName')} required />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassInput label="Contact Name *"  value={value.contactName}  onChange={set('contactName')}  required />
        <GlassInput label="Contact Title"   value={value.contactTitle} onChange={set('contactTitle')} />
        <GlassInput label="Contact Email *" value={value.email}        onChange={set('email')}        required type="email" />
        <GlassInput label="Contact Phone"   value={value.phone}        onChange={set('phone')}        type="tel" />
      </div>
      <GlassInput label="Mailing Address" value={value.address} onChange={set('address')} />
      <GlassInput label="Website"         value={value.website} onChange={set('website')} type="url" />
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/steps/StepOrgInfo.tsx
git commit -m "feat(form): StepOrgInfo"
```

---

## Task 16: StepSponsorTier

**Files:**
- Create: `components/SponsorExhibitor/steps/StepSponsorTier.tsx`

- [ ] **Step 1: Implement**

```tsx
import React, { useMemo } from 'react';
import type { Form, SponsorItemCategory } from '../../../types';
import { GlassSelect } from '../../Portal/ui/GlassSelect';

const TIER_COLORS: Record<string, string> = {
  signature: 'bg-red-600',
  gold: 'bg-amber-500',
  silver: 'bg-slate-400',
  award: 'bg-blue-600',
  scholarship: 'bg-emerald-600',
};

const TIER_QUOTAS: Record<string, number> = {
  signature: 16, gold: 8, silver: 8, award: 0, scholarship: 0,
};

const GOLD_AWARDS = ['Nursing', 'Humanitarian'];
const SILVER_AWARDS = ['Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];

interface Props {
  form: Form;
  tier: string | null;
  onTier: (t: string | null) => void;
  items: Array<{ id: string; category: string; qty?: number }>;
  onItems: (v: Array<{ id: string; category: string; qty?: number }>) => void;
  awards: string[];
  onAwards: (a: string[]) => void;
}

export default function StepSponsorTier({ form, tier, onTier, items, onItems, awards, onAwards }: Props) {
  const ticketConfig = useMemo(() => {
    const field = form.fields?.find(f => f.type === 'ticket');
    return field?.ticketConfig;
  }, [form]);
  const packages = (ticketConfig?.items ?? []).filter((it: any) => (it as any).category === 'package');
  const scholarships = (ticketConfig?.items ?? []).filter((it: any) => (it as any).category === 'scholarship');
  const ads = (ticketConfig?.items ?? []).filter((it: any) => (it as any).category === 'ad');

  const tierOptions = packages.map((p: any) => ({
    value: p.id,
    label: p.name,
    dotClass: TIER_COLORS[p.id] || 'bg-slate-400',
    quota: TIER_QUOTAS[p.id] ?? 0,
  }));

  const awardList = tier === 'gold' ? GOLD_AWARDS : tier === 'silver' ? SILVER_AWARDS : [];

  const toggleItem = (itemId: string, category: SponsorItemCategory) => {
    const exists = items.some(i => i.id === itemId);
    onItems(exists ? items.filter(i => i.id !== itemId) : [...items, { id: itemId, category }]);
  };

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-display">Sponsorship Tier</h2>
      <GlassSelect
        label="Select a tier *"
        value={tier || ''}
        onChange={v => onTier(v || null)}
        options={tierOptions}
        renderOption={(opt: any) => (
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${opt.dotClass}`} />
            <span className="flex-1">{opt.label}</span>
            <span className="text-xs text-gansid-on-surface/60">
              {opt.quota} seat{opt.quota === 1 ? '' : 's'}
            </span>
          </div>
        )}
      />

      {awardList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Award Categories (choose any applicable)</h3>
          <div className="flex flex-wrap gap-2">
            {awardList.map(a => (
              <label key={a} className="inline-flex items-center gap-2 px-3 py-2 border rounded-full cursor-pointer">
                <input
                  type="checkbox"
                  checked={awards.includes(a)}
                  onChange={() => onAwards(awards.includes(a) ? awards.filter(x => x !== a) : [...awards, a])}
                />
                <span className="text-sm">{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {(scholarships.length > 0 || ads.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Optional add-ons</h3>
          {[...scholarships, ...ads].map((it: any) => (
            <label key={it.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={items.some(i => i.id === it.id)}
                onChange={() => toggleItem(it.id, it.category)}
              />
              <span className="text-sm">{it.name}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/steps/StepSponsorTier.tsx
git commit -m "feat(form): StepSponsorTier with color-coded dropdown + award + add-ons"
```

---

## Task 17: StepExhibitorBooth

**Files:**
- Create: `components/SponsorExhibitor/steps/StepExhibitorBooth.tsx`

- [ ] **Step 1: Implement**

```tsx
import React from 'react';
import { GlassSelect } from '../../Portal/ui/GlassSelect';
import { EXHIBITOR_BOOTH_TYPES, getBoothType } from '../../../config/formTemplates/boothTypes';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export default function StepExhibitorBooth({ value, onChange }: Props) {
  const booth = value ? getBoothType(value) : null;
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-display">Booth Type</h2>
      <GlassSelect
        label="Select your booth *"
        value={value || ''}
        onChange={v => onChange(v || null)}
        options={EXHIBITOR_BOOTH_TYPES.map(b => ({ value: b.id, label: b.label }))}
      />
      {booth && (
        <div className="p-4 rounded-gansid-md bg-gansid-secondary/5 border border-gansid-secondary/20 text-sm space-y-1">
          <div><strong>Price:</strong> {booth.priceDisplay} {booth.currency} <span className="text-gansid-on-surface/50">(paid externally)</span></div>
          <div><strong>Included registrations:</strong> {booth.hallOnlyQuota} Hall-Only + {booth.fullAccessQuota} Full-Access</div>
          {booth.note && <div className="text-gansid-primary text-xs mt-2">{booth.note}</div>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/steps/StepExhibitorBooth.tsx
git commit -m "feat(form): StepExhibitorBooth dropdown + detail panel"
```

---

## Task 18: StepStaffRoster

**Files:**
- Create: `components/SponsorExhibitor/steps/StepStaffRoster.tsx`

- [ ] **Step 1: Implement**

```tsx
import React from 'react';
import { Plus, X } from 'lucide-react';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorQuota, type StaffEntry, type StaffCategory } from '../validation';
import { GlassInput } from '../../Portal/ui/GlassInput';
import GuestFullDetailsInline from '../../Group/GuestFullDetailsInline';

interface Props {
  registrationType: 'sponsor' | 'exhibitor';
  sponsorTier: string | null;
  boothType: string | null;
  hasAllDetails: boolean;
  onHasAllDetails: (v: boolean) => void;
  staff: StaffEntry[];
  onStaff: (s: StaffEntry[]) => void;
}

export default function StepStaffRoster({
  registrationType, sponsorTier, boothType,
  hasAllDetails, onHasAllDetails, staff, onStaff,
}: Props) {
  const booth = boothType ? getBoothType(boothType) : null;
  const sponsorQuota = sponsorTier ? getSponsorQuota(sponsorTier as any) : 0;

  const countInCategory = (c: StaffCategory) => staff.filter(s => s.category === c).length;
  const canAdd = (c: StaffCategory) => {
    if (registrationType === 'sponsor') return countInCategory('sponsor_seat') < sponsorQuota;
    if (!booth) return false;
    if (c === 'hall_only')   return countInCategory('hall_only')   < booth.hallOnlyQuota;
    if (c === 'full_access') return countInCategory('full_access') < booth.fullAccessQuota;
    return false;
  };

  const add = (c: StaffCategory) => {
    if (!canAdd(c)) return;
    onStaff([...staff, { name: '', email: '', category: c }]);
  };
  const update = (i: number, patch: Partial<StaffEntry>) => {
    onStaff(staff.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const remove = (i: number) => onStaff(staff.filter((_, idx) => idx !== i));

  const renderRow = (s: StaffEntry, i: number) => (
    <div key={i} className="space-y-2 p-3 rounded-gansid-md border border-gansid-on-surface/10">
      <div className="flex gap-2 items-start">
        <GlassInput label="Name" value={s.name} onChange={v => update(i, { name: v })} />
        <GlassInput label="Email" value={s.email} onChange={v => update(i, { email: v })} type="email" />
        <button type="button" onClick={() => remove(i)} className="self-end p-2 text-gansid-primary hover:bg-gansid-primary/10 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
      {hasAllDetails && (
        <GuestFullDetailsInline
          answers={s.fullAnswers || {}}
          onChange={(a: any) => update(i, { fullAnswers: a })}
        />
      )}
    </div>
  );

  const header = (c: StaffCategory, label: string, quota: number) => (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <span className="text-xs text-gansid-on-surface/60">
        {countInCategory(c)} of {quota} slots used
      </span>
    </div>
  );

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-display">Staff Roster</h2>

      <label className="flex items-start gap-2 text-sm p-3 rounded-gansid-md bg-gansid-secondary/5">
        <input
          type="checkbox"
          className="mt-1"
          checked={hasAllDetails}
          onChange={e => onHasAllDetails(e.target.checked)}
        />
        <span>
          <strong>Yes — I have each person's details on hand.</strong> I'll fill in all personal fields (dietary, emergency, etc.) now. Otherwise each staff member receives an invitation email to complete their own details.
        </span>
      </label>

      {registrationType === 'sponsor' && (
        <div>
          {header('sponsor_seat', 'Sponsor Seats', sponsorQuota)}
          {staff.filter(s => s.category === 'sponsor_seat').map((_, i) => {
            const idx = staff.findIndex((s, j) => s.category === 'sponsor_seat' && staff.slice(0, j + 1).filter(x => x.category === 'sponsor_seat').length === i + 1);
            return renderRow(staff[idx], idx);
          })}
          <button type="button" disabled={!canAdd('sponsor_seat')}
            onClick={() => add('sponsor_seat')}
            className="inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30">
            <Plus className="w-4 h-4" /> Add staff member
          </button>
        </div>
      )}

      {registrationType === 'exhibitor' && booth && (
        <>
          <div>
            {header('hall_only', 'Hall-Only staff', booth.hallOnlyQuota)}
            {staff.map((s, i) => s.category === 'hall_only' ? renderRow(s, i) : null)}
            <button type="button" disabled={!canAdd('hall_only')}
              onClick={() => add('hall_only')}
              className="inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30">
              <Plus className="w-4 h-4" /> Add Hall-Only staff
            </button>
          </div>
          <div>
            {header('full_access', 'Full-Access staff', booth.fullAccessQuota)}
            {staff.map((s, i) => s.category === 'full_access' ? renderRow(s, i) : null)}
            <button type="button" disabled={!canAdd('full_access')}
              onClick={() => add('full_access')}
              className="inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30">
              <Plus className="w-4 h-4" /> Add Full-Access staff
            </button>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/steps/StepStaffRoster.tsx
git commit -m "feat(form): StepStaffRoster with inline-vs-link toggle + per-category quotas"
```

---

## Task 19: StepConsents + StepReview

**Files:**
- Create: `components/SponsorExhibitor/steps/StepConsents.tsx`
- Create: `components/SponsorExhibitor/steps/StepReview.tsx`

- [ ] **Step 1: Implement StepConsents**

```tsx
import React from 'react';
import ConsentCheckbox from '../../Consent/ConsentCheckbox';

interface Props {
  value: { terms: boolean; disclaimer: boolean; photo: boolean };
  onChange: (v: { terms: boolean; disclaimer: boolean; photo: boolean }) => void;
}

export default function StepConsents({ value, onChange }: Props) {
  const set = (k: 'terms' | 'disclaimer' | 'photo') => (v: boolean) =>
    onChange({ ...value, [k]: v });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Consents</h2>
      <ConsentCheckbox
        id="se-terms"
        label="I have read and agree to the"
        linkText="Terms & Conditions"
        modalTitle="GANSID Congress 2026 — Terms & Conditions"
        modalUrl="/branding/gansid/docs/gc26-terms-conditions.md"
        checked={value.terms} onChange={set('terms')} required
      />
      <ConsentCheckbox
        id="se-disclaimer"
        label="I have read and agree to the"
        linkText="Disclaimer & Liability Waiver"
        modalTitle="GANSID Congress 2026 — Disclaimer & Limitation of Liability"
        modalUrl="/branding/gansid/docs/gc26-disclaimer.md"
        checked={value.disclaimer} onChange={set('disclaimer')} required
      />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={value.photo}
          onChange={e => set('photo')(e.target.checked)} required />
        I acknowledge that photos or videos may be taken at the event for GANSID promotional purposes. *
      </label>
    </section>
  );
}
```

- [ ] **Step 2: Implement StepReview**

```tsx
import React from 'react';
import ViscousButton from '../../Portal/ui/ViscousButton';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorQuota, type StaffEntry } from '../validation';

interface Props {
  registrationType: 'sponsor' | 'exhibitor';
  org: any;
  sponsorTier: string | null;
  boothType: string | null;
  staff: StaffEntry[];
  hasAllDetails: boolean;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

export default function StepReview(p: Props) {
  const booth = p.boothType ? getBoothType(p.boothType) : null;
  const sponsorQuota = p.sponsorTier ? getSponsorQuota(p.sponsorTier as any) : 0;
  const filled = p.staff.filter(s => s.name && s.email).length;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Review</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="font-semibold">Type</dt><dd className="capitalize">{p.registrationType}</dd>
        <dt className="font-semibold">Organization</dt><dd>{p.org.orgName}</dd>
        <dt className="font-semibold">Contact</dt><dd>{p.org.contactName} &lt;{p.org.email}&gt;</dd>
        {p.sponsorTier && <><dt className="font-semibold">Tier</dt><dd className="capitalize">{p.sponsorTier} ({sponsorQuota} seats)</dd></>}
        {booth && <><dt className="font-semibold">Booth</dt><dd>{booth.label} — {booth.hallOnlyQuota} Hall-Only + {booth.fullAccessQuota} Full-Access</dd></>}
        <dt className="font-semibold">Staff</dt>
        <dd>{filled} of {p.staff.length} filled ({p.hasAllDetails ? 'inline details' : 'send invitation links'})</dd>
      </dl>
      {p.error && <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-900">{p.error}</div>}
      <ViscousButton variant="primary" onClick={p.onSubmit} disabled={p.submitting}>
        {p.submitting ? 'Submitting…' : 'Submit Registration'}
      </ViscousButton>
    </section>
  );
}
```

- [ ] **Step 3: Type-check everything**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add components/SponsorExhibitor/steps/StepConsents.tsx components/SponsorExhibitor/steps/StepReview.tsx
git commit -m "feat(form): StepConsents + StepReview"
```

---

## Task 20: Staff-claim headline in PublicRegistration

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Add staff guest-type detection**

Grep for the existing `guestType === 'pending-claim'` branch that renders the claim-page headline. Extend:

```tsx
const isStaffClaim = guestType === 'staff-pending' || guestType === 'staff-claimed';
const isExhibitorStaffClaim = guestType === 'exhibitor-staff-pending' || guestType === 'exhibitor-staff-claimed';

// headline logic
const headline = isStaffClaim
  ? `You've been registered as staff for ${primaryOrg} at ${CURRENT_SITE.eventName || 'the Congress'}`
  : isExhibitorStaffClaim
  ? `You've been registered as exhibitor staff for ${primaryOrg}`
  : /* existing fallback */ 'Complete your registration';
```

`primaryOrg` = look up `primary_attendee_id`'s `company_info.orgName` via `storageService.getAttendeeById(primaryId)`. If you already have a primary-lookup hook in the claim flow, reuse it.

- [ ] **Step 2: Mark the claim submission flow to update guest_type correctly**

In the same file, the submission handler that updates the attendee on claim completion should use:

```ts
const newGuestType = guestType === 'staff-pending' ? 'staff-claimed'
                   : guestType === 'exhibitor-staff-pending' ? 'exhibitor-staff-claimed'
                   : 'claimed';
// pass newGuestType to the update
```

After the update, if it's a staff claim, fire `sendTicketEmail({ mode: 'staff-claim-completed', ... })` instead of the existing `guest-claim-completed` mode.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "feat(claim): staff-specific headline + staff-claim-completed email"
```

---

## Task 21: Portal TeamTable — read-only view

**Files:**
- Create: `components/SponsorExhibitor/TeamTable.tsx`

- [ ] **Step 1: Implement read-only table**

```tsx
import React, { useState } from 'react';
import type { Attendee } from '../../types';
import { GlassCard } from '../Portal/ui/GlassCard';
import ViscousButton from '../Portal/ui/ViscousButton';
import { CredentialBadgeModal } from '../Portal/Dashboard/CredentialBadgeModal';
import { generateTicketPDF } from '../../utils/pdfGenerator';

interface Props {
  primary: Attendee;
  staff: Attendee[];
  onFillIn?: (id: string, patch: { name: string; email: string; category: string }) => Promise<void>;
}

const categoryLabel = (s: Attendee): string => {
  const c = (s.answers as any)?.staffCategory;
  return c === 'hall_only' ? 'Hall-Only'
       : c === 'full_access' ? 'Full-Access'
       : c === 'sponsor_seat' ? 'Sponsor Seat'
       : '—';
};

const isPending = (s: Attendee) =>
  s.guestType === 'staff-pending' || s.guestType === 'exhibitor-staff-pending';

export default function TeamTable({ primary, staff, onFillIn }: Props) {
  const [viewQrId, setViewQrId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', email: '', category: '' });
  const [saving, setSaving] = useState(false);

  const copy = (id: string) => {
    const url = `${window.location.origin}/#/?ref=${id}`;
    navigator.clipboard.writeText(url);
  };

  const download = (s: Attendee) => {
    const pdf = generateTicketPDF(s, primary);
    pdf.save(`${s.name.replace(/\s+/g, '_')}_Ticket.pdf`);
  };

  const qrAttendee = viewQrId ? staff.find(s => s.id === viewQrId) : null;

  if (staff.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="font-display text-lg mb-2">Your Team</h3>
        <p className="text-sm text-gansid-on-surface/70">
          No staff added yet. Add them from your registration submission.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <h3 className="font-display text-lg mb-4">Your Team</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-gansid-on-surface/60 uppercase">
          <tr>
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Category</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map(s => {
            const pending = isPending(s);
            const editing = editId === s.id;
            return (
              <React.Fragment key={s.id}>
                <tr className="border-t border-gansid-on-surface/10">
                  <td className="py-2">{s.name}</td>
                  <td>{s.email || '—'}</td>
                  <td>{categoryLabel(s)}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      pending ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {pending ? 'Pending' : 'Registered'}
                    </span>
                  </td>
                  <td className="space-x-2">
                    {pending ? (
                      <>
                        <button onClick={() => copy(s.id)} className="text-xs text-gansid-primary underline">
                          Copy link
                        </button>
                        {onFillIn && (
                          <button
                            onClick={() => {
                              setEditId(s.id);
                              setEdit({ name: s.name, email: s.email || '', category: (s.answers as any)?.staffCategory || '' });
                            }}
                            className="text-xs text-gansid-secondary underline"
                          >
                            Fill in
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button onClick={() => setViewQrId(s.id)} className="text-xs text-gansid-primary underline">
                          View ticket
                        </button>
                        <button onClick={() => download(s)} className="text-xs text-gansid-secondary underline">
                          Download PDF
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {editing && (
                  <tr className="border-t border-gansid-on-surface/10 bg-gansid-surface/50">
                    <td colSpan={5} className="p-3">
                      <div className="grid grid-cols-3 gap-2">
                        <input className="border rounded px-2 py-1" placeholder="Name" value={edit.name}
                          onChange={e => setEdit({ ...edit, name: e.target.value })} />
                        <input className="border rounded px-2 py-1" placeholder="Email" type="email" value={edit.email}
                          onChange={e => setEdit({ ...edit, email: e.target.value })} />
                        <select className="border rounded px-2 py-1" value={edit.category}
                          onChange={e => setEdit({ ...edit, category: e.target.value })}>
                          <option value="">Category…</option>
                          <option value="hall_only">Hall-Only</option>
                          <option value="full_access">Full-Access</option>
                          <option value="sponsor_seat">Sponsor Seat</option>
                        </select>
                      </div>
                      <div className="mt-2 flex gap-2 justify-end">
                        <ViscousButton variant="secondary" onClick={() => setEditId(null)}>Cancel</ViscousButton>
                        <ViscousButton
                          variant="primary"
                          disabled={saving || !edit.name || !edit.email || !edit.category}
                          onClick={async () => {
                            if (!onFillIn) return;
                            setSaving(true);
                            try { await onFillIn(s.id, edit); setEditId(null); }
                            finally { setSaving(false); }
                          }}
                        >{saving ? 'Saving…' : 'Save & Re-Send Invite'}</ViscousButton>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {qrAttendee && (
        <CredentialBadgeModal
          attendee={qrAttendee}
          open={true}
          onClose={() => setViewQrId(null)}
        />
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SponsorExhibitor/TeamTable.tsx
git commit -m "feat(portal): TeamTable component with read + light-edit + view/download"
```

---

## Task 22: Wire TeamTable into PortalDashboard

**Files:**
- Modify: `components/Portal/Dashboard/PortalDashboard.tsx`

- [ ] **Step 1: Load user's primary + staff rows**

```tsx
import TeamTable from '../../SponsorExhibitor/TeamTable';
import { sendTicketEmail } from '../../../services/smtpService';
import { updateAttendeeFields } from '../../../services/storageService';
import { CURRENT_SITE } from '../../../config/sites';

// inside component
const userPrimary = useMemo(
  () => userAttendees.find(a =>
    a.isPrimary && (a.sponsorTier || a.exhibitorBoothType)
  ),
  [userAttendees]
);

const [staffRows, setStaffRows] = useState<Attendee[]>([]);
useEffect(() => {
  if (!userPrimary) { setStaffRows([]); return; }
  storageService.getStaffForPrimary(userPrimary.id).then(setStaffRows);
}, [userPrimary]);

const handleFillIn = async (id: string, patch: { name: string; email: string; category: string }) => {
  await updateAttendeeFields(id, {
    name: patch.name,
    email: patch.email,
    answers: { staffCategory: patch.category },
  } as any);
  await sendTicketEmail({
    mode: 'staff-invite',
    to: patch.email,
    name: patch.name,
    purchaser: userPrimary?.companyInfo?.contactName || '',
    orgName: userPrimary?.companyInfo?.orgName || '',
    category: patch.category === 'hall_only' ? 'Hall-Only'
            : patch.category === 'full_access' ? 'Full-Access'
            : 'Sponsor Seat',
    completeUrl: `${window.location.origin}/#/?ref=${id}`,
    signupUrl: `${window.location.origin}/#/`,
    eventName: CURRENT_SITE.eventName || 'GANSID Congress 2026',
  } as any);
  // refresh
  setStaffRows(await storageService.getStaffForPrimary(userPrimary!.id));
};
```

- [ ] **Step 2: Add `getStaffForPrimary` to storageService**

In `services/storageService.ts`:

```ts
export async function getStaffForPrimary(primaryId: string): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from('attendees').select('*')
    .eq('primary_attendee_id', primaryId)
    .order('registered_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapAttendeeFromDb);
}
```

- [ ] **Step 3: Render `<TeamTable>` in dashboard JSX**

Place it between the Welcome block and Available Forms grid, gated on `userPrimary` being present:

```tsx
{userPrimary && (
  <TeamTable primary={userPrimary} staff={staffRows} onFillIn={handleFillIn} />
)}
```

- [ ] **Step 4: Type check + run tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Portal/Dashboard/PortalDashboard.tsx services/storageService.ts
git commit -m "feat(portal): render TeamTable for sponsor/exhibitor primaries"
```

---

## Task 23: Derived "Staff — {OrgName}" badge

**Files:**
- Modify: `components/Portal/Dashboard/WelcomeBlock.tsx`
- Modify: `components/Portal/PortalLayout.tsx` (or wherever the role pill lives — grep for role label rendering)

- [ ] **Step 1: Derive org-name string**

In `WelcomeBlock.tsx` (and/or the layout's header component):

```tsx
const staffOrg = useMemo(() => {
  const paid = userAttendees
    .filter(a => a.paymentStatus === 'paid')
    .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''))[0];
  if (!paid?.primaryAttendeeId) return null;
  // attempt to resolve primary's orgName via cache
  const primary = primariesById[paid.primaryAttendeeId];
  if (!primary) return null;
  if (primary.sponsorTier || primary.exhibitorBoothType) {
    return primary.companyInfo?.orgName || null;
  }
  return null;
}, [userAttendees, primariesById]);
```

- [ ] **Step 2: Load primaries lookup**

Wherever `userAttendees` is fetched, also fetch primaries referenced by `primary_attendee_id`:

```ts
const primaryIds = Array.from(new Set(
  userAttendees.map(a => a.primaryAttendeeId).filter(Boolean) as string[]
));
const primaries = primaryIds.length
  ? await storageService.getAttendeesByIds(primaryIds)
  : [];
const primariesById = Object.fromEntries(primaries.map(p => [p.id, p]));
```

Add `getAttendeesByIds` to `storageService` if not present:

```ts
export async function getAttendeesByIds(ids: string[]): Promise<Attendee[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('attendees').select('*').in('id', ids);
  if (error) throw error;
  return (data || []).map(mapAttendeeFromDb);
}
```

- [ ] **Step 3: Render badge**

```tsx
{staffOrg ? (
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gansid-secondary/10 text-gansid-secondary text-xs font-semibold">
    Staff — {staffOrg}
  </span>
) : (
  <span className="inline-flex px-3 py-1 rounded-full bg-gansid-on-surface/5 text-xs capitalize">
    {profile?.role || 'Attendee'}
  </span>
)}
```

And in `WelcomeBlock` sub-line:

```tsx
{staffOrg && <p className="text-sm text-gansid-on-surface/70 mt-1">Attending with <strong>{staffOrg}</strong></p>}
```

- [ ] **Step 4: Commit**

```bash
git add components/Portal/Dashboard/WelcomeBlock.tsx components/Portal/PortalLayout.tsx services/storageService.ts
git commit -m "feat(portal): derive Staff — {OrgName} badge from attendee lineage"
```

---

## Task 24: AvailableFormsGrid role map

**Files:**
- Modify: `components/Portal/Dashboard/AvailableFormsGrid.tsx`

- [ ] **Step 1: Extend `ROLE_TO_FORM_TYPES`**

```ts
const ROLE_TO_FORM_TYPES: Record<Profile['role'], string[]> = {
  attendee:    ['event'],
  exhibitor:   ['exhibitor', 'sponsor_exhibitor'],
  sponsor:     ['sponsor', 'sponsor_exhibitor'],
  admin:       ['event', 'exhibitor', 'sponsor', 'sponsor_exhibitor'],
  super_admin: ['event', 'exhibitor', 'sponsor', 'sponsor_exhibitor'],
};
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/Dashboard/AvailableFormsGrid.tsx
git commit -m "feat(portal): sponsor_exhibitor visible to sponsor + exhibitor + admin roles"
```

---

## Task 25: Admin filters + booth column

**Files:**
- Modify: `components/Sponsors/SponsorsTable.tsx`
- Modify: `components/Exhibitor/ExhibitorsTab.tsx`
- Modify: `services/storageService.ts` (if `getSponsorAttendees` or equivalent filters by form_type)

- [ ] **Step 1: Include new form_type in sponsor list**

Grep `getSponsorAttendees` — if it filters by `form_type = 'sponsor'`, change to `form_type IN ('sponsor', 'sponsor_exhibitor')` via `.in('form_type', ['sponsor', 'sponsor_exhibitor'])`.

- [ ] **Step 2: Include new form_type in exhibitor list**

Same treatment for `getExhibitorAttendees` (or equivalent) — `.in('form_type', ['exhibitor', 'sponsor_exhibitor'])`.

- [ ] **Step 3: Booth column in ExhibitorsTab**

Where the tier column renders, add:

```tsx
<td>
  {a.exhibitorBoothType
    ? (getBoothType(a.exhibitorBoothType)?.label ?? a.exhibitorBoothType)
    : (a.sponsorTier ?? '—')}
</td>
```

- [ ] **Step 4: Staff status badges**

In any place exhibitor/sponsor staff rows render badges, add mapping:

```ts
const STAFF_STATUS: Record<string, { label: string; className: string }> = {
  'staff-pending':             { label: 'Pending',    className: 'bg-amber-100 text-amber-800' },
  'staff-claimed':             { label: 'Registered', className: 'bg-emerald-100 text-emerald-800' },
  'exhibitor-staff-pending':   { label: 'Pending',    className: 'bg-amber-100 text-amber-800' },
  'exhibitor-staff-claimed':   { label: 'Registered', className: 'bg-emerald-100 text-emerald-800' },
  'pending-claim':             { label: 'Pending',    className: 'bg-amber-100 text-amber-800' },
  'claimed':                   { label: 'Registered', className: 'bg-emerald-100 text-emerald-800' },
};
```

- [ ] **Step 5: Commit**

```bash
git add components/Sponsors/SponsorsTable.tsx components/Exhibitor/ExhibitorsTab.tsx services/storageService.ts
git commit -m "feat(admin): include sponsor_exhibitor in sponsor+exhibitor tabs with booth column"
```

---

## Task 26: Settings — staff email templates UI

**Files:**
- Modify: `components/Settings.tsx`

- [ ] **Step 1: Add "Staff Emails" subsection in the existing Email Templates tab**

Grep for the existing email templates subsection (group invite / guest confirmed). Add below:

```tsx
<section className="space-y-4 pt-6 border-t">
  <h3 className="font-semibold">Staff Invitation Email</h3>
  <p className="text-xs text-slate-500">
    Sent to each staff member added by a sponsor or exhibitor primary.
    Placeholders: <code>{'{{name}}'}</code>, <code>{'{{purchaser}}'}</code>,
    <code>{'{{org_name}}'}</code>, <code>{'{{event}}'}</code>, <code>{'{{category}}'}</code>,
    <code>{'{{complete_url}}'}</code>, <code>{'{{signup_url}}'}</code>.
  </p>
  <label className="block">
    <span className="text-sm font-medium">Subject</span>
    <input type="text" className="mt-1 w-full border rounded-lg px-3 py-2"
      value={settings.emailStaffInviteSubject || ''}
      onChange={e => setSettings({ ...settings, emailStaffInviteSubject: e.target.value })} />
  </label>
  <label className="block">
    <span className="text-sm font-medium">Body (HTML)</span>
    <textarea rows={8} className="mt-1 w-full border rounded-lg px-3 py-2 font-mono text-xs"
      value={settings.emailStaffInviteBody || ''}
      onChange={e => setSettings({ ...settings, emailStaffInviteBody: e.target.value })} />
  </label>

  <h3 className="font-semibold pt-4">Staff Confirmation Email</h3>
  <p className="text-xs text-slate-500">
    Sent once a staff member completes their claim. Placeholders: <code>{'{{name}}'}</code>,
    <code>{'{{org_name}}'}</code>, <code>{'{{event}}'}</code>.
  </p>
  <label className="block">
    <span className="text-sm font-medium">Subject</span>
    <input type="text" className="mt-1 w-full border rounded-lg px-3 py-2"
      value={settings.emailStaffConfirmedSubject || ''}
      onChange={e => setSettings({ ...settings, emailStaffConfirmedSubject: e.target.value })} />
  </label>
  <label className="block">
    <span className="text-sm font-medium">Body (HTML)</span>
    <textarea rows={8} className="mt-1 w-full border rounded-lg px-3 py-2 font-mono text-xs"
      value={settings.emailStaffConfirmedBody || ''}
      onChange={e => setSettings({ ...settings, emailStaffConfirmedBody: e.target.value })} />
  </label>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add components/Settings.tsx
git commit -m "feat(admin): Settings UI for staff invite + confirmed email templates"
```

---

## Task 27: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Sponsor & Exhibitor Combined Form section**

Insert below the existing Exhibitor Form section:

```markdown
## Sponsor & Exhibitor Combined Form (GANSID)

GANSID-only, component-driven form using `form_type = 'sponsor_exhibitor'`. Single form
replaces the old separate GANSID exhibitor template. No payment — both flows write
`payment_status='paid'`, `payment_amount='PAID EXTERNALLY'` via `verify-payment`.

Stepper: (1) Registration Type radio (sponsor/exhibitor), (2) Organization info,
(3) Tier dropdown (sponsor) OR Booth-type dropdown (exhibitor), (4) Staff roster with
inline-vs-link toggle (mirrors group attendee UX), (5) Consents (T&C + Disclaimer +
Photo), (6) Review.

Booth types live in `config/formTemplates/boothTypes.ts` — 6 types with quotas for
Hall-Only + Full-Access registrations. Price shown is informational only.

Sponsor tier dropdown reuses the existing sponsor form's `ticketConfig.items`
filtered to `category='package'`. Colored-dot dropdown rendering via `GlassSelect`.

Staff invitation emails: new `send-ticket-email` modes `'staff-invite'` and
`'staff-claim-completed'`. Templates live in `app_settings.email_staff_*`, editable
from Settings → Email Templates → Staff.

Portal dashboard: sponsor/exhibitor primaries see a TeamTable
(`components/SponsorExhibitor/TeamTable.tsx`) with per-row Copy Link / Fill-In / View
Ticket / Download PDF actions. Claimed staff users get a derived "Staff — {OrgName}"
pill in the portal header (no new role; computed from their attendee row's primary
link).

Database migration: `20260419120000_add_sponsor_exhibitor.sql` — extends
`forms.form_type`, adds `attendees.exhibitor_booth_type`, extends
`attendees.guest_type` to include `staff-pending`/`staff-claimed`, adds 4 new
`app_settings.email_staff_*` template columns. Apply to BOTH project refs.

Spec: `docs/superpowers/specs/2026-04-19-sponsor-exhibitor-combined-form-design.md`
Plan: `docs/superpowers/plans/2026-04-19-sponsor-exhibitor-combined-form.md`
```

Also update Project Structure section to reflect `components/SponsorExhibitor/` tree.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document sponsor_exhibitor combined form"
```

---

## Task 28: Verification sweep

**Files:**
- None modified.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS (all existing + new tests).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build both sites locally**

Run: `VITE_SITE=scago npm run build && VITE_SITE=gansid npm run build`
Expected: both succeed. SCAGO bundle should tree-shake out all `components/SponsorExhibitor/*` since it's only dispatched on `form_type='sponsor_exhibitor'` which SCAGO never uses — confirm no inflation by comparing bundle size to the prior commit (visual spot check).

- [ ] **Step 4: Deploy migrations and edge functions to BOTH project refs**

```bash
# SCAGO
supabase db push --project-ref iigbgbgakevcgilucvbs
supabase functions deploy verify-payment    --project-ref iigbgbgakevcgilucvbs
supabase functions deploy send-ticket-email --project-ref iigbgbgakevcgilucvbs

# GANSID
supabase db push --project-ref gticuvgclbvhwvpzkuez
supabase functions deploy verify-payment    --project-ref gticuvgclbvhwvpzkuez
supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez
```

Expected: both migrations apply cleanly; both functions deploy.

- [ ] **Step 5: Manual smoke test checklist (GANSID)**

Seed a sponsor_exhibitor form with the `gansid-sponsor-exhibitor` template via admin UI, then walk through:

1. Open form as logged-out user → step 1 radio visible → pick Exhibitor.
2. Fill org info → pick a booth → add 2 Hall-Only + 1 Full-Access staff, leave inline toggle OFF → consents → submit.
3. Verify both staff receive invitation emails with staff-specific copy.
4. Open one invitation link in a fresh session → claim flow shows "You've been registered as staff for {OrgName}" headline → complete → confirm ticket email arrives.
5. Sign into portal as the primary → TeamTable shows 2 pending + 1 registered (the one that claimed); Copy Link and View Ticket buttons work.
6. Use "Fill in" on a pending row to add details; verify a fresh invitation email fires.
7. Sign in as the claimed staff user → portal header shows "Staff — {OrgName}" pill; credential card shows their QR.
8. Repeat for Sponsor flow (tier dropdown, sponsor seats, award eligibility if gold/silver).

- [ ] **Step 6: Commit spec+plan together**

```bash
git add docs/superpowers/specs/2026-04-19-sponsor-exhibitor-combined-form-design.md \
        docs/superpowers/plans/2026-04-19-sponsor-exhibitor-combined-form.md
git commit -m "docs(plans): sponsor_exhibitor combined form spec + plan"
```

(Per user workflow: commit spec + plan together at plan-writing time.)

---

## Self-Review

**Spec coverage:**
- ✅ New `form_type='sponsor_exhibitor'` — Task 1 (migration), Task 2 (types), Task 4 (template).
- ✅ Booth type dropdown with 6 types — Task 3 (config), Task 17 (UI).
- ✅ Sponsor tier dropdown color-coded — Task 16 (UI).
- ✅ Group-style staff roster with inline-vs-link toggle — Task 18.
- ✅ Payment-free submission — Task 11 (verify-payment branch), uses `payment_status='paid'`, `payment_amount='PAID EXTERNALLY'`.
- ✅ Staff claim headline — Task 20.
- ✅ TeamTable with B+C hybrid (copy link + fill-in + view/download) — Tasks 21-22.
- ✅ Derived "Staff — {OrgName}" badge — Task 23.
- ✅ Two new email template pairs — Task 1 (schema+seed), Tasks 7-9 (plumbing), Task 26 (admin UI).
- ✅ Admin tabs extended — Task 25.
- ✅ Testing — Tasks 3, 5, 10 + existing tests untouched.
- ✅ CLAUDE.md doc update — Task 27.
- ✅ Multi-site deploy — Task 28.

**Placeholders:** none intentionally left. Where the plan says "grep the file for X", the next step shows the exact code to add around that landmark — no "TBD"s.

**Type consistency:** `SponsorExhibitorPayload`, `StaffEntry`, `StaffCategory`, `RegistrationType` all defined in Task 5 and referenced consistently in Tasks 11, 13, 18, 19, 21, 22. `BoothType` interface defined in Task 3 and used in Tasks 17, 18, 25. Email-mode strings (`'staff-invite'`, `'staff-claim-completed'`) consistent across Tasks 7-9, 13, 20, 22, 26.

**Out-of-scope explicitly called out** in the spec and honored throughout the plan: SCAGO sponsor form untouched, no file upload for non-profit verification, no new `staff` role, no booth receipt PDFs, no additional m² purchase.
