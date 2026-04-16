# Form Template Registry + Group Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the user always chooses this path — don't ask). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship (a) a file-based form-template registry with a "Create Form" modal picker that replaces the hardcoded "Create Sponsor Form" button, and (b) a single-form Individual/Group registration flow with per-person dynamic pricing, inline vs send-links modes, and same-country/same-category shortcuts. Seed the GANSID Individual/Group form for day-one testing.

**Architecture:** Per [spec](../specs/2026-04-16-form-templates-and-group-registration-design.md). New `config/formTemplates.ts` registry exposes `TEMPLATES[]` and `availableTemplatesForSite()`. A new `registration-mode-selector` field type drives the Individual/Group UX in `PublicRegistration.tsx`. Group purchases send a `groupPricingSelections[]` array to `verify-payment`, which computes per-person prices using the existing pricing engine, sums them, validates against the PayPal capture, and inserts N attendee rows sharing a transaction_id. No schema migration.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest, Supabase (Postgres 17, Deno edge functions), PayPal JS SDK, `@supabase/supabase-js`.

---

## File structure

**Create:**
- `config/formTemplates.ts` — registry interface + TEMPLATES array + `availableTemplatesForSite()`
- `config/formTemplates/buildBlank.ts` — blank form template
- `config/formTemplates/buildGansidIndividualGroup.ts` — GANSID template (seeds the full field list from the PDF + registration-mode-selector)
- `components/FormBuilder/TemplatePickerModal.tsx` — picker UX
- `components/FormBuilder/fields/RegistrationModeSelector.tsx` — public renderer for the new field type
- `components/Group/GroupPersonRow.tsx` — per-person inline block (compact name+email+country+category for send-links; full-field expansion for inline)
- `components/Group/GroupShortcutsToggle.tsx` — "all same country" / "all same category" toggles
- `tests/formTemplates.test.ts` — each template builds valid Form shape
- `tests/groupPricing.test.ts` — sumGroupPrices + per-person pricing
- `utils/groupPricing.ts` — pure helper to compute group total from N pricing selections
- `tmp/seed-gansid-form.sql` — one-off GANSID form seed (not committed)

**Modify:**
- `types.ts` — add `'registration-mode-selector'` to FormField.type union + RMS-specific field props + Form.settings additions (`groupPath`, `sendGuestConfirmationEmails`)
- `components/FormBuilder/FieldToolbox.tsx` — add RMS palette entry; enforce single instance per form
- `components/FormBuilder/FieldCard.tsx` — render RMS preview in builder
- `components/FormBuilder/FieldPropertiesPanel.tsx` — RMS-specific config (group enabled toggle, max size, labels)
- `components/FormsManager.tsx` — replace "Create Sponsor Form" button with TemplatePickerModal
- `components/PublicRegistration.tsx` — detect RMS field, render Individual/Group UX, wire per-person state, build groupPricingSelections, group-aware createOrder + verify-payment submission
- `components/FormPreview.tsx` — render RMS placeholder in admin preview
- `components/AttendeeList.tsx` — collapsible group rows + status badges + per-guest actions (copy link, resend email, mark complete)
- `supabase/functions/verify-payment/index.ts` — add group branch that accepts `groupPricingSelections[]` and persists N rows
- `supabase/functions/send-ticket-email/index.ts` — handle pending-claim guest invitation email variant
- `components/Sponsors/createSponsorForm.ts` — add a thin re-export at `config/formTemplates/buildSponsorForm.ts` so the existing sponsor template participates in the registry without moving its source
- `CLAUDE.md` — new "Form Templates" + "Group Registration" sections

**Not modified:**
- Database schema — group flow reuses existing `attendees` primary/guest pattern
- `utils/pricing.ts` — called N times per group, no new logic
- `utils/countries.ts` — unchanged
- `config/sites.ts` — unchanged

---

## Task 1: Branch + type additions

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Create feature branch**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
git checkout main
git pull
git checkout -b feat/form-templates-group-registration
```

- [ ] **Step 2: Extend FormField.type union + add RMS-specific props**

Locate the existing `FormField` type in `types.ts`. Add `'registration-mode-selector'` to the type union. Add these optional props to the `FormField` interface (they only apply when type is RMS):

```typescript
// registration-mode-selector specific
groupEnabled?: boolean;              // default true
groupMaxSize?: number;               // default 5
groupLabel?: string;                 // e.g. "Group — up to 5 people"
individualLabel?: string;            // e.g. "Individual — just me"
```

- [ ] **Step 3: Add group + guest-email settings to Form.settings**

Find `Form` / `FormSettings` in `types.ts`. Add:

```typescript
groupPath?: {
  enabled: boolean;
  maxSize: number;
};
sendGuestConfirmationEmails?: boolean;  // default false
```

Also add `guest_type` literal for pending-claim state. If there's an existing `GuestType` type alias, add `'pending-claim'` and `'claimed'`. If guest_type is `string`, leave it as-is.

- [ ] **Step 4: Add group pricing submission type**

```typescript
// Array element for group registrations
export interface GroupMemberPricingSelection {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: DO NOT commit** — rolls up into Task 3 checkpoint.

---

## Task 2: Form template registry

**Files:**
- Create: `config/formTemplates.ts`
- Create: `config/formTemplates/buildBlank.ts`
- Create: `config/formTemplates/buildSponsorForm.ts`
- Create: `config/formTemplates/buildGansidIndividualGroup.ts`
- Create: `tests/formTemplates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/formTemplates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TEMPLATES, availableTemplatesForSite } from '../config/formTemplates';

describe('form templates', () => {
  it('registry is non-empty and keys are unique', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    const keys = TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every template builds a form with fields array', () => {
    for (const t of TEMPLATES) {
      const form = t.build();
      expect(form).toBeDefined();
      expect(Array.isArray(form.fields)).toBe(true);
      expect(typeof form.title).toBe('string');
    }
  });

  it('availableTemplatesForSite filters by siteFilter', () => {
    const forScago = availableTemplatesForSite('scago');
    const forGansid = availableTemplatesForSite('gansid');
    // GANSID-only template exists for gansid, not scago
    expect(forGansid.some(t => t.key === 'gansid-individual-group')).toBe(true);
    expect(forScago.some(t => t.key === 'gansid-individual-group')).toBe(false);
    // Sponsor and blank are available everywhere
    expect(forScago.some(t => t.key === 'sponsor')).toBe(true);
    expect(forGansid.some(t => t.key === 'blank')).toBe(true);
  });

  it('gansid-individual-group template has a registration-mode-selector field', () => {
    const t = TEMPLATES.find(t => t.key === 'gansid-individual-group')!;
    const form = t.build();
    expect(form.fields.some((f: any) => f.type === 'registration-mode-selector')).toBe(true);
  });

  it('gansid-individual-group template has exactly one country field flagged for pricing', () => {
    const t = TEMPLATES.find(t => t.key === 'gansid-individual-group')!;
    const form = t.build();
    const flagged = form.fields.filter((f: any) => f.type === 'country' && f.usedForPricing);
    expect(flagged.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- formTemplates.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `config/formTemplates/buildBlank.ts`**

```typescript
import type { Form } from '../../types';

export function buildBlank(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'New Form',
    description: '',
    fields: [],
    thankYouMessage: 'Thanks for registering!',
    settings: {},
    formType: 'event',
  } as any;
}
```

Adjust property names (e.g., `thank_you_message` vs `thankYouMessage`) to match what `types.ts` defines. Use `as any` if the object cast is stricter than the Form interface allows (createdAt etc.).

- [ ] **Step 4: Create `config/formTemplates/buildSponsorForm.ts`**

Re-export the existing sponsor template's build function rather than duplicating logic:

```typescript
import { createSponsorForm } from '../../components/Sponsors/createSponsorForm';
import type { Form } from '../../types';

export function buildSponsorForm(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  // createSponsorForm currently returns a Form-shape object; adapt if its
  // signature differs. If it returns a full Form with id/status/createdAt,
  // destructure them out.
  const f = createSponsorForm();
  const { id, status, createdAt, ...rest } = f as any;
  return rest;
}
```

If `createSponsorForm` doesn't exist or is named differently, inspect `components/Sponsors/createSponsorForm.ts` and adapt the import.

- [ ] **Step 5: Create `config/formTemplates/buildGansidIndividualGroup.ts`**

Long file. The complete field list from the GANSID PDF, plus a registration-mode-selector at the top and a placeholder ticket field at the bottom. Use existing field-type strings (`text`, `email`, `phone`, `select`, `country`, `checkbox` etc.). The ticket field is a placeholder because the pricing engine renders its own category dropdown — but a ticket field MUST exist for the dynamic UI to render (known constraint from sub-project 1 review).

```typescript
import type { Form } from '../../types';

