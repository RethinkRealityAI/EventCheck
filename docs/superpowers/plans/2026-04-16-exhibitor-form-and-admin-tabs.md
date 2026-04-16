# Exhibitor Form + Admin Tabs + Consent Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the user always picks this — don't ask). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GANSID exhibitor registration flow (component-driven, no pricing — paid externally), a shared `ConsentCheckbox` component with modal-gated document viewing, a staff claim flow extending the existing pending-claim infrastructure, and an "Exhibitors" tab in the admin dashboard. Closes out Phase 2.

**Architecture:** Per [spec](../specs/2026-04-16-exhibitor-form-and-admin-tabs-design.md). New `form_type='exhibitor'` (single check-constraint migration, no new tables). `PublicExhibitorForm.tsx` rendered by `PublicRegistration.tsx` when the form is of exhibitor type. Tier definitions + quotas hardcoded in `buildGansidExhibitor.ts`. Staff invitations + claims reuse the group-flow pending-claim infrastructure; staff rows carry `guest_type='exhibitor-staff-pending'`. `ConsentCheckbox` loads markdown files as plain text at runtime and gates the checkbox until the modal has been viewed once.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest, Supabase (Postgres 17, Deno edge functions), `@supabase/supabase-js`.

---

## File structure

**Create:**
- `supabase/migrations/20260416120000_extend_form_type_with_exhibitor.sql` — check constraint update
- `config/formTemplates/buildGansidExhibitor.ts` — template + `EXHIBITOR_TIERS` constant
- `components/Exhibitor/PublicExhibitorForm.tsx` — main public form
- `components/Exhibitor/ExhibitorStaffRow.tsx` — per-staff-member row
- `components/Exhibitor/ExhibitorsTab.tsx` — admin dashboard tab
- `components/Consent/ConsentCheckbox.tsx` — shared consent + modal
- `public/branding/gansid/docs/gc26-terms-conditions.md` — moved from repo root
- `public/branding/gansid/docs/gc26-disclaimer.md` — moved from repo root
- `tests/exhibitorTiers.test.ts` — tier config sanity (quotas are positive numbers, IDs unique)
- `tmp/seed-gansid-exhibitor-form.sql` — one-off seed (not committed)
- `tmp/update-gansid-registration-consent-fields.sql` — one-off field update (not committed)

**Modify:**
- `types.ts` — `Attendee.guestType` union extends to include `'exhibitor-staff-pending' | 'exhibitor-staff-claimed'`; add `FormField.consentModal?: { title, url }`; add `FormField.linkText?: string`
- `config/formTemplates.ts` — register the exhibitor template in `TEMPLATES`
- `components/PublicRegistration.tsx` — branch to `PublicExhibitorForm` when `form.formType === 'exhibitor'`; pending-claim flow extended with extra field hides for `exhibitor-staff-pending`; boolean field render switches to `ConsentCheckbox` when `field.consentModal` is present; submit handler branch for `exhibitor-staff-pending` → `'exhibitor-staff-claimed'` + new email mode
- `components/AttendeeList.tsx` — add "Exhibitors" tab (conditionally visible); `ExhibitorsTab` component owns the render
- `supabase/functions/verify-payment/index.ts` — add exhibitor submission branch (no PayPal, just insert N rows) + fire per-staff invitation emails
- `supabase/functions/send-ticket-email/index.ts` — add `exhibitor-staff-invite` + `exhibitor-staff-claim-completed` modes
- `CLAUDE.md` — new "Exhibitor Form" + "Consent Modals" sections

**Removed from repo root** (moved to `public/branding/gansid/docs/`):
- `gc26-terms-conditions.md`
- `gc26-disclaimer.md`

**Not modified:**
- No new DB tables, no new columns on `attendees` or `forms`
- Sponsor logic (remains fully independent)
- Existing `pricing_templates` or dynamic-pricing code (exhibitors don't pay via our system)
- SCAGO-specific paths

---

## Task 1: Branch + schema migration + type additions

**Files:**
- Create: `supabase/migrations/20260416120000_extend_form_type_with_exhibitor.sql`
- Modify: `types.ts`

- [ ] **Step 1: Create feature branch**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
git checkout main
git pull
git checkout -b feat/exhibitor-form
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- supabase/migrations/20260416120000_extend_form_type_with_exhibitor.sql

ALTER TABLE public.forms DROP CONSTRAINT IF EXISTS forms_form_type_check;
ALTER TABLE public.forms ADD CONSTRAINT forms_form_type_check
  CHECK (form_type IN ('event', 'sponsor', 'exhibitor'));
```

- [ ] **Step 3: Apply the migration to both Supabase projects**

Use MCP for SCAGO (permission works):

Call `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `iigbgbgakevcgilucvbs`
- `name`: `extend_form_type_with_exhibitor`
- `query`: the SQL above

Expected: success.

For GANSID (MCP permission denied — use CLI):

```bash
npx supabase db query --linked -f supabase/migrations/20260416120000_extend_form_type_with_exhibitor.sql
```

Expected: empty rows (DDL succeeded).

- [ ] **Step 4: Verify both projects accept the new value**

SCAGO via MCP execute_sql:
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'forms_form_type_check';
```

Expected output contains: `CHECK (form_type IN ('event', 'sponsor', 'exhibitor'))` or equivalent.

GANSID via CLI:
```bash
npx supabase db query --linked "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'forms_form_type_check';"
```

Expected: same.

- [ ] **Step 5: Extend `Attendee.guestType` union in types.ts**

Find `Attendee` interface in `types.ts`. The existing `guestType?: 'adult' | 'child' | 'pending-claim' | 'claimed'` becomes:

```typescript
guestType?: 'adult' | 'child' | 'pending-claim' | 'claimed'
          | 'exhibitor-staff-pending' | 'exhibitor-staff-claimed';
```

- [ ] **Step 6: Extend `FormField` with consent-modal props**

In `types.ts`, add optional props to `FormField`:

```typescript
// For consent-style boolean fields: opens a modal with document content
// before the checkbox becomes clickable.
linkText?: string;
consentModal?: {
  title: string;
  url: string;
};
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If any existing code narrows on `Attendee.guestType` with an exhaustive switch, tsc will point it out — extend the switch to handle the two new values (usually just "no-op, fall through to default").

- [ ] **Step 8: DO NOT commit** — task 3 checkpoint covers this.

---

## Task 2: Move markdown docs + create ConsentCheckbox component

**Files:**
- Move: `gc26-terms-conditions.md` → `public/branding/gansid/docs/gc26-terms-conditions.md`
- Move: `gc26-disclaimer.md` → `public/branding/gansid/docs/gc26-disclaimer.md`
- Create: `components/Consent/ConsentCheckbox.tsx`

- [ ] **Step 1: Create the docs folder and move files**

```bash
mkdir -p public/branding/gansid/docs
git mv gc26-terms-conditions.md public/branding/gansid/docs/gc26-terms-conditions.md
git mv gc26-disclaimer.md public/branding/gansid/docs/gc26-disclaimer.md
```

If the source files aren't tracked by git yet (still untracked), use `mv` instead of `git mv` and add them in the next step.

- [ ] **Step 2: Verify Vite serves them**

```bash
npm run dev
```

In a browser: `http://localhost:5173/branding/gansid/docs/gc26-terms-conditions.md` — should render as plain text (browser's default text/markdown handling).

Stop dev.

- [ ] **Step 3: Create `components/Consent/ConsentCheckbox.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ConsentCheckboxProps {
  id: string;
  label: string;               // e.g. "I have read and agree to the"
  linkText: string;            // e.g. "Terms & Conditions"
  modalTitle: string;          // e.g. "Terms & Conditions"
  modalUrl: string;            // e.g. "/branding/gansid/docs/gc26-terms-conditions.md"
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}

export default function ConsentCheckbox({
  id, label, linkText, modalTitle, modalUrl, checked, onChange, required,
}: ConsentCheckboxProps) {
  const [hasSeenModal, setHasSeenModal] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [content, setContent] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openModal = async (e: React.MouseEvent) => {
    e.preventDefault();
    setModalOpen(true);
    if (!content && !loading) {
      setLoading(true);
      try {
        const res = await fetch(modalUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setContent(text);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setHasSeenModal(true);  // gate unlocks on FIRST close (user has at least seen the modal)
  };

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  return (
    <>
      <label htmlFor={id} className="flex items-start gap-2 text-sm text-slate-700">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          disabled={!hasSeenModal}
          onChange={e => onChange(e.target.checked)}
          required={required}
        />
        <span>
          {label}{' '}
          <button
            type="button"
            onClick={openModal}
            className="underline text-indigo-700 hover:text-indigo-900 font-medium"
          >
            {linkText}
          </button>
          {required && <span className="text-red-500"> *</span>}
          {!hasSeenModal && (
            <span className="ml-1 text-xs text-slate-400 italic">
              (please open the document before accepting)
            </span>
          )}
        </span>
      </label>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-xl font-semibold">{modalTitle}</h2>
              <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {loading && <div className="text-slate-400">Loading…</div>}
              {loadError && <div className="text-red-600 text-sm">Failed to load: {loadError}</div>}
              {!loading && !loadError && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
                  {content}
                </pre>
              )}
            </div>
            <div className="p-5 border-t flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: DO NOT commit** — Task 3 checkpoint covers this.

---

## Task 3: Exhibitor template builder + registry + tests + checkpoint commit

**Files:**
- Create: `config/formTemplates/buildGansidExhibitor.ts`
- Modify: `config/formTemplates.ts`
- Create: `tests/exhibitorTiers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/exhibitorTiers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EXHIBITOR_TIERS, buildGansidExhibitor } from '../config/formTemplates/buildGansidExhibitor';

describe('EXHIBITOR_TIERS', () => {
  it('has four tiers with unique ids', () => {
    expect(EXHIBITOR_TIERS.length).toBe(4);
    const ids = EXHIBITOR_TIERS.map(t => t.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('all quotas are positive integers', () => {
    for (const t of EXHIBITOR_TIERS) {
      expect(Number.isInteger(t.hallOnlyQuota)).toBe(true);
      expect(t.hallOnlyQuota).toBeGreaterThan(0);
      expect(Number.isInteger(t.fullCongressQuota)).toBe(true);
      expect(t.fullCongressQuota).toBeGreaterThan(0);
    }
  });

  it('platinum has the highest quotas', () => {
    const platinum = EXHIBITOR_TIERS.find(t => t.id === 'platinum')!;
    const others = EXHIBITOR_TIERS.filter(t => t.id !== 'platinum');
    for (const t of others) {
      expect(platinum.hallOnlyQuota).toBeGreaterThanOrEqual(t.hallOnlyQuota);
      expect(platinum.fullCongressQuota).toBeGreaterThanOrEqual(t.fullCongressQuota);
    }
  });
});

describe('buildGansidExhibitor template', () => {
  it('returns a form with form_type exhibitor', () => {
    const form = buildGansidExhibitor() as any;
    expect(form.formType).toBe('exhibitor');
    expect(form.title).toMatch(/exhibitor/i);
  });

  it('settings.staffFormId points at the GANSID registration form', () => {
    const form = buildGansidExhibitor() as any;
    expect(form.settings?.staffFormId).toBe('gansid-congress-2026');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- exhibitorTiers.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `config/formTemplates/buildGansidExhibitor.ts`**

```typescript
import type { Form } from '../../types';

export interface ExhibitorTier {
  id: string;
  name: string;
  hallOnlyQuota: number;
  fullCongressQuota: number;
  boothSize: string;
}

export const EXHIBITOR_TIERS: ReadonlyArray<ExhibitorTier> = [
  { id: 'platinum', name: 'Platinum', hallOnlyQuota: 12, fullCongressQuota: 6, boothSize: '18 m²' },
  { id: 'gold',     name: 'Gold',     hallOnlyQuota: 8,  fullCongressQuota: 4, boothSize: '9 m²' },
  { id: 'silver',   name: 'Silver',   hallOnlyQuota: 6,  fullCongressQuota: 3, boothSize: '9 m²' },
  { id: 'bronze',   name: 'Bronze',   hallOnlyQuota: 4,  fullCongressQuota: 2, boothSize: '—' },
];

export function getExhibitorTier(id: string): ExhibitorTier | undefined {
  return EXHIBITOR_TIERS.find(t => t.id === id);
}

export function buildGansidExhibitor(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'GANSID Congress 2026 Exhibitor Registration',
    description:
      'Exhibitor registration for organizations. Payment is handled externally; this form captures organization details, tier confirmation, and staff roster.',
    thankYouMessage:
      'Thank you for registering your organization! Your staff will receive individual invitation emails to complete their personal registration details.',
    formType: 'exhibitor' as any,
    settings: {
      staffFormId: 'gansid-congress-2026',
    },
    // Empty fields array — PublicExhibitorForm component renders a fixed layout,
    // not field-driven. This parallels the existing sponsor pattern.
    fields: [] as any,
  } as any;
}
```

Adjust `Form` property names if the interface uses `thank_you_message` vs `thankYouMessage`, etc.

- [ ] **Step 4: Register the template in `config/formTemplates.ts`**

Open `config/formTemplates.ts`. Add import + new entry in `TEMPLATES` (after the existing GANSID Individual + Group entry):

```typescript
import { buildGansidExhibitor } from './formTemplates/buildGansidExhibitor';

// ... inside TEMPLATES array, after the existing gansid-individual-group entry:
{
  key: 'gansid-exhibitor',
  displayName: 'GANSID Exhibitor Registration',
  description: 'Organization-level exhibitor form with tier-driven staff quotas. Paid externally.',
  siteFilter: ['gansid'],
  build: buildGansidExhibitor,
},
```

- [ ] **Step 5: Run tests — all passing**

```bash
npm test
```

Expected: 66 tests (64 existing + 2 new `exhibitorTiers` tests). The `formTemplates.test.ts` suite should also still pass because the new template follows the same contract.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit checkpoint — Tasks 1, 2, 3**

```bash
git add supabase/migrations/20260416120000_extend_form_type_with_exhibitor.sql \
        types.ts \
        components/Consent/ConsentCheckbox.tsx \
        config/formTemplates/buildGansidExhibitor.ts \
        config/formTemplates.ts \
        tests/exhibitorTiers.test.ts \
        public/branding/gansid/docs/
git commit -m "$(cat <<'EOF'
feat(exhibitor): schema + types + template + ConsentCheckbox + markdown docs

- Migration extends forms.form_type check constraint to include 'exhibitor'
- types.ts: Attendee.guestType union adds 'exhibitor-staff-pending' and
  'exhibitor-staff-claimed'; FormField gains optional consentModal + linkText
- ConsentCheckbox component: clickable label opens modal with fetched
  plain-text content, checkbox stays disabled until modal is closed once
- EXHIBITOR_TIERS constant + buildGansidExhibitor template (component-driven,
  fields: []); registered in config/formTemplates.ts with siteFilter ['gansid']
- Moved gc26-terms-conditions.md + gc26-disclaimer.md from repo root to
  public/branding/gansid/docs/ so Vite serves them as static assets

Schema change applied to both Supabase projects.

Per docs/superpowers/specs/2026-04-16-exhibitor-form-and-admin-tabs-design.md.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: PublicExhibitorForm component

**Files:**
- Create: `components/Exhibitor/PublicExhibitorForm.tsx`
- Create: `components/Exhibitor/ExhibitorStaffRow.tsx`

- [ ] **Step 1: Create `ExhibitorStaffRow.tsx`**

```tsx
import React from 'react';
import { X } from 'lucide-react';

interface Props {
  name: string;
  email: string;
  onChange: (patch: { name?: string; email?: string }) => void;
  onRemove: () => void;
}

export default function ExhibitorStaffRow({ name, email, onChange, onRemove }: Props) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        placeholder="Full name"
        value={name}
        onChange={e => onChange({ name: e.target.value })}
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => onChange({ email: e.target.value })}
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 hover:bg-red-50 rounded text-red-600"
        title="Remove"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `PublicExhibitorForm.tsx`**

```tsx
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Form } from '../../types';
import { EXHIBITOR_TIERS, getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import ConsentCheckbox from '../Consent/ConsentCheckbox';
import ExhibitorStaffRow from './ExhibitorStaffRow';
import { supabase } from '../../services/supabaseClient';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  category: 'hall_only' | 'full_congress';
}

interface Props {
  form: Form;
}

export default function PublicExhibitorForm({ form }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Tier
  const [tierId, setTierId] = useState<string | null>(null);
  const tier = tierId ? getExhibitorTier(tierId) : null;

  // Additional m²
  const [wantsAdditionalSqm, setWantsAdditionalSqm] = useState(false);
  const [additionalSqm, setAdditionalSqm] = useState<number | null>(null);

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const hallOnlyStaff = staff.filter(s => s.category === 'hall_only');
  const fullCongressStaff = staff.filter(s => s.category === 'full_congress');

  // Consents
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentDisclaimer, setConsentDisclaimer] = useState(false);
  const [consentPhoto, setConsentPhoto] = useState(false);

  const addStaff = (category: 'hall_only' | 'full_congress') => {
    if (!tier) return;
    const limit = category === 'hall_only' ? tier.hallOnlyQuota : tier.fullCongressQuota;
    const current = staff.filter(s => s.category === category).length;
    if (current >= limit) return;
    setStaff(prev => [...prev, {
      id: `staff_${Date.now()}_${prev.length}`,
      name: '', email: '', category,
    }]);
  };

  const updateStaff = (id: string, patch: { name?: string; email?: string }) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  const canSubmit = (
    orgName.trim() &&
    contactName.trim() &&
    contactEmail.trim() &&
    tier &&
    staff.length > 0 &&
    staff.every(s => s.name.trim() && s.email.trim()) &&
    consentTerms && consentDisclaimer && consentPhoto
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !tier) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-payment', {
        body: {
          mode: 'paid',
          formId: form.id,
          exhibitorSubmission: true,
          staffFormId: (form.settings as any)?.staffFormId,
          org: {
            orgName: orgName.trim(),
            tier: tier.id,
            additionalSqm: wantsAdditionalSqm ? (additionalSqm ?? 0) : null,
            contactName: contactName.trim(),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim() || null,
          },
          staff: staff.map(s => ({
            name: s.name.trim(),
            email: s.email.trim(),
            category: s.category,
          })),
        },
      });

      if (fnError) {
        setError(fnError.message || 'Failed to register');
        return;
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
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Registration complete</h1>
        <p className="text-slate-600">
          Thank you for registering <strong>{orgName}</strong>. Your {staff.length} staff member{staff.length === 1 ? '' : 's'} will receive invitation emails shortly to complete their personal registration details.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        {form.description && <p className="text-slate-600 mt-1">{form.description}</p>}
      </header>

      {/* Section 1: Organization info */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Organization information</h2>
        <label className="block">
          <span className="text-sm font-medium">Organization Name *</span>
          <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Person Name *</span>
          <input type="text" required value={contactName} onChange={e => setContactName(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Email *</span>
          <input type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Phone</span>
          <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
      </section>

      {/* Section 2: Tier selection */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Exhibitor Tier *</h2>
        <p className="text-xs text-slate-500">Select the tier you paid for. Staff quotas are enforced by tier.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EXHIBITOR_TIERS.map(t => (
            <label key={t.id}
              className={`border rounded-lg p-3 cursor-pointer hover:border-indigo-400 ${tierId === t.id ? 'border-indigo-600 bg-indigo-50' : ''}`}>
              <input type="radio" name="tier" checked={tierId === t.id}
                onChange={() => setTierId(t.id)} className="mr-2" />
              <span className="font-semibold">{t.name}</span>
              <div className="text-xs text-slate-500 mt-1">
                {t.boothSize !== '—' && <>Booth: <strong>{t.boothSize}</strong> · </>}
                {t.hallOnlyQuota} Hall-Only + {t.fullCongressQuota} Full Congress staff
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Section 3: Additional m² */}
      {tier && (
        <section className="space-y-3 border rounded-xl p-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wantsAdditionalSqm}
              onChange={e => setWantsAdditionalSqm(e.target.checked)} />
            Do you want additional booth space? (paid separately)
          </label>
          {wantsAdditionalSqm && (
            <label className="block">
              <span className="text-sm font-medium">Additional m²</span>
              <input type="number" min={1} value={additionalSqm ?? ''}
                onChange={e => setAdditionalSqm(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-40 border rounded-lg px-3 py-2" />
            </label>
          )}
        </section>
      )}

      {/* Section 4: Staff roster */}
      {tier && (
        <section className="space-y-4 border rounded-xl p-5">
          <h2 className="font-semibold">Staff Roster</h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Exhibit Hall Only staff</h3>
              <span className="text-xs text-slate-500">{hallOnlyStaff.length} of {tier.hallOnlyQuota} slots used</span>
            </div>
            {hallOnlyStaff.map(s => (
              <ExhibitorStaffRow key={s.id} name={s.name} email={s.email}
                onChange={patch => updateStaff(s.id, patch)} onRemove={() => removeStaff(s.id)} />
            ))}
            <button type="button"
              disabled={hallOnlyStaff.length >= tier.hallOnlyQuota}
              onClick={() => addStaff('hall_only')}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 disabled:text-slate-400">
              <Plus className="w-4 h-4" /> Add Hall-Only staff member
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Full Congress staff</h3>
              <span className="text-xs text-slate-500">{fullCongressStaff.length} of {tier.fullCongressQuota} slots used</span>
            </div>
            {fullCongressStaff.map(s => (
              <ExhibitorStaffRow key={s.id} name={s.name} email={s.email}
                onChange={patch => updateStaff(s.id, patch)} onRemove={() => removeStaff(s.id)} />
            ))}
            <button type="button"
              disabled={fullCongressStaff.length >= tier.fullCongressQuota}
              onClick={() => addStaff('full_congress')}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 disabled:text-slate-400">
              <Plus className="w-4 h-4" /> Add Full Congress staff member
            </button>
          </div>
        </section>
      )}

      {/* Section 5: Consents */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Consents</h2>
        <ConsentCheckbox
          id="consent-terms"
          label="I have read and agree to the"
          linkText="Terms & Conditions"
          modalTitle="GANSID Congress 2026 — Terms & Conditions"
          modalUrl="/branding/gansid/docs/gc26-terms-conditions.md"
          checked={consentTerms}
          onChange={setConsentTerms}
          required
        />
        <ConsentCheckbox
          id="consent-disclaimer"
          label="I have read and agree to the"
          linkText="Disclaimer & Liability Waiver"
          modalTitle="GANSID Congress 2026 — Disclaimer & Limitation of Liability"
          modalUrl="/branding/gansid/docs/gc26-disclaimer.md"
          checked={consentDisclaimer}
          onChange={setConsentDisclaimer}
          required
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={consentPhoto}
            onChange={e => setConsentPhoto(e.target.checked)} required />
          I acknowledge that photos or videos may be taken at the event for GANSID promotional purposes. *
        </label>
      </section>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
          {error}
        </div>
      )}

      <button type="submit"
        disabled={!canSubmit || submitting}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 disabled:bg-slate-300">
        {submitting ? 'Submitting…' : 'Register Organization'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Type-check + test**

```bash
npx tsc --noEmit
npm test
```

Expected: clean, 66 tests pass.

- [ ] **Step 4: DO NOT commit** — Task 5 checkpoint covers this.

---

## Task 5: PublicRegistration integration — exhibitor routing + consent modal rendering + staff claim extension + commit

**Files:**
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Read the file to locate key branch points**

Identify:
- Where the form is loaded and `form.formType` is checked (likely a conditional rendering the sponsor form when `form.formType === 'sponsor'`)
- Where `boolean`-type fields render (so `ConsentCheckbox` can be added)
- Where pending-claim field hiding happens (so exhibitor-staff-pending can extend it)

- [ ] **Step 2: Import the exhibitor form**

At the top:

```typescript
import PublicExhibitorForm from './Exhibitor/PublicExhibitorForm';
import ConsentCheckbox from './Consent/ConsentCheckbox';
```

- [ ] **Step 3: Add exhibitor form routing**

Find the existing sponsor branch (something like `if (form.formType === 'sponsor' && !guestRef) return <PublicSponsorForm form={form} />`). Add a parallel branch ABOVE or BELOW it:

```tsx
if (form.formType === 'exhibitor' && !guestRef) {
  return <PublicExhibitorForm form={form} />;
}
```

- [ ] **Step 4: Upgrade boolean field rendering to use ConsentCheckbox when consentModal is set**

In the field-type switch, find the `boolean` branch:

```tsx
if (field.type === 'boolean') {
  if (field.consentModal && field.linkText) {
    return (
      <ConsentCheckbox
        id={field.id}
        label={field.label.replace(field.linkText, '')}
        linkText={field.linkText}
        modalTitle={field.consentModal.title}
        modalUrl={field.consentModal.url}
        checked={!!answers[field.id]}
        onChange={v => handleInputChange(field.id, v)}
        required={field.required}
      />
    );
  }
  // existing plain boolean render
}
```

Adapt `handleInputChange` to the actual updater name.

- [ ] **Step 5: Extend pending-claim to handle exhibitor-staff-pending**

Find where `guest_type === 'pending-claim'` is checked. Generalize to also cover `'exhibitor-staff-pending'`:

```typescript
const isPendingClaim = loadedRefAttendee?.guestType === 'pending-claim';
const isExhibitorStaffPending = loadedRefAttendee?.guestType === 'exhibitor-staff-pending';
const isAnyPendingClaim = isPendingClaim || isExhibitorStaffPending;
```

Use `isAnyPendingClaim` anywhere the existing code currently used `isPendingClaim` EXCEPT the country-lock logic — exhibitor staff don't have pricing, so their country shouldn't be locked.

Change any `isPendingClaim ?` rendering gates to `isAnyPendingClaim ?` for:
- Banner display (adjust text below for exhibitor staff — "Your organization has registered you")
- Hiding RMS field
- Hiding ticket/pricing UI
- Using the claim-update submit path

Keep country-lock specific to `isPendingClaim` only.

- [ ] **Step 6: Add exhibitor-staff field hides**

In the field rendering loop, when `isExhibitorStaffPending`, hide fields whose id is in a small list:

```typescript
const EXHIBITOR_STAFF_HIDDEN_FIELD_IDS = new Set(['f_present', 'f_emerg_name', 'f_emerg_phone', 'f_emerg_rel']);

// Inside the map:
if (isExhibitorStaffPending && EXHIBITOR_STAFF_HIDDEN_FIELD_IDS.has(field.id)) {
  return null;
}
// otherwise continue existing render
```

Place this `const EXHIBITOR_STAFF_HIDDEN_FIELD_IDS` near the top of the component file for discoverability.

- [ ] **Step 7: Adjust pending-claim banner text for exhibitor staff**

Where the existing banner renders (blue-ish notice):

```tsx
{isAnyPendingClaim && (
  <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
    {isExhibitorStaffPending
      ? 'Your organization has registered you for the GANSID Congress. Please complete your personal details below.'
      : 'Your registration has been paid for as part of a group. Please complete your personal details below.'}
  </div>
)}
```

- [ ] **Step 8: Claim submit — branch on guest_type for email mode**

In the existing claim submit handler:

```typescript
if (isAnyPendingClaim && loadedRefAttendee) {
  const newGuestType = isExhibitorStaffPending ? 'exhibitor-staff-claimed' : 'claimed';
  const emailMode = isExhibitorStaffPending ? 'exhibitor-staff-claim-completed' : 'guest-claim-completed';

  const { error } = await supabase.from('attendees').update({
    answers,
    guest_type: newGuestType,
  }).eq('id', loadedRefAttendee.id);

  if (error) { setError(error.message || 'Failed to save'); return; }

  supabase.functions.invoke('send-ticket-email', {
    body: { mode: emailMode, attendeeId: loadedRefAttendee.id },
  }).catch(() => {});

  // existing success/ticket generation...
  return;
}
```

Adapt variable names to the actual file.

- [ ] **Step 9: Type-check + test + build**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass.

- [ ] **Step 10: Commit — Tasks 4 + 5 checkpoint**

```bash
git add components/Exhibitor/ \
        components/PublicRegistration.tsx
git commit -m "$(cat <<'EOF'
feat(exhibitor): PublicExhibitorForm + staff claim flow integration

- PublicExhibitorForm component: org info, tier selection, additional m²
  (informational), tier-driven staff roster with hard quota caps, three
  consents (Terms, Disclaimer via ConsentCheckbox; photo as plain boolean).
  Submits to verify-payment with exhibitorSubmission: true.
- ExhibitorStaffRow: per-staff-member name + email + remove row.
- PublicRegistration routes exhibitor-type forms to PublicExhibitorForm
  (parallel to sponsor branch).
- Boolean field rendering upgraded: when field.consentModal is present,
  ConsentCheckbox renders with modal-gated unlock.
- Pending-claim flow generalized: 'exhibitor-staff-pending' rows reuse the
  existing locked/hidden UI (RMS, ticket, PayPal) AND additionally hide
  f_present + f_emerg_* fields. Country NOT locked (no pricing for staff).
- Claim submit branches guest_type transition + email mode:
  'pending-claim' → 'claimed' (guest-claim-completed email)
  'exhibitor-staff-pending' → 'exhibitor-staff-claimed' (exhibitor-staff-claim-completed email).

Edge function changes ship in the next task.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: verify-payment exhibitor branch + send-ticket-email modes + deploy + commit

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`
- Modify: `supabase/functions/send-ticket-email/index.ts`

- [ ] **Step 1: Add exhibitor submission branch to verify-payment**

Open `supabase/functions/verify-payment/index.ts`. Near the top of the event-branch handler (BEFORE the existing group + single-person dynamic pricing branches), add:

```typescript
// Exhibitor submission branch — no PayPal, just insert rows
if (body.exhibitorSubmission === true) {
  // Validate form is exhibitor type
  const { data: exhibitorForm, error: fErr } = await supabase
    .from('forms').select('form_type').eq('id', formId).maybeSingle();
  if (fErr || !exhibitorForm) return jsonResponse({ error: 'Form not found' }, 404);
  if (exhibitorForm.form_type !== 'exhibitor') {
    return jsonResponse({ error: 'Not an exhibitor form' }, 400);
  }

  const org = body.org;
  const staffFormId = body.staffFormId;
  const staffMembers = Array.isArray(body.staff) ? body.staff : [];
  if (!org || !staffFormId || staffMembers.length === 0) {
    return jsonResponse({ error: 'Missing org, staffFormId, or staff' }, 400);
  }

  // 1. Insert the org primary row
  const orgId = crypto.randomUUID();
  const orgRow = {
    id: orgId,
    form_id: formId,
    name: `${org.orgName} — Contact`,
    email: org.contactEmail,
    ticket_type: 'Exhibitor',
    is_primary: true,
    payment_status: 'paid',
    payment_amount: 'PAID EXTERNALLY',
    qr_payload: JSON.stringify({ id: orgId }),
    company_info: {
      orgName: org.orgName,
      tier: org.tier,
      additionalSqm: org.additionalSqm,
      contactName: org.contactName,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
    },
  };

  const { error: orgErr } = await supabase.from('attendees').insert([orgRow]);
  if (orgErr) return jsonResponse({ error: 'Failed to save org: ' + orgErr.message }, 500);

  // 2. Insert N staff rows on the staff form
  const staffRows = staffMembers.map((s: any) => {
    const id = crypto.randomUUID();
    return {
      id,
      form_id: staffFormId,
      name: s.name,
      email: s.email,
      ticket_type: 'Exhibitor Staff',
      is_primary: false,
      primary_attendee_id: orgId,
      guest_type: 'exhibitor-staff-pending',
      payment_status: 'paid',
      payment_amount: 'PAID EXTERNALLY',
      qr_payload: JSON.stringify({ id }),
      answers: { exhibitor_staff_category: s.category },
    };
  });

  const { error: staffErr } = await supabase.from('attendees').insert(staffRows);
  if (staffErr) {
    console.error('CRITICAL: org inserted but staff insert failed', JSON.stringify({ orgId, error: staffErr.message }));
    return jsonResponse({ error: 'Saved org but failed to save staff: ' + staffErr.message }, 500);
  }

  // 3. Fire invitation emails (fire-and-forget)
  const emailFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`;
  for (const row of staffRows) {
    fetch(emailFnUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'exhibitor-staff-invite',
        attendeeId: row.id,
        origin: req.headers.get('origin') ?? '',
      }),
    }).catch(e => console.warn('Exhibitor staff invite failed', e));
  }

  return jsonResponse({ ok: true, orgId, staffIds: staffRows.map(r => r.id) });
}
```

Match the actual variable names in the file for `supabase`, `formId`, `req`, `body`, `jsonResponse`.

- [ ] **Step 2: Add exhibitor email modes to send-ticket-email**

Open `supabase/functions/send-ticket-email/index.ts`. Near where the existing `group-invite` and `guest-claim-completed` modes are handled, add two parallel branches:

```typescript
if (body.mode === 'exhibitor-staff-invite') {
  const { data: staff } = await supabase.from('attendees').select('*').eq('id', body.attendeeId).maybeSingle();
  if (!staff) return jsonResponse({ error: 'Staff member not found' }, 404);

  const { data: org } = await supabase.from('attendees').select('company_info, email, name')
    .eq('id', staff.primary_attendee_id).maybeSingle();

  const { data: form } = await supabase.from('forms').select('title').eq('id', staff.form_id).maybeSingle();
  const eventName = form?.title || 'the GANSID Congress';
  const orgName = (org?.company_info as any)?.orgName || 'your organization';

  const origin = body.origin || '';
  const registrationLink = `${origin}/#/form/${staff.form_id}?ref=${staff.id}`;

  const subject = `Complete your registration for ${eventName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2>Hi ${staff.name || 'there'},</h2>
      <p><strong>${orgName}</strong> has registered you for the <strong>${eventName}</strong> as an exhibitor staff member.</p>
      <p>Please click below to complete your personal details (dietary restrictions, accessibility needs, consent).</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${registrationLink}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:white;border-radius:6px;text-decoration:none;font-weight:600;">
          Complete my registration
        </a>
      </p>
      <p style="color:#666;font-size:13px;">Or copy this link into your browser:<br>${registrationLink}</p>
    </div>
  `;

  await sendSimpleEmail({ to: staff.email, subject, html });  // adapt name to actual helper
  return jsonResponse({ ok: true });
}

if (body.mode === 'exhibitor-staff-claim-completed') {
  const { data: staff } = await supabase.from('attendees').select('*').eq('id', body.attendeeId).maybeSingle();
  if (!staff) return jsonResponse({ error: 'Staff not found' }, 404);

  // Send the personal ticket to the staff member (reuse whatever default ticket flow exists)
  // If the existing file has a helper like sendTicketEmailFor(attendee), use it. Otherwise
  // replicate the default flow's attendee ticket send inline.
  try {
    // <invoke existing default ticket send for `staff`>
  } catch (e) {
    console.warn('Failed to send exhibitor-staff ticket email', e);
  }

  // Notify the org contact
  if (staff.primary_attendee_id) {
    const { data: org } = await supabase.from('attendees').select('company_info, email').eq('id', staff.primary_attendee_id).maybeSingle();
    const contactEmail = org?.email;
    const orgName = (org?.company_info as any)?.orgName || 'your organization';
    if (contactEmail) {
      const subject = `${staff.name} has completed their registration`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <p>Hi ${(org?.company_info as any)?.contactName || 'there'},</p>
          <p><strong>${staff.name}</strong> has completed their registration details for the GANSID Congress on behalf of <strong>${orgName}</strong>.</p>
          <p>Their individual ticket has been emailed to them directly.</p>
        </div>
      `;
      await sendSimpleEmail({ to: contactEmail, subject, html }).catch(() => {});
    }
  }
  return jsonResponse({ ok: true });
}
```

Adapt `sendSimpleEmail` to the actual helper name added in sub-project 2's Task 11/12 commit (`b9390b0`).

- [ ] **Step 3: Deploy both edge functions to both projects**

```bash
npx supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez --use-api
npx supabase functions deploy send-ticket-email --project-ref iigbgbgakevcgilucvbs --use-api
npx supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
```

Expected: all four print `Deployed Functions on project <ref>: <fn>`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/verify-payment/index.ts supabase/functions/send-ticket-email/index.ts
git commit -m "$(cat <<'EOF'
feat(exhibitor): edge function support for exhibitor submission + staff emails

verify-payment gains an exhibitor-submission branch (gated on
body.exhibitorSubmission === true) that:
- Validates form.form_type === 'exhibitor'
- Inserts one org primary row + N staff rows (staff on the staff form, linked
  via primary_attendee_id, guest_type='exhibitor-staff-pending')
- Fires per-staff 'exhibitor-staff-invite' emails (fire-and-forget)
- All rows carry payment_status='paid' and payment_amount='PAID EXTERNALLY'
  (no PayPal)

send-ticket-email gains two modes:
- 'exhibitor-staff-invite': short invitation email with claim link for each
  pending staff member
- 'exhibitor-staff-claim-completed': personal ticket to the claiming staff +
  notification to the org contact

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin "Exhibitors" tab + commit

**Files:**
- Create: `components/Exhibitor/ExhibitorsTab.tsx`
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Create the Exhibitors tab component**

```tsx
// components/Exhibitor/ExhibitorsTab.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Mail, Check } from 'lucide-react';
import type { Attendee, Form } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendees: Attendee[];
  forms: Form[];
  onRefresh?: () => void;
}

export default function ExhibitorsTab({ attendees, forms, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { showNotification } = useNotifications();

  const exhibitorForms = forms.filter(f => (f as any).formType === 'exhibitor');
  const exhibitorFormIds = new Set(exhibitorForms.map(f => f.id));

  // Primary attendees on exhibitor forms = the exhibitor org contacts
  const orgs = attendees.filter(a =>
    exhibitorFormIds.has((a as any).formId) && (a as any).isPrimary !== false && !(a as any).primaryAttendeeId
  );

  // For each org, its staff = attendees whose primary_attendee_id points at it
  const staffByOrg = new Map<string, Attendee[]>();
  for (const a of attendees) {
    const pid = (a as any).primaryAttendeeId;
    if (pid) {
      const arr = staffByOrg.get(pid) ?? [];
      arr.push(a);
      staffByOrg.set(pid, arr);
    }
  }

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (orgs.length === 0) {
    return <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl">No exhibitor registrations yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="w-8"></th>
            <th className="px-3 py-2">Organization</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Staff Progress</th>
            <th className="px-3 py-2">Registered</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map(org => {
            const info = ((org as any).company_info ?? {}) as any;
            const tier = getExhibitorTier(info.tier);
            const staff = staffByOrg.get(org.id) ?? [];
            const hallStaff = staff.filter(s => ((s as any).answers?.exhibitor_staff_category) === 'hall_only');
            const fullStaff = staff.filter(s => ((s as any).answers?.exhibitor_staff_category) === 'full_congress');
            const isExpanded = expanded.has(org.id);
            return (
              <React.Fragment key={org.id}>
                <tr className="border-t hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <button onClick={() => toggleExpand(org.id)} className="p-1 hover:bg-slate-100 rounded">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium">{info.orgName || org.name}</td>
                  <td className="px-3 py-2">{tier?.name ?? info.tier}</td>
                  <td className="px-3 py-2 text-slate-600">{org.email}</td>
                  <td className="px-3 py-2 text-xs">
                    {tier
                      ? `${hallStaff.length}/${tier.hallOnlyQuota} Hall · ${fullStaff.length}/${tier.fullCongressQuota} Full`
                      : `${staff.length} staff`}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {(org as any).registeredAt ? new Date((org as any).registeredAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="p-3 bg-slate-50">
                      <StaffSection title="Hall Only staff" staff={hallStaff} orgFormId={(org as any).formId} onRefresh={onRefresh} />
                      <StaffSection title="Full Congress staff" staff={fullStaff} orgFormId={(org as any).formId} onRefresh={onRefresh} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StaffSection({ title, staff, orgFormId, onRefresh }:
  { title: string; staff: Attendee[]; orgFormId: string; onRefresh?: () => void }) {
  const { showNotification } = useNotifications();
  if (staff.length === 0) {
    return (
      <div className="mb-2">
        <div className="text-xs font-medium text-slate-500 uppercase mb-1">{title}</div>
        <div className="text-xs text-slate-400 italic">No staff in this category</div>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="text-xs font-medium text-slate-500 uppercase mb-1">{title}</div>
      <ul className="space-y-1">
        {staff.map(s => (
          <StaffRow key={s.id} staff={s} onRefresh={onRefresh} showNotification={showNotification} />
        ))}
      </ul>
    </div>
  );
}

function StaffRow({ staff, onRefresh, showNotification }:
  { staff: Attendee; onRefresh?: () => void; showNotification: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const guestType = (staff as any).guestType;
  const isPending = guestType === 'exhibitor-staff-pending';
  const copyLink = () => {
    const url = `${window.location.origin}/#/form/${(staff as any).formId}?ref=${staff.id}`;
    navigator.clipboard.writeText(url);
    showNotification('Link copied to clipboard', 'success');
  };
  const resend = async () => {
    await supabase.functions.invoke('send-ticket-email', {
      body: { mode: 'exhibitor-staff-invite', attendeeId: staff.id, origin: window.location.origin },
    });
    showNotification('Invitation resent', 'success');
  };
  const markComplete = async () => {
    if (!window.confirm(`Mark ${staff.name} as completed?`)) return;
    await supabase.from('attendees').update({ guest_type: 'exhibitor-staff-claimed' }).eq('id', staff.id);
    onRefresh?.();
    showNotification('Marked as completed', 'success');
  };

  const badge = guestType === 'exhibitor-staff-pending'
    ? <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900 text-xs">Pending</span>
    : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-900 text-xs">Completed</span>;

  return (
    <li className="flex items-center gap-2 pl-4 py-1">
      <span className="text-sm">{staff.name}</span>
      <span className="text-xs text-slate-500">{staff.email}</span>
      {badge}
      {isPending && (
        <div className="ml-auto flex gap-1">
          <button onClick={copyLink} title="Copy link" className="p-1 hover:bg-slate-200 rounded"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={resend} title="Resend" className="p-1 hover:bg-slate-200 rounded"><Mail className="w-3.5 h-3.5" /></button>
          <button onClick={markComplete} title="Mark complete" className="p-1 hover:bg-slate-200 rounded"><Check className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Integrate into AttendeeList.tsx**

Open `components/AttendeeList.tsx`. Find the tab definitions (the existing tabs: Live / Test / Donated / Tables / Sponsor-Tickets). Add a new tab:

```tsx
import ExhibitorsTab from './Exhibitor/ExhibitorsTab';

// In the tab definitions array or its equivalent, add (conditional on exhibitor forms existing):
const hasExhibitorForms = forms.some(f => (f as any).formType === 'exhibitor');

// ... within the tab rendering:
{hasExhibitorForms && activeTab === 'exhibitors' && (
  <ExhibitorsTab attendees={attendees} forms={forms} onRefresh={onRefresh} />
)}
```

Also add a tab button for `'exhibitors'` alongside the existing tab buttons, conditionally rendered when `hasExhibitorForms` is true. Label: `Exhibitors`. If the existing tab state type is a union (`'live' | 'test' | ...`), extend it to include `'exhibitors'`.

- [ ] **Step 3: Type-check + test + build**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add components/Exhibitor/ExhibitorsTab.tsx components/AttendeeList.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): Exhibitors tab with org/staff roster + per-staff actions

New tab in AttendeeList (visible only when the project has at least one
exhibitor form). Lists exhibitor org rows with tier, contact, and staff
progress columns. Each org expandable to reveal Hall-Only and Full Congress
staff subsections with status badges (Pending/Completed).

Per-staff actions: copy registration link, resend invitation email, manually
mark as completed. All actions reuse the patterns established for the group
flow dashboard in sub-project 2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Seed GANSID exhibitor form + update registration form consent fields

**Files:**
- Create: `tmp/seed-gansid-exhibitor-form.sql` (not committed)
- Create: `tmp/update-gansid-registration-consent-fields.sql` (not committed)

- [ ] **Step 1: Write the exhibitor form seed**

```sql
-- tmp/seed-gansid-exhibitor-form.sql
INSERT INTO public.forms (id, title, description, status, settings, fields, form_type)
VALUES (
  'gansid-congress-2026-exhibitors',
  'GANSID Congress 2026 Exhibitor Registration',
  'Exhibitor registration for organizations. Payment is handled externally; this form captures organization details, tier confirmation, and staff roster.',
  'draft',
  jsonb_build_object('staffFormId', 'gansid-congress-2026'),
  '[]'::jsonb,
  'exhibitor'
);
```

- [ ] **Step 2: Apply to GANSID only**

```bash
npx supabase db query --linked -f tmp/seed-gansid-exhibitor-form.sql
```

Expected: rows empty (INSERT with no RETURNING).

- [ ] **Step 3: Verify**

```bash
npx supabase db query --linked "SELECT id, title, status, form_type, settings->>'staffFormId' AS staff_form FROM forms WHERE id = 'gansid-congress-2026-exhibitors';"
```

Expected: one row with `form_type = 'exhibitor'` and `staff_form = 'gansid-congress-2026'`.

- [ ] **Step 4: Write the registration form consent update**

```sql
-- tmp/update-gansid-registration-consent-fields.sql
-- Fetches current fields, removes f_consent_conduct, upgrades the two
-- consent-with-document fields to use ConsentCheckbox via consentModal + linkText.

UPDATE public.forms SET fields = (
  SELECT jsonb_agg(
    CASE
      WHEN f->>'id' = 'f_consent_terms' THEN
        f || jsonb_build_object(
          'label', 'I have read and agree to the',
          'linkText', 'Terms & Conditions',
          'consentModal', jsonb_build_object(
            'title', 'GANSID Congress 2026 — Terms & Conditions',
            'url', '/branding/gansid/docs/gc26-terms-conditions.md'
          )
        )
      WHEN f->>'id' = 'f_consent_liability' THEN
        f || jsonb_build_object(
          'label', 'I have read and agree to the',
          'linkText', 'Disclaimer & Liability Waiver',
          'consentModal', jsonb_build_object(
            'title', 'GANSID Congress 2026 — Disclaimer & Limitation of Liability',
            'url', '/branding/gansid/docs/gc26-disclaimer.md'
          )
        )
      ELSE f
    END
  )
  FROM jsonb_array_elements(fields) f
  WHERE f->>'id' != 'f_consent_conduct'  -- drop the conduct field entirely
)
WHERE id = 'gansid-congress-2026';
```

- [ ] **Step 5: Apply the update**

```bash
npx supabase db query --linked -f tmp/update-gansid-registration-consent-fields.sql
```

- [ ] **Step 6: Verify both changes**

```bash
npx supabase db query --linked "SELECT jsonb_array_length(fields) AS field_count FROM forms WHERE id = 'gansid-congress-2026';"
```

Expected: field_count reduced by 1 (from 23 to 22 — the Code of Conduct field was removed).

```bash
npx supabase db query --linked "SELECT f.value->>'id' AS id, f.value->'consentModal'->>'url' AS modal_url FROM forms, jsonb_array_elements(fields) f WHERE forms.id = 'gansid-congress-2026' AND f.value->>'id' LIKE 'f_consent%';"
```

Expected: 3 rows (f_consent_terms with terms URL, f_consent_liability with disclaimer URL, f_consent_photo with no modal_url — only the two consent-with-doc fields have modals).

---

## Task 9: CLAUDE.md + final verification + push

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Exhibitor Form + Consent Modals sections to CLAUDE.md**

Insert near the existing "Form Templates" / "Group Registration Flow" sections:

```markdown
## Exhibitor Form

GANSID-only, component-driven (`form_type='exhibitor'`), no pricing — exhibitors have paid externally. The form captures organization info, tier selection, optional additional m², and a tier-driven staff roster split into Hall-Only vs Full Congress categories. Each staff member receives an invitation email with a claim link pointing at the GANSID Congress registration form (same form SCAGO uses for sole attendees, just reached via `?ref=<staff.id>`).

`EXHIBITOR_TIERS` in `config/formTemplates/buildGansidExhibitor.ts` is the single source of truth for tier names, staff quotas, and booth sizes. Shared between the public form and the admin Exhibitors tab.

Data model: one primary attendee row per org (on the exhibitor form), N guest rows per staff member (on the registration form), linked via `primary_attendee_id`. All rows carry `payment_status='paid'` and `payment_amount='PAID EXTERNALLY'` — no PayPal involvement.

Staff claim flow reuses the pending-claim infrastructure from sub-project 2; `guest_type='exhibitor-staff-pending'` activates the same field hides (RMS, ticket, PayPal) PLUS two extra hides (presenting + emergency contact). Country is NOT locked (staff don't have pricing). Submit flips to `'exhibitor-staff-claimed'` and fires a personal confirmation email plus a notification to the org contact.

Spec: `docs/superpowers/specs/2026-04-16-exhibitor-form-and-admin-tabs-design.md`
Plan: `docs/superpowers/plans/2026-04-16-exhibitor-form-and-admin-tabs.md`

## Consent Modals

`components/Consent/ConsentCheckbox.tsx` — shared component that renders a clickable label; clicking it opens a modal that fetches a markdown file at runtime (rendered as plain text). The checkbox stays disabled until the modal has been closed once.

Used wherever a consent requires the user to actually read a document before accepting: currently GANSID's Terms & Conditions + Disclaimer & Liability on both the Congress registration form and the new exhibitor form. Documents live as static assets under `public/branding/gansid/docs/`.

To add a new consent-with-modal field to any form: set `FormField.type = 'boolean'`, add `linkText` (the clickable portion of the label) and `consentModal: { title, url }` (URL points at the static asset). `PublicRegistration.tsx` detects `consentModal` and renders via `ConsentCheckbox` instead of the plain boolean path.
```

- [ ] **Step 2: Full verification**

```bash
npx tsc --noEmit
npm test
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass. 66 tests.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record exhibitor form + consent modals in CLAUDE.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin feat/exhibitor-form
```

- [ ] **Step 4: Manual end-to-end smoke test (user, after merging to main)**

On `gansid.netlify.app`:

1. Open Manage Forms → verify **two** draft forms exist: "GANSID Congress 2026 Registration" (updated — 22 fields) and "GANSID Congress 2026 Exhibitor Registration" (new — 0 fields, component-driven)
2. Open the registration form's public URL in incognito → click the Terms & Conditions link → modal opens with the T&C text → close modal → checkbox becomes clickable → same for Disclaimer & Liability. Verify Code of Conduct checkbox is GONE.
3. Activate the exhibitor form, open its public URL in incognito.
4. Fill org info → pick Gold tier → add 2 Hall-Only staff + 1 Full Congress staff → check consents → submit.
5. Verify:
   - Supabase `attendees`: 1 org row (form_id = exhibitor form, is_primary=true), 3 staff rows (form_id = registration form, is_primary=false, primary_attendee_id = org.id, guest_type='exhibitor-staff-pending', payment_amount='PAID EXTERNALLY')
   - Each of the 3 staff receives an invitation email with their claim link
6. Click one staff's claim link → registration form loads in pending-claim mode → Name + Email pre-filled, no RMS field, no ticket section, no Presenting, no Emergency Contact. Country is editable. Terms + Disclaimer still modal-gated.
7. Fill remaining fields → submit → verify row updates with `guest_type='exhibitor-staff-claimed'`; staff receives their personal ticket email; org contact receives a "{staff.name} has completed their registration" notification.
8. On GANSID admin dashboard → new **Exhibitors** tab exists → shows the org row → expand it → 3 staff with correct status badges (2 pending, 1 completed after the claim) + action buttons.
9. **SCAGO regression**: `qreventcheck.netlify.app` → Exhibitors tab should be hidden (no exhibitor forms exist on SCAGO). Sponsor + Hope Gala forms unaffected. Create a sponsor form via the template picker → produces the same result as before.

If any step fails, report specifically which step + what you observed.

---

## Definition of done

- Single migration applied to both Supabase projects; `forms.form_type` accepts `'exhibitor'`
- `ConsentCheckbox` component working on both the exhibitor form AND the upgraded GANSID registration form; fetches markdown at runtime, checkbox gated until modal close
- `PublicExhibitorForm` renders org info + tier + additional m² + staff roster (hard-capped by tier) + consents + submit
- `verify-payment` exhibitor branch: no PayPal, inserts org + N staff rows, fires invitation emails
- `send-ticket-email` has `exhibitor-staff-invite` + `exhibitor-staff-claim-completed` modes
- Staff claim flow: trimmed fields (no presenting, no emergency contact, no ticket/pricing, no RMS, no country-lock), submit flips guest_type + sends ticket + notifies org
- Admin `Exhibitors` tab (visible only when exhibitor forms exist) with expandable rows + per-staff actions
- `buildGansidExhibitor.ts` template seeded on GANSID; Code-of-Conduct field removed from registration form; T&C + Disclaimer fields upgraded to ConsentCheckbox
- Tests + tsc + both builds green (66 tests total)
- SCAGO regression: no Exhibitors tab, sponsor/event flows unchanged

## Not done here (deferred to backlog)

- `<GansidOnly>` / `<ScagoOnly>` wrapper components
- Admin-editable exhibitor tier config in Settings (move from hardcoded)
- Exhibitor-side ticket PDF (org gets no personal ticket; only staff do on claim)
- Markdown parser in the consent modal (plain text is sufficient)
- Editing a submitted exhibitor's staff roster from within the form (use admin dashboard actions)
- Migration of existing sponsor logic to decoupled pattern