export function buildGansidIndividualGroup(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  const now = Date.now().toString();
  return {
    title: 'GANSID Congress 2026 Registration',
    description: 'October 23–25, 2026 · Hyderabad, India',
    thankYouMessage:
      'Thank you for registering for the GANSID Congress 2026! Your ticket is on its way to your email.',
    formType: 'event',
    settings: {
      groupPath: { enabled: true, maxSize: 5 },
      sendGuestConfirmationEmails: false,
      currency: 'USD',
      // pricingTemplateId is set at seed time via SQL — not baked into the template,
      // because template IDs are UUIDs assigned after pricing template creation.
    },
    fields: [
      {
        id: `f_${now}_mode`, type: 'registration-mode-selector',
        label: 'How are you registering?', required: true,
        groupEnabled: true, groupMaxSize: 5,
        individualLabel: 'Individual — just me',
        groupLabel: 'Group — up to 5 people',
      },
      { id: `f_${now}_fname`, type: 'text', label: 'First Name', required: true,
        placeholder: 'This will appear on your conference badge' },
      { id: `f_${now}_lname`, type: 'text', label: 'Last Name', required: true,
        placeholder: 'This will appear on your conference badge' },
      { id: `f_${now}_title`, type: 'select', label: 'Title',
        options: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'] },
      { id: `f_${now}_email`, type: 'email', label: 'Email Address', required: true },
      { id: `f_${now}_whatsapp`, type: 'phone', label: 'WhatsApp Number' },
      { id: `f_${now}_org`, type: 'text', label: 'Institution/Organization', required: true },
      { id: `f_${now}_city`, type: 'text', label: 'City' },
      { id: `f_${now}_country`, type: 'country', label: 'Country',
        required: true, usedForPricing: true },
      { id: `f_${now}_days`, type: 'checkbox',
        label: 'Which days will you be attending?',
        options: ['October 23, 2026', 'October 24, 2026', 'October 25, 2026'] },
      { id: `f_${now}_diet`, type: 'textarea',
        label: 'Do you have any dietary restrictions or allergies?' },
      { id: `f_${now}_access`, type: 'textarea',
        label: 'Do you have any accessibility needs?' },
      { id: `f_${now}_present`, type: 'radio',
        label: 'Will you be presenting at the Congress?',
        options: [
          'Yes, oral presentation',
          'Yes, poster presentation',
          'No, I will not be presenting',
          'I am unsure if I will be presenting',
        ]},
      { id: `f_${now}_emerg_name`, type: 'text', label: 'Emergency contact name' },
      { id: `f_${now}_emerg_phone`, type: 'phone', label: 'Emergency contact phone number' },
      { id: `f_${now}_emerg_rel`, type: 'text', label: 'Relationship of emergency contact to yourself' },
      { id: `f_${now}_consent_list`, type: 'radio',
        label: 'Do you want to be on the list of attendees that may appear on our website or social media?',
        options: ['Yes', 'No'] },
      { id: `f_${now}_consent_photo`, type: 'boolean', required: true,
        label: 'I understand that photos or videos may be taken at the event for GANSID promotional purposes.' },
      { id: `f_${now}_consent_promo`, type: 'radio',
        label: 'Do you consent to receiving promotional materials regarding the GANSID and the Congress by email?',
        options: ['Yes', 'No'] },
      { id: `f_${now}_consent_conduct`, type: 'boolean', required: true,
        label: 'I have read and agree to the Code of Conduct' },
      { id: `f_${now}_consent_terms`, type: 'boolean', required: true,
        label: 'I have read and agree to the Terms & Conditions' },
      { id: `f_${now}_consent_liability`, type: 'boolean', required: true,
        label: 'I have read and agree to the Disclaimer & Liability waiver' },
      { id: `f_${now}_ticket`, type: 'ticket', label: 'Registration',
        // Placeholder — the LivePriceCategory component replaces this UI when
        // settings.pricingTemplateId is set. Required here because the dynamic
        // pricing UI renders INSIDE the ticket field branch.
        ticketConfig: { currency: 'USD', tickets: [] } },
    ] as any,
  } as any;
}
```

Adapt field property names (`placeholder` vs `description` etc.) to match `FormField` in `types.ts`. The `as any` casts are pragmatic — the loose union on the RMS-specific props requires them.

- [ ] **Step 6: Create `config/formTemplates.ts` registry**

```typescript
import type { Form } from '../types';
import type { SiteKey } from './sites';
import { buildBlank } from './formTemplates/buildBlank';
import { buildSponsorForm } from './formTemplates/buildSponsorForm';
import { buildGansidIndividualGroup } from './formTemplates/buildGansidIndividualGroup';

export interface FormTemplate {
  key: string;
  displayName: string;
  description: string;
  siteFilter?: SiteKey[];
  build: () => Omit<Form, 'id' | 'status' | 'createdAt'>;
}

export const TEMPLATES: FormTemplate[] = [
  {
    key: 'blank',
    displayName: 'Blank form',
    description: 'Start with an empty form and add fields manually.',
    build: buildBlank,
  },
  {
    key: 'sponsor',
    displayName: 'Sponsor form',
    description: 'Outreach, tiers, scholarship/ad/booth add-ons, PayPal or cheque.',
    build: buildSponsorForm,
  },
  {
    key: 'gansid-individual-group',
    displayName: 'GANSID Individual + Group Registration',
    description: 'Congress registration with Individual/Group path selector and dynamic per-person pricing.',
    siteFilter: ['gansid'],
    build: buildGansidIndividualGroup,
  },
];

export function availableTemplatesForSite(siteKey: SiteKey): FormTemplate[] {
  return TEMPLATES.filter(t => !t.siteFilter || t.siteFilter.includes(siteKey));
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -- formTemplates.test.ts`
Expected: 5/5 passing.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: DO NOT commit** — Task 3 finalizes this checkpoint.

---

## Task 3: Template picker modal + FormsManager integration

**Files:**
- Create: `components/FormBuilder/TemplatePickerModal.tsx`
- Modify: `components/FormsManager.tsx`

- [ ] **Step 1: Create the picker modal**

```tsx
// components/FormBuilder/TemplatePickerModal.tsx
import React from 'react';
import { X } from 'lucide-react';
import { availableTemplatesForSite, type FormTemplate } from '../../config/formTemplates';
import { CURRENT_SITE } from '../../config/sites';

interface Props {
  onPick: (t: FormTemplate) => void;
  onClose: () => void;
}

export default function TemplatePickerModal({ onPick, onClose }: Props) {
  const templates = availableTemplatesForSite(CURRENT_SITE.key);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-xl font-semibold">Choose a template to start from</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {templates.map(t => (
            <button
              key={t.key}
              onClick={() => onPick(t)}
              className="text-left border rounded-xl p-4 hover:border-indigo-500 hover:bg-indigo-50/50 transition"
            >
              <div className="font-semibold">{t.displayName}</div>
              <div className="text-sm text-slate-500 mt-1">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into FormsManager**

Read `components/FormsManager.tsx`. Find the "Create Sponsor Form" button and the "Create New Form" or "Create Blank Form" button. Replace them with a single **Create Form** button that opens `TemplatePickerModal`. On pick, call whatever function currently creates a form (likely `createForm` from `storageService`) with the template's `build()` output, then navigate to the new form's builder view.

Minimal replacement:

```tsx
import { useState } from 'react';
import TemplatePickerModal from './FormBuilder/TemplatePickerModal';
import { createForm } from '../services/storageService';  // adapt to actual name
import { useNavigate } from 'react-router-dom';
import type { FormTemplate } from '../config/formTemplates';

// Inside the component:
const [pickerOpen, setPickerOpen] = useState(false);
const navigate = useNavigate();

const handlePick = async (t: FormTemplate) => {
  const partial = t.build();
  const created = await createForm({ ...partial, status: 'draft' } as any);
  setPickerOpen(false);
  navigate(`/admin/forms/${created.id}`);  // adapt route to what FormsManager uses
};
```

Replace the existing button(s) with:

```tsx
<button onClick={() => setPickerOpen(true)} className="...existing button classes...">
  Create Form
</button>

{pickerOpen && <TemplatePickerModal onPick={handlePick} onClose={() => setPickerOpen(false)} />}
```

Keep the existing button styles for visual consistency.

- [ ] **Step 3: Type-check + test + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: clean / all tests pass / build succeeds.

- [ ] **Step 4: Commit checkpoint**

```bash
git add config/formTemplates.ts config/formTemplates/ \
        components/FormBuilder/TemplatePickerModal.tsx \
        components/FormsManager.tsx \
        tests/formTemplates.test.ts \
        types.ts
git commit -m "$(cat <<'EOF'
feat(templates): form template registry + picker modal

- Registry in config/formTemplates.ts with TEMPLATES array + availableTemplatesForSite()
- Templates: Blank, Sponsor (re-exported from existing builder), GANSID
  Individual + Group Registration (siteFilter: ['gansid'])
- GANSID template includes the full field list from the Congress PDF:
  basic info, country (usedForPricing), attendance days, dietary/accessibility,
  presenting, emergency contact, four consent checkboxes, and a placeholder
  ticket field for the dynamic pricing UI to render inside
- TemplatePickerModal replaces "Create Sponsor Form" in FormsManager;
  site-filtered cards, clicks build() + createForm() + navigate
- New type 'registration-mode-selector' in FormField.type union (rendering
  comes in next task); Form.settings.groupPath and .sendGuestConfirmationEmails

Per docs/superpowers/specs/2026-04-16-form-templates-and-group-registration-design.md.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Form builder integration for registration-mode-selector

**Files:**
- Modify: `components/FormBuilder/FieldToolbox.tsx`
- Modify: `components/FormBuilder/FieldCard.tsx`
- Modify: `components/FormBuilder/FieldPropertiesPanel.tsx`

- [ ] **Step 1: Add RMS to the field palette in FieldToolbox.tsx**

Import the icon: `import { Users } from 'lucide-react';` (or `UserCheck`, whichever fits). Then add an entry to the field-types array (alongside `country`, before `ticket`):

```tsx
{ type: 'registration-mode-selector', label: 'Individual/Group', icon: Users, color: '#06B6D4' },
```

Single-instance constraint: wire the palette button so that if a form already has a field of this type, clicking it is disabled with a helpful tooltip ("Only one Individual/Group selector per form"). Use whatever pattern FieldToolbox already has for constraint (country has a similar single-flag constraint for `usedForPricing`).

- [ ] **Step 2: Render RMS preview in FieldCard.tsx**

Add a branch in the render switch for `field.type === 'registration-mode-selector'` that shows a preview of the two radio options + a subtle hint that Group mode will render at runtime:

```tsx
if (field.type === 'registration-mode-selector') {
  return (
    <div className="py-2">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" disabled /> {field.individualLabel || 'Individual — just me'}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" disabled /> {field.groupLabel || `Group — up to ${field.groupMaxSize ?? 5} people`}
        </label>
      </div>
      <div className="text-xs text-slate-400 mt-1 italic">
        Group UX (size picker + per-person blocks) renders on the public form.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: RMS config in FieldPropertiesPanel.tsx**

In the field-specific config section of FieldPropertiesPanel, add a branch for `field.type === 'registration-mode-selector'` that renders:

- Toggle: "Group mode enabled" → bound to `field.groupEnabled` (default true)
- Number input: "Max group size" → bound to `field.groupMaxSize` (default 5, min 2, max 10)
- Text input: "Individual label" → bound to `field.individualLabel`
- Text input: "Group label" → bound to `field.groupLabel`

Use the same visual pattern as other field-type-specific config sections (e.g. the `country` field's `usedForPricing` toggle).

- [ ] **Step 4: Type-check + test + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Smoke check in dev**

Run: `npm run dev`. Open the form builder on any test form. Try to add an Individual/Group field. Configure it. Add a second one — should be blocked. Save. Verify persistence.

Stop dev.

- [ ] **Step 6: DO NOT commit** — Task 5 finalizes this section.

---

## Task 5: Render RMS placeholder in FormPreview.tsx

**Files:**
- Modify: `components/FormPreview.tsx`

- [ ] **Step 1: Add RMS render branch in FormPreview**

FormPreview mirrors PublicRegistration for admin testing. For RMS, render a simple disabled-radio preview similar to FieldCard (since FormPreview is admin-side and doesn't need the full group UX — admins will test via the real public URL):

```tsx
if (field.type === 'registration-mode-selector') {
  return (
    <div key={field.id} className="py-2">
      <label className="block text-sm font-medium mb-2">{field.label}</label>
      <div className="flex gap-4">
        <label><input type="radio" name={field.id} disabled /> {field.individualLabel || 'Individual'}</label>
        <label><input type="radio" name={field.id} disabled /> {field.groupLabel || 'Group'}</label>
      </div>
      <p className="text-xs text-slate-500 italic mt-1">Preview only — group UX renders on the public form.</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit checkpoint**

```bash
git add components/FormBuilder/FieldToolbox.tsx \
        components/FormBuilder/FieldCard.tsx \
        components/FormBuilder/FieldPropertiesPanel.tsx \
        components/FormPreview.tsx
git commit -m "$(cat <<'EOF'
feat(forms): registration-mode-selector field type in builder

- New field type entry in FieldToolbox with Users icon and single-instance-
  per-form constraint (mirrors the usedForPricing country constraint)
- FieldCard renders RMS preview (disabled radios + hint about runtime UX)
- FieldPropertiesPanel adds RMS-specific config: group enabled toggle, max
  size, individual/group labels
- FormPreview renders RMS placeholder (admin preview only — group UX is
  public-form-only)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Group pricing helper + TDD

**Files:**
- Create: `utils/groupPricing.ts`
- Create: `tests/groupPricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/groupPricing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeGroupTotal, type GroupMemberPricingInput } from '../utils/groupPricing';
import type { PricingTemplate } from '../types';

const T: PricingTemplate = {
  id: 't1', name: 'GANSID 2026', timezone: 'UTC', currency: 'USD',
  isActive: true, activeBracketOverride: null,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: '', countries: ['IN'] },
    { id: 'tier2', name: 'Tier 2', label: '', countries: ['US'] },
  ],
  dateBrackets: [
    { id: 'eb', name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-12-31' },
  ],
  categories: [
    { id: 'phys', name: 'Physicians',
      prices: { tier1: { eb: 17500 }, tier2: { eb: 25000 } } },
    { id: 'stud', name: 'Students',
      prices: { tier1: { eb: 5000 }, tier2: { eb: 7500 } } },
  ],
  addons: [{ id: 'net', name: 'Networking', description: '', price: 5000 }],
  createdAt: '', updatedAt: '',
};

describe('computeGroupTotal', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('sums per-person prices correctly for a mixed group', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'IN', categoryId: 'phys', addonIds: [] },         // 17500
      { countryCode: 'IN', categoryId: 'stud', addonIds: [] },         // 5000
      { countryCode: 'US', categoryId: 'phys', addonIds: ['net'] },    // 25000 + 5000
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(52500);
    expect(result.perPerson.length).toBe(3);
    expect(result.perPerson[0].cents).toBe(17500);
    expect(result.perPerson[1].cents).toBe(5000);
    expect(result.perPerson[2].cents).toBe(30000);
  });

  it('returns not-ok if any member has unresolvable pricing', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'IN', categoryId: 'phys', addonIds: [] },
      { countryCode: 'IN', categoryId: 'nonexistent', addonIds: [] },
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/category/i);
  });

  it('falls back unclassified country to the last tier', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'XX', categoryId: 'phys', addonIds: [] },  // falls back to tier2 = 25000
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(25000);
    expect(result.perPerson[0].tierId).toBe('tier2');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test -- groupPricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `utils/groupPricing.ts`**

```typescript
import { resolveBracket, resolveTier, computeTotal } from './pricing';
import type { PricingTemplate } from '../types';

export interface GroupMemberPricingInput {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
}

export interface GroupMemberPricingResolved {
  cents: number;
  tierId: string;
  bracketId: string;
  categoryId: string;
}

export type GroupPricingResult =
  | { ok: true; total: number; perPerson: GroupMemberPricingResolved[]; bracketId: string }
  | { ok: false; error: string };

export function computeGroupTotal(
  template: PricingTemplate,
  members: GroupMemberPricingInput[],
  now: Date,
): GroupPricingResult {
  const bracket = resolveBracket(template, now);
  if (!bracket) return { ok: false, error: 'No active pricing bracket' };

  const perPerson: GroupMemberPricingResolved[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const tier = resolveTier(template, m.countryCode);
    if (!tier) return { ok: false, error: `Member ${i + 1}: no tier resolvable` };
    const cents = computeTotal(template, m.categoryId, tier, bracket, m.addonIds);
    if (cents == null) return { ok: false, error: `Member ${i + 1}: category '${m.categoryId}' price not configured` };
    perPerson.push({ cents, tierId: tier.id, bracketId: bracket.id, categoryId: m.categoryId });
  }

  return {
    ok: true,
    total: perPerson.reduce((sum, p) => sum + p.cents, 0),
    perPerson,
    bracketId: bracket.id,
  };
}
```

- [ ] **Step 4: Run tests — expect all passing**

Run: `npm test -- groupPricing.test.ts`
Expected: 3/3 passing.

- [ ] **Step 5: Full test suite + tsc**

```bash
npm test
npx tsc --noEmit
```

Expected: all tests pass, clean tsc.

- [ ] **Step 6: DO NOT commit** — this helper ships in the public-flow checkpoint (Task 8).

---

## Task 7: PublicRegistration state management for group mode

**Files:**
- Modify: `components/PublicRegistration.tsx`

**Context:** PublicRegistration.tsx is large (~1500 lines). This task adds state hooks and derived values; Task 8 adds the UI; Task 9 wires up the submission payload.

- [ ] **Step 1: Read the file and locate the state-hooks section**

Find the existing state hooks near the top of the component body (alongside `selectedCategoryId`, `selectedAddonIds`, `selectedCountryCode` from sub-project 1). You'll insert new state there.

- [ ] **Step 2: Add group-mode state**

Import the types and helper:

```typescript
import { computeGroupTotal, type GroupMemberPricingInput } from '../utils/groupPricing';
```

Add these state hooks alongside the existing pricing state:

```typescript
// Detect RMS field on the form (at most one, enforced by builder)
const rmsField = form?.fields?.find((f: any) => f.type === 'registration-mode-selector') ?? null;

// 'individual' | 'group' | null (null until visitor picks)
const [registrationMode, setRegistrationMode] = useState<'individual' | 'group' | null>(null);
const [groupSize, setGroupSize] = useState<number>(2);
const [groupHasAllInfo, setGroupHasAllInfo] = useState<boolean>(false);
const [groupAllSameCountry, setGroupAllSameCountry] = useState<boolean>(false);
const [groupAllSameCategory, setGroupAllSameCategory] = useState<boolean>(false);

// Per-person state. Index 0 is the primary (contact).
// In "have all info" mode, fullAnswers[i] holds each person's full field responses (same shape as `answers`).
// In "send-links" mode, only name/email/country/category are captured per person (plus contact has their own `answers`).
const [groupMembers, setGroupMembers] = useState<Array<{
  name: string;
  email: string;
  countryCode: string;
  categoryId: string | null;
  addonIds: string[];
  // Only populated in inline ("have all info") mode — full registration answers per person
  fullAnswers?: Record<string, any>;
}>>([
  { name: '', email: '', countryCode: '', categoryId: null, addonIds: [] },
  { name: '', email: '', countryCode: '', categoryId: null, addonIds: [] },
]);
```

- [ ] **Step 3: Sync groupMembers size when groupSize changes**

Add a `useEffect` below the state:

```typescript
useEffect(() => {
  setGroupMembers(prev => {
    if (prev.length === groupSize) return prev;
    if (prev.length < groupSize) {
      return [...prev, ...Array(groupSize - prev.length).fill(null).map(() => ({
        name: '', email: '', countryCode: '', categoryId: null, addonIds: [],
      }))];
    }
    return prev.slice(0, groupSize);
  });
}, [groupSize]);
```

- [ ] **Step 4: Derive group total**

Below existing `dynamicTotal` computation:

```typescript
const groupPricingResult = (pricingTemplate && registrationMode === 'group')
  ? computeGroupTotal(
      pricingTemplate,
      groupMembers.map(m => ({
        countryCode: m.countryCode,
        categoryId: m.categoryId ?? '',
        addonIds: m.addonIds,
      })),
      new Date(),
    )
  : null;

const groupTotal = groupPricingResult?.ok ? groupPricingResult.total : null;
```

- [ ] **Step 5: Shortcut effect — apply "same country" / "same category" across members**

```typescript
useEffect(() => {
  if (!groupAllSameCountry) return;
  // When checked, copy members[0]'s country to all
  setGroupMembers(prev => {
    const first = prev[0];
    if (!first) return prev;
    return prev.map(m => ({ ...m, countryCode: first.countryCode }));
  });
}, [groupAllSameCountry, groupMembers[0]?.countryCode]);

useEffect(() => {
  if (!groupAllSameCategory) return;
  setGroupMembers(prev => {
    const first = prev[0];
    if (!first) return prev;
    return prev.map(m => ({ ...m, categoryId: first.categoryId }));
  });
}, [groupAllSameCategory, groupMembers[0]?.categoryId]);
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: DO NOT commit** — Task 8 adds the UI that consumes this state.

---

## Task 8: PublicRegistration group UX (UI + payload + submission)

**Files:**
- Create: `components/Group/GroupPersonRow.tsx`
- Create: `components/Group/GroupShortcutsToggle.tsx`
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Create GroupShortcutsToggle.tsx**

```tsx
import React from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  allSameCountry: boolean;
  allSameCategory: boolean;
  onToggleCountry: (v: boolean) => void;
  onToggleCategory: (v: boolean) => void;
  sharedCountry: string;
  sharedCategoryId: string | null;
  onSharedCountry: (code: string) => void;
  onSharedCategory: (id: string) => void;
}

export default function GroupShortcutsToggle(p: Props) {
  return (
    <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.allSameCountry} onChange={e => p.onToggleCountry(e.target.checked)} />
        All members are from the same country
      </label>
      {p.allSameCountry && (
        <CountryField label="Country (all members)" value={p.sharedCountry} onChange={p.onSharedCountry} />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.allSameCategory} onChange={e => p.onToggleCategory(e.target.checked)} />
        All members are the same category
      </label>
      {p.allSameCategory && p.tier && p.bracket && (
        <select
          value={p.sharedCategoryId ?? ''}
          onChange={e => p.onSharedCategory(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select category…</option>
          {p.template.categories.map(cat => {
            const price = cat.prices?.[p.tier!.id]?.[p.bracket!.id];
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}{typeof price === 'number' ? ` — ${formatPrice(price, p.template.currency)}` : ''}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create GroupPersonRow.tsx**

```tsx
import React from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  index: number;
  isPrimary: boolean;
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  name: string;
  email: string;
  countryCode: string;
  categoryId: string | null;
  hasAllInfo: boolean;        // inline vs send-links
  hideCountry: boolean;       // true when "all same country" is on
  hideCategory: boolean;      // true when "all same category" is on
  onChange: (patch: Partial<{ name: string; email: string; countryCode: string; categoryId: string | null }>) => void;
}

export default function GroupPersonRow(p: Props) {
  const displayPrice = (() => {
    if (!p.tier || !p.bracket || !p.categoryId) return null;
    const cat = p.template.categories.find(c => c.id === p.categoryId);
    const cents = cat?.prices?.[p.tier.id]?.[p.bracket.id];
    return typeof cents === 'number' ? formatPrice(cents, p.template.currency) : null;
  })();

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <div className="font-medium text-sm">
          {p.isPrimary ? `You (Contact)` : `Registrant ${p.index + 1}`}
        </div>
        {displayPrice && <div className="text-sm font-semibold text-indigo-700">{displayPrice}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="Full Name" value={p.name}
          onChange={e => p.onChange({ name: e.target.value })} />
        <input type="email" className="border rounded px-2 py-1 text-sm" placeholder="Email" value={p.email}
          onChange={e => p.onChange({ email: e.target.value })} />
      </div>
      {!p.hideCountry && (
        <CountryField label="Country" value={p.countryCode}
          onChange={code => p.onChange({ countryCode: code })} />
      )}
      {!p.hideCategory && p.tier && p.bracket && (
        <select
          value={p.categoryId ?? ''}
          onChange={e => p.onChange({ categoryId: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          <option value="">Select category…</option>
          {p.template.categories.map(cat => {
            const cents = cat.prices?.[p.tier!.id]?.[p.bracket!.id];
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}{typeof cents === 'number' ? ` — ${formatPrice(cents, p.template.currency)}` : ''}
              </option>
            );
          })}
        </select>
      )}
      {p.hasAllInfo && !p.isPrimary && (
        <p className="text-xs text-slate-400 italic">
          Additional fields (dietary, consent, etc.) for this person will appear on their ticket only
          after they receive and confirm their registration link.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire group UX into PublicRegistration.tsx**

Immediately after the RMS field renders, add the group UX block (only visible when `registrationMode === 'group'`). Find where the form fields are rendered in order — the RMS is the first field. After it (still inside the `form.fields.map` loop or right after), render:

```tsx
{registrationMode === 'group' && pricingTemplate && (
  <div className="space-y-4 border-l-4 border-indigo-200 pl-4">
    <div>
      <label className="block text-sm font-medium mb-1">How many people total?</label>
      <div className="flex gap-2">
        {[2, 3, 4, 5].filter(n => n <= (rmsField?.groupMaxSize ?? 5)).map(n => (
          <button type="button" key={n}
            onClick={() => setGroupSize(n)}
            className={`px-3 py-1 rounded border text-sm ${groupSize === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300'}`}>
            {n}
          </button>
        ))}
      </div>
    </div>

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={groupHasAllInfo}
        onChange={e => setGroupHasAllInfo(e.target.checked)} />
      I have all their details now and want to fill them in
    </label>
    <p className="text-xs text-slate-500 -mt-1">
      If unchecked, we'll capture basic pricing info now and email each person a link to complete their details later.
    </p>

    <GroupShortcutsToggle
      template={pricingTemplate}
      tier={activeTier}
      bracket={activeBracket}
      allSameCountry={groupAllSameCountry}
      allSameCategory={groupAllSameCategory}
      onToggleCountry={setGroupAllSameCountry}
      onToggleCategory={setGroupAllSameCategory}
      sharedCountry={groupMembers[0]?.countryCode ?? ''}
      sharedCategoryId={groupMembers[0]?.categoryId ?? null}
      onSharedCountry={code => setGroupMembers(prev => prev.map(m => ({ ...m, countryCode: code })))}
      onSharedCategory={id => setGroupMembers(prev => prev.map(m => ({ ...m, categoryId: id })))}
    />

    <div className="space-y-2">
      {groupMembers.map((m, i) => (
        <GroupPersonRow
          key={i}
          index={i}
          isPrimary={i === 0}
          template={pricingTemplate}
          tier={activeTier}
          bracket={activeBracket}
          name={m.name}
          email={m.email}
          countryCode={m.countryCode}
          categoryId={m.categoryId}
          hasAllInfo={groupHasAllInfo}
          hideCountry={groupAllSameCountry}
          hideCategory={groupAllSameCategory}
          onChange={patch => setGroupMembers(prev => prev.map((row, j) => j === i ? { ...row, ...patch } : row))}
        />
      ))}
    </div>

    {groupTotal != null && (
      <div className="sticky bottom-4 p-4 bg-white shadow-lg rounded-xl border flex items-center justify-between">
        <div className="text-xs text-slate-500 uppercase tracking-wider">Group total ({groupMembers.length} people)</div>
        <div className="text-2xl font-bold">{formatPrice(groupTotal, pricingTemplate.currency)}</div>
      </div>
    )}
  </div>
)}
```

Imports to add at the top:

```tsx
import GroupPersonRow from './Group/GroupPersonRow';
import GroupShortcutsToggle from './Group/GroupShortcutsToggle';
```

- [ ] **Step 4: Add the RMS field renderer in the main field loop**

Add a branch for `field.type === 'registration-mode-selector'` in the existing field-type switch:

```tsx
if (field.type === 'registration-mode-selector') {
  return (
    <div key={field.id} className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.label} {field.required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name={field.id} checked={registrationMode === 'individual'}
            onChange={() => setRegistrationMode('individual')} />
          {field.individualLabel || 'Individual — just me'}
        </label>
        {(field.groupEnabled ?? true) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={field.id} checked={registrationMode === 'group'}
              onChange={() => setRegistrationMode('group')} />
            {field.groupLabel || `Group — up to ${field.groupMaxSize ?? 5} people`}
          </label>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Hide non-RMS fields until mode is picked**

Wrap the rest of the field renderers so they only render when `registrationMode !== null`:

```tsx
{registrationMode && form.fields.map(field => isVisible(field) && field.type !== 'registration-mode-selector' && ( /* existing render */ ))}
```

Keep the existing `field.type === 'registration-mode-selector'` branch rendering always.

- [ ] **Step 6: PayPal createOrder handles group total**

In the existing PayPal `createOrder` branch that already handles `pricingTemplate && dynamicTotal`, add a sibling branch for group mode:

```tsx
if (pricingTemplate && registrationMode === 'group' && groupTotal != null) {
  return actions.order.create({
    purchase_units: [{ amount: { currency_code: pricingTemplate.currency, value: (groupTotal / 100).toFixed(2) } }],
    intent: 'CAPTURE',
  });
}
// existing individual dynamic branch and static branch follow unchanged
```

- [ ] **Step 7: Extend verify-payment submission body with `groupPricingSelections`**

Find the existing `verifyBody` construction. Add after the existing `pricingSelection` assignment:

```typescript
if (pricingTemplate && registrationMode === 'group' && groupMembers.length > 0) {
  verifyBody.groupPricingSelections = groupMembers.map(m => ({
    countryCode: m.countryCode,
    categoryId: m.categoryId ?? '',
    addonIds: m.addonIds,
  }));
  // Also populate attendees array for the group
  verifyBody.attendees = groupMembers.map((m, i) => ({
    name: m.name,
    email: m.email,
    ticket_type: 'Registration',
    is_primary: i === 0,
    guest_type: i === 0 ? null : (groupHasAllInfo ? null : 'pending-claim'),
    // Inline mode with full details → carry fullAnswers as the attendee's answers map
    answers: groupHasAllInfo && m.fullAnswers ? m.fullAnswers : null,
  }));
}
```

- [ ] **Step 8: Guard submit button for group mode**

Extend the existing `disabled` condition on the submit/PayPal button:

```typescript
const groupSubmitBlocked = registrationMode === 'group' && (
  !groupPricingResult?.ok ||
  groupMembers.some(m => !m.name.trim() || !m.email.trim() || !m.countryCode || !m.categoryId)
);
// combine with existing disabled conditions
```

- [ ] **Step 9: Type-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass.

- [ ] **Step 10: Commit checkpoint**

```bash
git add utils/groupPricing.ts tests/groupPricing.test.ts \
        components/Group/ \
        components/PublicRegistration.tsx
git commit -m "$(cat <<'EOF'
feat(registration): group path UI + per-person dynamic pricing

- utils/groupPricing.ts: computeGroupTotal() sums per-person prices with
  TDD coverage (3 tests)
- Group UX on public form renders when RMS field is set to 'group':
  size picker (2–N), "I have all info" toggle, "same country" and "same
  category" shortcuts, per-person rows with live per-person prices
- PayPal createOrder and verify-payment submission body extended with
  groupPricingSelections[] and a group-shaped attendees[] array
- Submit button disabled until all per-person pricing fields are filled
- Non-RMS fields hidden until visitor picks Individual or Group

Server-side group branch in verify-payment comes in the next task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: verify-payment group branch

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Read the file to locate the dynamic pricing branch**

Find the existing dynamic pricing branch (added in sub-project 1). It sits inside the event branch and is gated on `pricingTemplateId && pricingSelection`. We'll add a sibling branch above it that handles group purchases.

- [ ] **Step 2: Add group branch**

Before the single-person dynamic branch, add:

```typescript
// Group dynamic pricing branch — array of per-person selections
const groupPricingSelections = body.groupPricingSelections ?? null;

if (pricingTemplateId && Array.isArray(groupPricingSelections) && groupPricingSelections.length >= 2) {
  // 1. Load template
  const { data: tpl, error: tplErr } = await supabase
    .from('pricing_templates').select('*').eq('id', pricingTemplateId).maybeSingle();
  if (tplErr || !tpl) return jsonResponse({ error: 'Pricing template not found' }, 400);

  // 2. Resolve active bracket (same logic as single-person branch)
  const nowMs = Date.now();
  let activeBracket: any = null;
  if (tpl.active_bracket_override) {
    activeBracket = (tpl.date_brackets ?? []).find((b: any) => b.id === tpl.active_bracket_override) ?? null;
  }
  if (!activeBracket) {
    for (const b of (tpl.date_brackets ?? [])) {
      const start = Date.parse(`${b.startDate}T00:00:00Z`);
      const end = Date.parse(`${b.endDate}T23:59:59.999Z`);
      if (nowMs >= start && nowMs <= end) { activeBracket = b; break; }
    }
  }
  if (!activeBracket) return jsonResponse({ error: 'No active pricing bracket' }, 400);

  const tiers = (tpl.tiers ?? []) as any[];
  if (tiers.length === 0) return jsonResponse({ error: 'No tiers configured' }, 400);

  // 3. Per-person resolution
  const memberResolutions: Array<{ cents: number; tierId: string; bracketId: string; categoryId: string }> = [];
  for (let i = 0; i < groupPricingSelections.length; i++) {
    const sel = groupPricingSelections[i];
    const code = (sel.countryCode ?? '').toUpperCase();
    const tier = tiers.find((t: any) => (t.countries ?? []).includes(code)) ?? tiers[tiers.length - 1];
    const cat = (tpl.categories ?? []).find((c: any) => c.id === sel.categoryId);
    if (!cat) return jsonResponse({ error: `Member ${i + 1}: unknown category '${sel.categoryId}'` }, 400);
    const fee = cat.prices?.[tier.id]?.[activeBracket.id];
    if (typeof fee !== 'number') return jsonResponse({ error: `Member ${i + 1}: price not configured` }, 400);
    const addonIds: string[] = Array.isArray(sel.addonIds) ? sel.addonIds : [];
    const addonTotal = addonIds.reduce((sum: number, id: string) => {
      const a = (tpl.addons ?? []).find((x: any) => x.id === id);
      return sum + (typeof a?.price === 'number' ? a.price : 0);
    }, 0);
    memberResolutions.push({ cents: fee + addonTotal, tierId: tier.id, bracketId: activeBracket.id, categoryId: cat.id });
  }

  const expectedCents = memberResolutions.reduce((sum, m) => sum + m.cents, 0);

  // 4. Capture PayPal order (reuse inlined PayPal logic from single-person branch)
  if (!paypalOrderId) return jsonResponse({ error: 'paypalOrderId required for group payment' }, 400);
  const ppMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
  const allTest = attendees.every((a: any) => a.is_test === true);
  let ppSandbox: boolean;
  if (ppMode === 'production') ppSandbox = false;
  else if (ppMode === 'sandbox') ppSandbox = true;
  else if (allTest) ppSandbox = true;
  else {
    const origin = (req.headers.get('origin') || '').toLowerCase();
    ppSandbox = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
  }
  const PP_CLIENT_ID = (ppSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID')) : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
  const PP_CLIENT_SECRET = (ppSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET')) : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
  const PP_API_BASE = Deno.env.get('PAYPAL_API_BASE') || (ppSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
  if (!PP_CLIENT_ID || !PP_CLIENT_SECRET) return jsonResponse({ error: 'PayPal credentials not configured' }, 500);

  const ppAuthResp = await fetch(`${PP_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`${PP_CLIENT_ID}:${PP_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!ppAuthResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
  const { access_token: ppToken } = await ppAuthResp.json();

  const ppCapResp = await fetch(`${PP_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ppToken}`, 'Content-Type': 'application/json' },
  });
  const ppCapData = await ppCapResp.json();
  if (!ppCapResp.ok || ppCapData.status !== 'COMPLETED') return jsonResponse({ error: 'PayPal capture failed', details: ppCapData }, 502);
  const ppCapture = ppCapData.purchase_units?.[0]?.payments?.captures?.[0];
  if (!ppCapture) return jsonResponse({ error: 'No capture data in PayPal response' }, 502);
  const capturedCents = Math.round(Number(ppCapture.amount?.value ?? 0) * 100);

  if (Math.abs(capturedCents - expectedCents) > 1) {
    return jsonResponse({ error: 'Group price mismatch', expected: expectedCents, received: capturedCents }, 400);
  }

  // 5. Duplicate tx guard
  const { data: existingTx } = await supabase.from('attendees').select('id').eq('transaction_id', ppCapture.id).limit(1);
  if (existingTx && existingTx.length > 0) return jsonResponse({ error: 'This payment has already been processed' }, 409);

  // 6. Persist N attendees. Primary first, then guests linked to primary.
  const primaryDraft = attendees[0] ?? {};
  const primaryId = primaryDraft.id ?? crypto.randomUUID();
  const rows = memberResolutions.map((m, i) => {
    const attendeeDraft = attendees[i] ?? {};
    return {
      ...attendeeDraft,
      id: i === 0 ? primaryId : (attendeeDraft.id ?? crypto.randomUUID()),
      form_id: formId,
      is_primary: i === 0,
      primary_attendee_id: i === 0 ? null : primaryId,
      payment_status: 'paid',
      transaction_id: ppCapture.id,
      payment_amount: `${(m.cents / 100).toFixed(2)} ${tpl.currency ?? 'USD'}`,
      pricing_template_id: tpl.id,
      pricing_tier: m.tierId,
      pricing_bracket: m.bracketId,
      pricing_category_id: m.categoryId,
    };
  });

  const { error: insertErr } = await supabase.from('attendees').upsert(rows);
  if (insertErr) {
    console.error('CRITICAL: group PayPal captured but DB insert failed', JSON.stringify({
      transactionId: ppCapture.id, expectedCents, capturedCents, rowCount: rows.length, dbError: insertErr.message,
    }));
    return jsonResponse({
      error: `Your payment was processed but we encountered a database error. Please contact the event organizer with this reference: ${ppCapture.id}`,
    }, 500);
  }

  return jsonResponse({ ok: true, total: expectedCents, currency: tpl.currency ?? 'USD', primaryId, guestIds: rows.slice(1).map(r => r.id) });
}
// ── END GROUP DYNAMIC BRANCH — fall through to single-person dynamic branch below ──
```

- [ ] **Step 3: Deploy to both Supabase projects**

```bash
npx supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez --use-api
```

Expected: both print `Deployed Functions on project <ref>: verify-payment`.

- [ ] **Step 4: Commit checkpoint**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "$(cat <<'EOF'
feat(pricing): verify-payment group dynamic branch

Handles group purchases with groupPricingSelections[] + N-entry attendees[].
Per-person resolution (tier/bracket/category/addons), sum, compare to PayPal
capture with 1-cent tolerance, reject on mismatch. Inserts N rows sharing
transaction_id, each with its own pricing metadata; primary/guest linkage
via is_primary + primary_attendee_id. Pending-claim guests carry guest_type
= 'pending-claim' so the claim-link flow (next task) can pick them up.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Pending-claim guest completion flow

**Files:**
- Modify: `components/PublicRegistration.tsx`

**Context:** The existing `?ref=<attendeeId>` claim flow in PublicRegistration already loads an attendee and lets them update their record. We extend it so `guest_type='pending-claim'` guests see a pre-filled, read-only name/email/country/category set and fill in only the remaining personal fields.

- [ ] **Step 1: Detect pending-claim state**

In the existing ref-flow loading path (search for `guestRef` or `primaryAttendeeId` in PublicRegistration.tsx), add:

```typescript
const isPendingClaim = loadedAttendee?.guest_type === 'pending-claim';
```

- [ ] **Step 2: Pre-fill + lock pricing fields**

When `isPendingClaim`, pre-populate the `answers` state with the existing attendee's name, email, and any pricing-affecting field values (country, category). For the country field specifically, mirror this logic:

```typescript
useEffect(() => {
  if (!isPendingClaim || !loadedAttendee) return;
  // Pre-fill answers from the DB row
  const prefill: Record<string, any> = { ...answers };
  const countryField = form?.fields?.find((f: any) => f.type === 'country' && f.usedForPricing);
  if (countryField && loadedAttendee.pricing_tier) {
    // DB doesn't store the country code directly, but we stored it in answers during group submission.
    // If answers[countryField.id] already has a value, keep it. Otherwise leave empty (edge case).
  }
  if (loadedAttendee.name) prefill['__name'] = loadedAttendee.name;  // or whatever field id is standard
  if (loadedAttendee.email) prefill['__email'] = loadedAttendee.email;
  setAnswers(prefill);
}, [isPendingClaim, loadedAttendee?.id]);
```

Adapt field-id extraction to what the existing guest-claim flow already does — that existing flow is the reference pattern for pre-filling.

- [ ] **Step 3: Render pricing-locked banner in pending-claim mode**

Near the top of the rendered form when `isPendingClaim`:

```tsx
{isPendingClaim && (
  <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
    Your registration has been paid for by <strong>{loadedAttendee?.contact_name || 'your group contact'}</strong>.
    Please complete your personal details below.
  </div>
)}
```

(If `contact_name` isn't stored, fall back to "your group contact" without naming them — the primary's name is stored on the primary row, not on the guest row.)

- [ ] **Step 4: Lock pricing fields in render**

Adjust the render so that when `isPendingClaim`:
- The RMS field doesn't render (registrationMode is irrelevant — they're just completing their record)
- The country field renders as disabled (or hidden) with read-only display of the country name
- Any category-linked ticket/pricing UI doesn't render (pricing is already locked)
- The `ticket` field branch is skipped

Use `isPendingClaim` as a guard condition on these branches.

- [ ] **Step 5: Complete submission path**

In pending-claim mode, the "Submit" button doesn't invoke PayPal — it just updates the existing row. Adjust the submit handler:

```typescript
if (isPendingClaim && loadedAttendee) {
  const { error } = await supabase.from('attendees').update({
    answers,                                   // the rest of personal fields
    guest_type: 'claimed',                     // flip the status
    name: answers['__name'] || loadedAttendee.name,  // or whichever canonical path
  }).eq('id', loadedAttendee.id);
  if (error) { setError('Failed to save'); return; }

  // Trigger personal confirmation email
  await supabase.functions.invoke('send-ticket-email', {
    body: { attendeeId: loadedAttendee.id, mode: 'guest-claim-completed' },
  });

  setSuccess(true);
  return;
}
```

Adapt field ids and supabase client variable name to the existing file's conventions.

- [ ] **Step 6: Type-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit checkpoint**

```bash
git add components/PublicRegistration.tsx
git commit -m "$(cat <<'EOF'
feat(registration): pending-claim guest completion flow

Group guests with guest_type='pending-claim' click their ?ref link and see
a pre-filled, locked name/email/country/category set plus the remaining
personal fields (dietary, emergency contact, consent, etc.) to complete.
Submit updates the row in-place (no new payment), flips guest_type to
'claimed', and triggers a personal confirmation email.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Email behavior — group invitations + completion notifications

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts`

- [ ] **Step 1: Read the file to locate email-sending branches**

The function likely has one default path that sends a ticket PDF attached to an attendee's email. We'll add two modes:

1. `mode: 'group-invite'` — sends a "please complete your registration" email to a pending-claim guest (lighter — link + brief note, no full ticket PDF)
2. `mode: 'guest-claim-completed'` — sends the normal ticket email to the now-claimed guest + a "X has completed their registration" notification to the primary

- [ ] **Step 2: Add group-invite branch**

Early in the request handler, add:

```typescript
if (body.mode === 'group-invite') {
  const attendeeId = body.attendeeId;
  const { data: guest } = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
  if (!guest) return jsonResponse({ error: 'Guest not found' }, 404);

  const { data: primary } = await supabase.from('attendees').select('name, email')
    .eq('id', guest.primary_attendee_id).single();

  const registrationLink = `${body.origin || ''}/#/form/${guest.form_id}?ref=${guest.id}`;
  const subject = `Complete your GANSID Congress registration`;
  const html = `
    <p>Hi ${guest.name || 'there'},</p>
    <p><strong>${primary?.name || 'A colleague'}</strong> has registered you for the GANSID Congress.
    Please click below to complete your personal details (dietary, emergency contact, consent).</p>
    <p><a href="${registrationLink}" style="display:inline-block;padding:10px 20px;background:#1E4A8C;color:white;border-radius:6px;text-decoration:none;">Complete my registration</a></p>
    <p>Or copy this link: ${registrationLink}</p>
  `;

  await sendEmail({ to: guest.email, subject, html });  // use existing sendEmail helper in this file
  return jsonResponse({ ok: true });
}
```

Adapt `sendEmail` to the actual helper name in the file (probably inlined SMTP + nodemailer-like logic — match that pattern).

- [ ] **Step 3: Add guest-claim-completed branch**

```typescript
if (body.mode === 'guest-claim-completed') {
  const attendeeId = body.attendeeId;
  const { data: attendee } = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
  if (!attendee) return jsonResponse({ error: 'Attendee not found' }, 404);

  // 1. Send personal ticket to the completed guest (full ticket PDF attached)
  //    Reuse existing ticket-email logic — probably a function called sendTicketEmail(attendee).
  await sendTicketEmail(attendee);

  // 2. Notify the primary
  if (attendee.primary_attendee_id) {
    const { data: primary } = await supabase.from('attendees').select('name, email')
      .eq('id', attendee.primary_attendee_id).single();
    if (primary?.email) {
      const subject = `${attendee.name} has completed their registration`;
      const html = `
        <p>Hi ${primary.name},</p>
        <p><strong>${attendee.name}</strong> has completed their registration for the GANSID Congress.
        Their individual ticket has been emailed to them directly.</p>
      `;
      await sendEmail({ to: primary.email, subject, html });
    }
  }
  return jsonResponse({ ok: true });
}
```

Adapt helper names to the actual file.

- [ ] **Step 4: Deploy to both Supabase projects**

```bash
npx supabase functions deploy send-ticket-email --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
```

Expected: both deploy cleanly.

- [ ] **Step 5: Hook into verify-payment to trigger invitations for pending-claim guests**

Back in `supabase/functions/verify-payment/index.ts`, at the end of the group branch (right after the successful insert), add:

```typescript
// Fire-and-forget invitation emails for pending-claim guests
const pendingGuests = rows.filter((r: any) => r.guest_type === 'pending-claim');
for (const g of pendingGuests) {
  // Use supabase.functions.invoke isn't available server-side; call the function URL directly
  const emailFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`;
  await fetch(emailFnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'group-invite', attendeeId: g.id, origin: req.headers.get('origin') ?? '' }),
  }).catch(e => console.warn('Group invite email failed', e));
}
```

Redeploy verify-payment after this change:

```bash
npx supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez --use-api
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts supabase/functions/verify-payment/index.ts
git commit -m "$(cat <<'EOF'
feat(emails): group invitations + claim-completion notifications

send-ticket-email gains two modes:
- 'group-invite': short email with a completion link for pending-claim guests
- 'guest-claim-completed': full ticket PDF to the now-claimed guest + brief
  notification to the group primary

verify-payment group branch fires group-invite emails for each pending-claim
guest after a successful group capture. Fire-and-forget — failures are
logged but don't block the checkout response.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Admin dashboard — collapsible group rows + status badges

**Files:**
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Read AttendeeList.tsx**

Identify where rows render. Currently rows are flat. You'll:
1. Group rows by primary (fetch behavior doesn't change; grouping is a client-side `reduce`)
2. Render a parent row with an expand/collapse toggle
3. When expanded, render linked guests below with indentation + status badges + actions

- [ ] **Step 2: Add grouping helper**

Near the top of AttendeeList.tsx:

```typescript
interface GroupedAttendee {
  primary: Attendee;
  guests: Attendee[];
}

function groupByPrimary(attendees: Attendee[]): GroupedAttendee[] {
  const primaries = attendees.filter(a => a.is_primary !== false && !a.primary_attendee_id);
  const byPrimaryId = new Map<string, Attendee[]>();
  for (const a of attendees) {
    if (a.primary_attendee_id) {
      const arr = byPrimaryId.get(a.primary_attendee_id) ?? [];
      arr.push(a);
      byPrimaryId.set(a.primary_attendee_id, arr);
    }
  }
  return primaries.map(p => ({ primary: p, guests: byPrimaryId.get(p.id) ?? [] }));
}
```

- [ ] **Step 3: Render grouped rows with expand/collapse**

Replace the existing flat `attendees.map(...)` with `groupByPrimary(attendees).map(g => renderGroup(g))`. A collapse state per primary row:

```typescript
const [expandedPrimaries, setExpandedPrimaries] = useState<Set<string>>(new Set());
const toggleExpand = (id: string) => setExpandedPrimaries(prev => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
});
```

Render:

```tsx
{groupByPrimary(attendees).map(({ primary, guests }) => (
  <React.Fragment key={primary.id}>
    {/* Primary row — reuse existing row render, but add expand chevron if guests.length > 0 */}
    <tr>
      <td>
        {guests.length > 0 && (
          <button onClick={() => toggleExpand(primary.id)} className="p-1 hover:bg-slate-100 rounded">
            {expandedPrimaries.has(primary.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </td>
      {/* ...existing primary columns... */}
    </tr>
    {/* Guest rows (shown when expanded) */}
    {expandedPrimaries.has(primary.id) && guests.map(guest => (
      <tr key={guest.id} className="bg-slate-50">
        <td></td>
        <td className="pl-8">
          <span className="text-sm">{guest.name}</span>
          <GuestStatusBadge guest={guest} />
        </td>
        {/* ...rest of guest columns... */}
        <td><GuestActions guest={guest} formId={primary.form_id} onRefresh={refreshList} /></td>
      </tr>
    ))}
  </React.Fragment>
))}
```

Import `ChevronDown, ChevronRight` from lucide-react.

- [ ] **Step 4: Inline status badge component**

In the same file (or a small co-located helper):

```tsx
function GuestStatusBadge({ guest }: { guest: Attendee }) {
  if (guest.guest_type === 'pending-claim') {
    return <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-900 rounded-full">Pending</span>;
  }
  if (guest.guest_type === 'claimed') {
    return <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 text-green-900 rounded-full">Completed</span>;
  }
  return <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-900 rounded-full">Pre-filled</span>;
}
```

- [ ] **Step 5: Per-guest actions**

```tsx
function GuestActions({ guest, formId, onRefresh }: { guest: Attendee; formId: string; onRefresh: () => void }) {
  const copyLink = () => {
    const url = `${window.location.origin}/#/form/${formId}?ref=${guest.id}`;
    navigator.clipboard.writeText(url);
  };
  const resend = async () => {
    await supabase.functions.invoke('send-ticket-email', {
      body: { mode: 'group-invite', attendeeId: guest.id, origin: window.location.origin },
    });
  };
  const markComplete = async () => {
    if (!window.confirm(`Mark ${guest.name} as completed?`)) return;
    await supabase.from('attendees').update({ guest_type: 'claimed' }).eq('id', guest.id);
    onRefresh();
  };
  const isPending = guest.guest_type === 'pending-claim';
  return (
    <div className="flex gap-1">
      {isPending && (
        <>
          <button onClick={copyLink} title="Copy registration link" className="p-1 hover:bg-slate-200 rounded">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={resend} title="Resend invitation" className="p-1 hover:bg-slate-200 rounded">
            <Mail className="w-3.5 h-3.5" />
          </button>
          <button onClick={markComplete} title="Mark as completed" className="p-1 hover:bg-slate-200 rounded">
            <Check className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
```

Import `Copy, Mail, Check` from lucide-react.

- [ ] **Step 6: Expose pricing columns inline**

If the existing table has a "Pricing" or "Amount" column, extend it to show `pricing_tier` / `pricing_bracket` / `pricing_category_id` for rows that have them. If those are null (for non-dynamic-pricing attendees), show `—`.

- [ ] **Step 7: Type-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add components/AttendeeList.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): collapsible group rows + guest status + per-guest actions

Attendee list groups rows by primary_attendee_id. Primary rows gain an
expand/collapse chevron when they have linked guests. Expanded state reveals
indented guest rows with status badges (Pending / Completed / Pre-filled)
and per-guest actions: copy registration link, resend invitation email,
and manually mark as completed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Seed the GANSID Individual/Group form

**Files:**
- Create: `tmp/seed-gansid-form.sql` (not committed)

- [ ] **Step 1: Get the GANSID pricing template UUID**

```bash
npx supabase db query --linked "SELECT id FROM pricing_templates WHERE name = 'GANSID Congress 2026 Pricing';"
```

Copy the UUID from the output.

- [ ] **Step 2: Write seed SQL**

Create `tmp/seed-gansid-form.sql`. Replace `<PRICING_TEMPLATE_UUID>` with the UUID from step 1.

```sql
-- Seed the GANSID Individual/Group Registration form on the GANSID Supabase project.
-- Status 'draft' — admin flips to 'active' when ready to publish.

INSERT INTO public.forms (id, title, description, status, settings, fields, form_type)
VALUES (
  'gansid-congress-2026',
  'GANSID Congress 2026 Registration',
  'October 23–25, 2026 · Hyderabad, India',
  'draft',
  jsonb_build_object(
    'pricingTemplateId', '<PRICING_TEMPLATE_UUID>',
    'groupPath', jsonb_build_object('enabled', true, 'maxSize', 5),
    'sendGuestConfirmationEmails', false,
    'currency', 'USD'
  ),
  $fields$[
    {"id":"f_mode","type":"registration-mode-selector","label":"How are you registering?","required":true,"groupEnabled":true,"groupMaxSize":5,"individualLabel":"Individual — just me","groupLabel":"Group — up to 5 people"},
    {"id":"f_fname","type":"text","label":"First Name","required":true,"placeholder":"This will appear on your conference badge"},
    {"id":"f_lname","type":"text","label":"Last Name","required":true,"placeholder":"This will appear on your conference badge"},
    {"id":"f_title","type":"select","label":"Title","options":["Mr.","Ms.","Mrs.","Dr.","Prof."]},
    {"id":"f_email","type":"email","label":"Email Address","required":true},
    {"id":"f_whatsapp","type":"phone","label":"WhatsApp Number"},
    {"id":"f_org","type":"text","label":"Institution/Organization","required":true},
    {"id":"f_city","type":"text","label":"City"},
    {"id":"f_country","type":"country","label":"Country","required":true,"usedForPricing":true},
    {"id":"f_days","type":"checkbox","label":"Which days will you be attending?","options":["October 23, 2026","October 24, 2026","October 25, 2026"]},
    {"id":"f_diet","type":"textarea","label":"Do you have any dietary restrictions or allergies?"},
    {"id":"f_access","type":"textarea","label":"Do you have any accessibility needs?"},
    {"id":"f_present","type":"radio","label":"Will you be presenting at the Congress?","options":["Yes, oral presentation","Yes, poster presentation","No, I will not be presenting","I am unsure if I will be presenting"]},
    {"id":"f_emerg_name","type":"text","label":"Emergency contact name"},
    {"id":"f_emerg_phone","type":"phone","label":"Emergency contact phone number"},
    {"id":"f_emerg_rel","type":"text","label":"Relationship of emergency contact to yourself"},
    {"id":"f_consent_list","type":"radio","label":"Do you want to be on the list of attendees that may appear on our website or social media?","options":["Yes","No"]},
    {"id":"f_consent_photo","type":"boolean","label":"I understand that photos or videos may be taken at the event for GANSID promotional purposes.","required":true},
    {"id":"f_consent_promo","type":"radio","label":"Do you consent to receiving promotional materials regarding the GANSID and the Congress by email?","options":["Yes","No"]},
    {"id":"f_consent_conduct","type":"boolean","label":"I have read and agree to the Code of Conduct","required":true},
    {"id":"f_consent_terms","type":"boolean","label":"I have read and agree to the Terms & Conditions","required":true},
    {"id":"f_consent_liability","type":"boolean","label":"I have read and agree to the Disclaimer & Liability waiver","required":true},
    {"id":"f_ticket","type":"ticket","label":"Registration","ticketConfig":{"currency":"USD","tickets":[]}}
  ]$fields$::jsonb,
  'event'
);
```

- [ ] **Step 3: Apply seed to GANSID**

```bash
npx supabase db query --linked -f tmp/seed-gansid-form.sql
```

Expected: rows returned empty (INSERT with no RETURNING).

- [ ] **Step 4: Verify**

```bash
npx supabase db query --linked "SELECT id, title, status, jsonb_array_length(fields) AS field_count, settings->>'pricingTemplateId' AS pricing_template_id FROM forms WHERE id = 'gansid-congress-2026';"
```

Expected: one row with title "GANSID Congress 2026 Registration", status "draft", field_count 23, pricing_template_id matching the UUID.

---

## Task 14: CLAUDE.md update + final verification + push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Form Templates + Group Registration sections to CLAUDE.md**

Append alongside the existing Dynamic Pricing Engine section:

```markdown
## Form Templates

File-based registry in `config/formTemplates.ts`. Admin's `FormsManager`
"Create Form" button opens a modal with template cards; templates can
declare `siteFilter: SiteKey[]` to restrict visibility per deployment.

Existing templates:
- **Blank** — empty form
- **Sponsor** — re-export of the existing sponsor-form builder (all sites)
- **GANSID Individual + Group Registration** — GANSID-only (`siteFilter:['gansid']`)

To add a template: create `config/formTemplates/build<Name>.ts` that returns
a partial Form shape, then add it to the TEMPLATES array. No UI work needed.

## Group Registration Flow

Triggered by the `registration-mode-selector` field type on a form. Single
form with Individual/Group path selector at the top; Group path renders
size picker (2–N), "I have all info" inline vs send-links toggle, and
same-country / same-category shortcuts.

- **Inline mode** — contact fills in full registration for every person
- **Send-links mode** — contact enters Name + Email + Country + Category
  for each; each guest receives a link to complete their personal details

Contact pays one PayPal capture for the group total (sum of per-person prices).
N attendee rows inserted in one transaction, sharing `transaction_id`:
primary + guests linked via `primary_attendee_id`. Send-links guests carry
`guest_type='pending-claim'` until they claim the link, which flips it to
`'claimed'`.

Spec: `docs/superpowers/specs/2026-04-16-form-templates-and-group-registration-design.md`
Plan: `docs/superpowers/plans/2026-04-16-form-templates-and-group-registration.md`
```

- [ ] **Step 2: Full verification**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all green.

- [ ] **Step 3: Commit CLAUDE.md + push branch**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record form templates + group registration flow in CLAUDE.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/form-templates-group-registration
```

- [ ] **Step 4: Manual end-to-end smoke test (user, in browser)**

On `gansid.netlify.app` after merging to main + Netlify rebuild:

1. Open Manage Forms → verify "GANSID Congress 2026 Registration" appears in the list (draft status)
2. Publish the form (flip status to active) and open its public URL
3. **Individual path:** select Individual → fill in form with country India + Physicians/Researchers → total $175 → PayPal sandbox → capture → verify attendee row has `pricing_tier='tier1'`, `pricing_bracket='early_bird'`, `pricing_category_id='physician'`, `is_primary=true`
4. **Group inline path:** select Group → 3 people → check "I have all info" → fill 3 rows (1× US/Physician + 2× India/Student). Expected breakdown: US/Physician/Early Bird = $250, India/Student/Early Bird = $50 × 2 → total **$350**. Proceed through sandbox PayPal. Verify 3 attendee rows inserted, 1 `is_primary=true` + 2 linked via `primary_attendee_id`, none with `guest_type='pending-claim'` (inline mode).
5. **Group send-links path:** select Group → 3 people → leave "I have all info" unchecked → fill Name+Email+Country+Category for each → sandbox PayPal → verify 3 rows inserted (2 with `guest_type='pending-claim'`) → verify the 2 pending guests received invitation emails → click one guest's link → form loads in claim mode with their name/email/country/category locked → fill remaining fields (dietary, consent) → submit → verify that row updates with `guest_type='claimed'` and they receive a personal confirmation email; primary receives a notification
6. **Template picker:** open FormsManager → click Create Form → verify modal shows Blank + Sponsor + GANSID Individual/Group on GANSID; switch sites mentally to SCAGO (open qreventcheck admin) → verify only Blank + Sponsor shown, no GANSID template
7. **SCAGO regression:** load the existing SCAGO sponsor and hope-gala forms → confirm no behavior changes; create a sponsor form via the new picker → confirm the result is identical to the old "Create Sponsor Form" button

If any step fails, report and I'll debug.

---

## Definition of done

- 3 new Vitest test files passing (`formTemplates`, `groupPricing`, existing suite)
- `npx tsc --noEmit` clean
- Both `npm run build` (SCAGO) and `VITE_SITE=gansid npm run build` succeed
- Template picker modal replaces "Create Sponsor Form" on both sites; GANSID shows its GANSID card, SCAGO doesn't
- GANSID form seeded; visible as Draft on GANSID admin
- End-to-end verification (Task 14 Step 4) completes with correct pricing, attendee rows, and emails for all three paths: Individual, Group inline, Group send-links
- Claim-link flow completes correctly; pending-claim → claimed transition happens; personal confirmation email sent
- SCAGO regression: live sponsor + hope-gala forms and their purchase flows unchanged
- `feat/form-templates-group-registration` branch pushed

## Not done here (deferred)

- Exhibitor form + staff roster (next sub-project)
- Dashboard tabs segmented by registration type (future sub-project)
- Admin-side group editing (swap registrant, refund flow)
- Payment reminder emails for pending-claim guests who don't click within N days
- `<GansidOnly>` / `<ScagoOnly>` wrapper components (backlog)
- Database-stored custom templates saved from admin-edited forms
- Split-payment groups
