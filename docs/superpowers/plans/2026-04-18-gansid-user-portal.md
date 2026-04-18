# GANSID User Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the user always picks this — don't ask). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GANSID Congress 2026 user portal: site-conditional landing page with sign-up/sign-in, authenticated dashboard with credential QR + announcements, multi-step registration form wrapper, and admin announcements CRUD. Wrap existing registration engine without touching SCAGO behavior.

**Architecture:** Per [spec](../specs/2026-04-18-gansid-user-portal-design.md). Additive throughout: new `profiles` table keyed on `auth.users.id`, nullable `attendees.user_id`, `forms.show_in_portal` flag, `announcements` table. Portal routes register only when `CURRENT_SITE.portalEnabled === true` (GANSID only). Stepped form is a view wrapper (`<SteppedFormShell>`) over the existing `PublicRegistration` field-rendering logic — no engine changes. Viscous Flow design system applied via Tailwind token extension scoped to a `.portal-root` container so admin/public-form styling is unaffected. Two Supabase projects (SCAGO `iigbgbgakevcgilucvbs`, GANSID `gticuvgclbvhwvpzkuez`) — every migration and edge function deploy hits both.

**Tech Stack:** React 19 + TypeScript 5, Vite 7, React Router 7 (HashRouter), Tailwind CSS 3, Supabase (Postgres 17 + Auth + Deno edge functions + Storage), Vitest, jsPDF (existing), html2canvas (new — ~48KB gzipped).

---

## File structure

**Create:**

- `supabase/migrations/20260418000000_add_user_portal_schema.sql` — profiles, attendees.user_id, forms.show_in_portal, announcements, is_portal_admin() function, bootstrap backfill
- `components/Portal/Landing/Landing.tsx` — landing page container
- `components/Portal/Landing/HeroSection.tsx` — Zone 1 hero left column
- `components/Portal/Landing/AuthPanel.tsx` — Zone 1 right column sign-up/sign-in card
- `components/Portal/Landing/InfoTabs.tsx` — Zone 2 tabbed content
- `components/Portal/Landing/content.tsx` — verbatim content from Registration page details.md as JSX constants
- `components/Portal/Dashboard/PortalDashboard.tsx` — authenticated dashboard shell
- `components/Portal/Dashboard/WelcomeBlock.tsx` — dashboard hero
- `components/Portal/Dashboard/CredentialCard.tsx` — QR + role badge (right column)
- `components/Portal/Dashboard/CredentialBadgeModal.tsx` — full-screen badge with Save as Image
- `components/Portal/Dashboard/AvailableFormsGrid.tsx` — portal-enabled forms list
- `components/Portal/Dashboard/AnnouncementsFeed.tsx` — dashboard announcement cards
- `components/Portal/Dashboard/QuickLinks.tsx` — static placeholder quick-links
- `components/Portal/Profile/ProfilePage.tsx` — profile edit view
- `components/Portal/ResetPassword/ResetPasswordPage.tsx` — set-new-password form
- `components/Portal/PortalLayout.tsx` — shared header + avatar dropdown + outlet
- `components/Portal/ui/GlassCard.tsx` — reusable glass surface
- `components/Portal/ui/FloatingToggleTabs.tsx` — Viscous Flow tab component
- `components/Portal/ui/ViscousButton.tsx` — primary gradient + secondary glass variants
- `components/Portal/ui/GlassInput.tsx` — input field
- `components/Portal/ui/GlassSelect.tsx` — select dropdown
- `components/Portal/ui/GlassDialog.tsx` — modal wrapper
- `components/Portal/ui/StepperSidebar.tsx` — vertical step timeline for stepped form
- `components/Portal/ui/OrganicAccordion.tsx` — FAQ accordion
- `components/SteppedRegistration/FormRenderer.tsx` — extracted field-rendering body from PublicRegistration
- `components/SteppedRegistration/SingleFormShell.tsx` — renders all fields at once
- `components/SteppedRegistration/SteppedFormShell.tsx` — renders one step at a time
- `components/SteppedRegistration/steppedValidation.ts` — per-step validation pure helpers
- `components/FormBuilder/StepsManager.tsx` — Steps CRUD UI in form settings
- `components/Settings/AnnouncementsTab.tsx` — admin CRUD for announcements
- `services/profileService.ts` — profile CRUD + bootstrap
- `services/announcementService.ts` — announcement CRUD
- `styles/portal.css` — `.portal-root` base styles, no-line rule enforcement
- `public/fonts-preconnect.html` — fonts preconnect snippet (referenced by index.html)
- `tests/steppedValidation.test.ts` — per-step validation helpers
- `tests/profileService.test.ts` — profile mapper
- `tests/announcementService.test.ts` — announcement mapper
- `tests/siteConfig.test.ts` — portalEnabled site-config presence

**Modify:**

- `types.ts` — add `Profile`, `Announcement`, `FormField.section`, `FormField.sectionOrder`, `FormSettings.renderMode`, `FormSettings.steps`, `Attendee.userId`, `Form.showInPortal`, `SiteConfig.portalEnabled`
- `services/supabaseClient.ts` — no change expected (reuse existing client)
- `services/storageService.ts` — add `getProfilesByUser`, `updateProfile`, `getAttendeesForUser`, mappers for new columns
- `services/database.types.ts` — regenerate or hand-edit to include profiles, announcements, new columns
- `config/sites.ts` — add `portalEnabled: boolean` to type + per-site config
- `components/AuthContext.tsx` — expose `profile` field, fetch on session change, clear stepper localStorage on signOut
- `components/PublicRegistration.tsx` — Phase 0 RMS bug fix; Phase 2 refactor to use `<SingleFormShell>` or `<SteppedFormShell>` based on `form.settings.renderMode`
- `components/FormPreview.tsx` — Phase 0 RMS bug fix mirror
- `components/FormBuilder/index.tsx` — wire StepsManager into form settings panel
- `components/FormBuilder/FieldPropertiesPanel.tsx` — conditional Section dropdown
- `components/FormBuilder/FieldCard.tsx` — show step-assignment pill
- `components/Settings.tsx` — add Announcements tab
- `components/FormsManager.tsx` — add `show_in_portal` toggle per form
- `App.tsx` — site-conditional routing; extend ProtectedRoute with `requireRole` prop
- `supabase/functions/verify-payment/index.ts` — parse auth header, derive user_id, stamp on inserts
- `tailwind.config.js` — extend theme with GANSID tokens
- `index.html` — Google Fonts preconnect for Outfit + DM Sans
- `package.json` — add `html2canvas` dependency
- `tmp/seed-gansid-form-steps.sql` — update GANSID Congress form with step assignments (Phase 6)
- `CLAUDE.md` — new "User Portal" section

**Not modified:**

- Admin dashboard internals (only new announcements tab in Settings)
- Sponsor admin flows
- Exhibitor flow (user has separate follow-up phase for this)
- Scanner, SeatingConfigurator, ManualTicketTool
- Existing migrations
- Pricing engine, group flow, pending-claim logic
- SCAGO-specific branding

---

## Deployment note (referenced throughout)

Every migration must apply to BOTH Supabase projects. Supabase MCP calls:

- SCAGO: `project_id = "iigbgbgakevcgilucvbs"`
- GANSID: `project_id = "gticuvgclbvhwvpzkuez"`

Every `supabase functions deploy` runs twice:

```bash
supabase functions deploy <name> --project-ref iigbgbgakevcgilucvbs
supabase functions deploy <name> --project-ref gticuvgclbvhwvpzkuez
```

---

## Phase 0: Bug fixes (no schema, no feature)

### Task 1: Branch + fix RMS validation bug

**Files:**
- Modify: `components/PublicRegistration.tsx:362-407`
- Modify: `components/FormPreview.tsx` (same validation loop, mirror the fix)
- Create: `tests/rmsValidation.test.ts`

- [ ] **Step 1: Create feature branch**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
git checkout main
git pull
git checkout -b feat/gansid-user-portal
```

- [ ] **Step 2: Write the failing test**

Create `tests/rmsValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FormField } from '../types';
import { validateRequired, validateRms } from '../components/SteppedRegistration/steppedValidation';

describe('RMS field validation', () => {
  it('does NOT require answers[rmsField.id] since its value lives in registrationMode state', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    const answers: Record<string, any> = {};
    const result = validateRequired([rmsField], answers, () => true);
    expect(result.ok).toBe(true);
  });

  it('reports missing RMS selection via validateRms when registrationMode is null', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    const result = validateRms(rmsField, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Registration Type');
  });

  it('passes validateRms when registrationMode is set', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    expect(validateRms(rmsField, 'individual').ok).toBe(true);
    expect(validateRms(rmsField, 'group').ok).toBe(true);
  });
});
```

- [ ] **Step 3: Create the validation helpers file**

Create `components/SteppedRegistration/steppedValidation.ts`:

```ts
import type { FormField } from '../../types';

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

const NON_ANSWER_FIELD_TYPES = new Set([
  'ticket',
  'registration-mode-selector',
]);

export function validateRequired(
  fields: FormField[],
  answers: Record<string, any>,
  isVisible: (f: FormField) => boolean,
): ValidateResult {
  for (const field of fields) {
    if (!isVisible(field)) continue;
    if (!field.required) continue;
    if (NON_ANSWER_FIELD_TYPES.has(field.type as any)) continue;
    if (!answers[field.id]) {
      return { ok: false, error: `Please fill in ${field.label}` };
    }
    if (field.type === 'text' && (field as any).validation === 'int' && answers[field.id]) {
      if (!/^\d+$/.test(answers[field.id])) {
        return { ok: false, error: `${field.label} must be a whole number.` };
      }
    }
  }
  return { ok: true };
}

export function validateRms(
  rmsField: FormField | null,
  registrationMode: 'individual' | 'group' | null,
): ValidateResult {
  if (!rmsField) return { ok: true };
  if (!rmsField.required) return { ok: true };
  if (registrationMode === null) {
    return { ok: false, error: `Please select ${rmsField.label}` };
  }
  return { ok: true };
}

export interface GroupMember {
  name: string;
  email: string;
  countryCode?: string;
  categoryId?: string;
}

export function validateGroupMembers(
  registrationMode: 'individual' | 'group' | null,
  groupMembers: GroupMember[],
  requireCountryAndCategory: boolean,
): ValidateResult {
  if (registrationMode !== 'group') return { ok: true };
  if (groupMembers.length === 0) {
    return { ok: false, error: 'Please add at least one group member.' };
  }
  for (const m of groupMembers) {
    if (!m.name?.trim()) {
      return { ok: false, error: 'Please provide a name for every group member.' };
    }
    if (!m.email?.trim()) {
      return { ok: false, error: 'Please provide an email for every group member.' };
    }
    if (requireCountryAndCategory) {
      if (!m.countryCode) return { ok: false, error: 'Please select a country for every group member.' };
      if (!m.categoryId) return { ok: false, error: 'Please select a category for every group member.' };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the test — should pass**

```bash
npx vitest run tests/rmsValidation.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Wire helpers into PublicRegistration.tsx**

Modify `components/PublicRegistration.tsx`. Replace the `validate()` function (currently lines 362–407):

```tsx
import { validateRequired, validateRms, validateGroupMembers } from './SteppedRegistration/steppedValidation';

// ... inside the component:
const validate = () => {
  if (!form) return false;

  const requiredCheck = validateRequired(form.fields, answers, isVisible);
  if (!requiredCheck.ok) {
    setError(requiredCheck.error!);
    return false;
  }

  const rmsCheck = validateRms(rmsField, registrationMode);
  if (!rmsCheck.ok) {
    setError(rmsCheck.error!);
    return false;
  }

  const groupCheck = validateGroupMembers(
    registrationMode,
    groupMembers,
    Boolean(pricingTemplate),
  );
  if (!groupCheck.ok) {
    setError(groupCheck.error!);
    return false;
  }

  if (mode === 'purchaser') {
    if (ticketField && ticketField.required) {
      const totalQty = Object.values(ticketQuantities).reduce((a: number, b: number) => a + b, 0);
      if (totalQty === 0) {
        setError('Please select at least one ticket.');
        return false;
      }
    }
  } else {
    if (isTableFull) {
      setError('This table is already at full capacity.');
      return false;
    }
    const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
    const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
    if (!nameField || !answers[nameField.id]) {
      setError('Please provide your name.');
      return false;
    }
    if (!emailField || !answers[emailField.id]) {
      setError('Please provide your email address.');
      return false;
    }
  }

  setError('');
  return true;
};
```

- [ ] **Step 6: Mirror fix in FormPreview.tsx**

Open `components/FormPreview.tsx`. Locate the `validate()` function. Apply the same change — import and call the three helpers.

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
```

Open the GANSID Congress form (via admin preview or form URL). Verify:

1. Selecting "Individual" and filling required fields → submit works (no more "Please fill in Registration Type" error).
2. Selecting "Group", filling group member rows, submit works.
3. Not selecting either → error "Please select [RMS label]" fires.

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: all tests pass (including existing ones).

- [ ] **Step 9: Commit**

```bash
git add tests/rmsValidation.test.ts components/SteppedRegistration/steppedValidation.ts components/PublicRegistration.tsx components/FormPreview.tsx
git commit -m "fix: RMS field validation — require registrationMode state, not answers[field.id]

Extract validate() helpers to steppedValidation.ts so they can be
reused by the upcoming stepped-form renderer. RMS and ticket fields
store state outside the answers map and must be excluded from the
generic required-answers check."
```

---

## Phase 1: Schema + types + site config

### Task 2: Write migration SQL + apply to both Supabase projects

**Files:**
- Create: `supabase/migrations/20260418000000_add_user_portal_schema.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260418000000_add_user_portal_schema.sql`:

```sql
-- User portal schema: profiles, attendee linkage, portal-form visibility, announcements.

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'attendee'
    CHECK (role IN ('attendee', 'exhibitor', 'sponsor', 'admin')),
  organization TEXT,
  country_code TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT
  USING (public.is_portal_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'attendee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.attendees ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_attendees_user_id ON public.attendees(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.forms ADD COLUMN show_in_portal BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL CHECK (site IN ('scago', 'gansid')),
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_site_active ON public.announcements(site, is_active, published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_public_read" ON public.announcements FOR SELECT
  USING (is_active = true);
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL
  USING (public.is_portal_admin());

-- Bootstrap: create profile rows for all existing auth.users as admins.
-- Assumption: pre-portal, auth.users is admin-only (EventCheck was admin-only before this migration).
INSERT INTO public.profiles (id, email, full_name, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', ''), 'admin'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply to SCAGO via Supabase MCP**

Call `mcp__claude_ai_Supabase__apply_migration`:
- `project_id`: `iigbgbgakevcgilucvbs`
- `name`: `add_user_portal_schema`
- `query`: contents of the file above

- [ ] **Step 3: Apply to GANSID via Supabase MCP**

Call `mcp__claude_ai_Supabase__apply_migration`:
- `project_id`: `gticuvgclbvhwvpzkuez`
- `name`: `add_user_portal_schema`
- `query`: contents of the file above

- [ ] **Step 4: Verify SCAGO schema**

Call `mcp__claude_ai_Supabase__execute_sql`:
- `project_id`: `iigbgbgakevcgilucvbs`
- `query`: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('profiles','announcements'); SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='attendees' AND column_name='user_id'; SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='forms' AND column_name='show_in_portal';`

Expected: all three rows returned.

- [ ] **Step 5: Verify GANSID schema**

Repeat step 4 with `project_id = gticuvgclbvhwvpzkuez`.

- [ ] **Step 6: Verify bootstrap backfill**

Call `mcp__claude_ai_Supabase__execute_sql` for each project:
- `query`: `SELECT id, email, role FROM profiles WHERE role='admin';`

Expected: all existing admin users show up with role='admin'.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260418000000_add_user_portal_schema.sql
git commit -m "feat(db): add user portal schema — profiles, attendees.user_id, forms.show_in_portal, announcements"
```

### Task 3: Create portal-assets storage bucket on both projects

- [ ] **Step 1: Create bucket on SCAGO**

Via Supabase dashboard (SCAGO project) → Storage → Create bucket:
- Name: `portal-assets`
- Public bucket: yes (public read)

Or via MCP:
Call `mcp__claude_ai_Supabase__execute_sql`:
- `project_id`: `iigbgbgakevcgilucvbs`
- `query`:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('portal-assets', 'portal-assets', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Add storage policies on SCAGO**

```sql
CREATE POLICY "portal_assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'portal-assets');

CREATE POLICY "portal_assets_admin_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'portal-assets' AND public.is_portal_admin());

CREATE POLICY "portal_assets_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'portal-assets' AND public.is_portal_admin());

CREATE POLICY "portal_assets_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'portal-assets' AND public.is_portal_admin());
```

- [ ] **Step 3: Repeat bucket + policies on GANSID**

Same SQL, `project_id = gticuvgclbvhwvpzkuez`.

- [ ] **Step 4: Verify via MCP**

```sql
SELECT id, public FROM storage.buckets WHERE id='portal-assets';
```

Expected on both: one row, `public = true`.

- [ ] **Step 5: No commit needed — bucket state lives in Supabase, not the repo.**

Note in the PR description that bucket creation was done for both projects.

### Task 4: Extend types.ts

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add Profile and Announcement interfaces**

Append to `types.ts`:

```ts
export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: 'attendee' | 'exhibitor' | 'sponsor' | 'admin';
  organization: string | null;
  countryCode: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  site: 'scago' | 'gansid';
  title: string;
  body: string | null;
  imageUrl: string | null;
  isActive: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormStep {
  id: string;
  label: string;
  description?: string;
}
```

- [ ] **Step 2: Extend FormField**

Locate the `FormField` interface. Add:

```ts
  section?: string;        // ID of the step this field belongs to
  sectionOrder?: number;   // Order within the step (falls back to field.order)
```

- [ ] **Step 3: Extend Form.settings**

Locate the `Form` interface's `settings` property. Add:

```ts
  renderMode?: 'single' | 'stepped';  // default 'single'
  steps?: FormStep[];
```

- [ ] **Step 4: Extend Form**

Add top-level field:

```ts
  showInPortal?: boolean;  // default false; controls portal dashboard visibility
```

- [ ] **Step 5: Extend Attendee**

Locate `Attendee` interface. Add:

```ts
  userId?: string | null;
```

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors surface in existing code, they'll be in mappers — that's fine for now, fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add types.ts
git commit -m "feat(types): add Profile, Announcement, FormStep + portal-related field extensions"
```

### Task 5: Extend database.types.ts + storageService mappers

**Files:**
- Modify: `services/database.types.ts`
- Modify: `services/storageService.ts`

- [ ] **Step 1: Update database.types.ts**

Open `services/database.types.ts`. Add to the `public` schema's `Tables`:

```ts
profiles: {
  Row: {
    id: string;
    email: string;
    full_name: string | null;
    role: 'attendee' | 'exhibitor' | 'sponsor' | 'admin';
    organization: string | null;
    country_code: string | null;
    phone: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: Partial<Database['public']['Tables']['profiles']['Row']> & {
    id: string;
    email: string;
  };
  Update: Partial<Database['public']['Tables']['profiles']['Row']>;
  Relationships: [];
};

announcements: {
  Row: {
    id: string;
    site: 'scago' | 'gansid';
    title: string;
    body: string | null;
    image_url: string | null;
    is_active: boolean;
    published_at: string;
    created_at: string;
    updated_at: string;
  };
  Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
  };
  Update: Partial<Database['public']['Tables']['announcements']['Row']>;
  Relationships: [];
};
```

Add columns to existing `attendees` Row: `user_id: string | null`.
Add columns to existing `forms` Row: `show_in_portal: boolean`.

- [ ] **Step 2: Update storageService mappers**

In `services/storageService.ts`, locate `mapAttendeeFromDb`. Add:

```ts
userId: row.user_id ?? null,
```

Locate `mapFormFromDb`. Add:

```ts
showInPortal: row.show_in_portal ?? false,
```

Locate write helpers that build `attendees.Insert` payloads — don't add `user_id` there (it's set by edge functions).

Locate `saveForm` or equivalent. When building the row for upsert, include:

```ts
show_in_portal: form.showInPortal ?? false,
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add services/database.types.ts services/storageService.ts
git commit -m "feat(db-types): map profiles, announcements, attendees.user_id, forms.show_in_portal"
```

### Task 6: Add portalEnabled to sites.ts

**Files:**
- Modify: `config/sites.ts`
- Create: `tests/siteConfig.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/siteConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SITES } from '../config/sites';

describe('portalEnabled site config', () => {
  it('GANSID has portalEnabled = true', () => {
    expect(SITES.gansid.portalEnabled).toBe(true);
  });

  it('SCAGO has portalEnabled = false', () => {
    expect(SITES.scago.portalEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx vitest run tests/siteConfig.test.ts
```

Expected: FAIL (`SITES` not exported, or `portalEnabled` undefined).

- [ ] **Step 3: Update sites.ts**

Open `config/sites.ts`.

1. Add `portalEnabled: boolean` to the `SiteConfig` interface.
2. Set `scago.portalEnabled = false` and `gansid.portalEnabled = true` in the `CONFIGS` map.
3. Export the `CONFIGS` map under the name `SITES`:

```ts
export const SITES = CONFIGS;
```

- [ ] **Step 4: Run — should pass**

```bash
npx vitest run tests/siteConfig.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add config/sites.ts tests/siteConfig.test.ts
git commit -m "feat(sites): add portalEnabled — true on GANSID, false on SCAGO"
```

---

## Phase 2: Stepped form refactor

### Task 7: Extract FormRenderer from PublicRegistration

**Files:**
- Create: `components/SteppedRegistration/FormRenderer.tsx`
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Identify the field-rendering body to extract**

Read `components/PublicRegistration.tsx` lines ~900–1600 (the main form body JSX between the form shell and the payment area). This is the section that iterates `form.fields.map(...)` and renders each field.

- [ ] **Step 2: Create FormRenderer.tsx**

Create `components/SteppedRegistration/FormRenderer.tsx`. The component accepts the same state/setter props as the inner PublicRegistration body, plus a `filteredFields: FormField[]` prop:

```tsx
import type { Form, FormField } from '../../types';

export interface FormRendererProps {
  form: Form;
  filteredFields: FormField[];
  answers: Record<string, any>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  registrationMode: 'individual' | 'group' | null;
  setRegistrationMode: (m: 'individual' | 'group' | null) => void;
  // ... all other state the field renderers need
  isVisible: (f: FormField) => boolean;
  mode: 'purchaser' | 'guest' | 'pending-claim';
  // etc.
}

export function FormRenderer(props: FormRendererProps) {
  // Paste the JSX that currently lives in PublicRegistration between the form opening
  // and the payment section. Replace every `form.fields.map(...)` with
  // `props.filteredFields.map(...)`. Replace all local state references with `props.*`.
  return (
    <>
      {props.filteredFields.map((field) => {
        // ... existing render logic, unchanged
      })}
    </>
  );
}
```

- [ ] **Step 3: Update PublicRegistration to use FormRenderer**

In PublicRegistration, replace the inline field-rendering section with:

```tsx
<FormRenderer
  form={form}
  filteredFields={form.fields}
  answers={answers}
  setAnswers={setAnswers}
  registrationMode={registrationMode}
  setRegistrationMode={setRegistrationMode}
  // ... pass all other state
  isVisible={isVisible}
  mode={mode}
/>
```

- [ ] **Step 4: Build and smoke test**

```bash
npm run build
npm run dev
```

Open the GANSID Congress form and an existing sponsor form. Both should render identically to before — the refactor is pure extraction, no behavior change.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add components/SteppedRegistration/FormRenderer.tsx components/PublicRegistration.tsx
git commit -m "refactor: extract FormRenderer from PublicRegistration

Prep for stepped-form rendering. Accepts filteredFields so it can
render the full form (single mode) or one step at a time (stepped
mode). Pure extraction — no behavior change."
```

### Task 8: Create SingleFormShell wrapper

**Files:**
- Create: `components/SteppedRegistration/SingleFormShell.tsx`
- Modify: `components/PublicRegistration.tsx`

- [ ] **Step 1: Create SingleFormShell**

Create `components/SteppedRegistration/SingleFormShell.tsx`:

```tsx
import { FormRenderer, type FormRendererProps } from './FormRenderer';

export function SingleFormShell(props: Omit<FormRendererProps, 'filteredFields'>) {
  return <FormRenderer {...props} filteredFields={props.form.fields} />;
}
```

- [ ] **Step 2: Update PublicRegistration**

Replace the direct `<FormRenderer ... filteredFields={form.fields} />` call with `<SingleFormShell ... />`. (No logic change, just an intermediate wrapper so SteppedFormShell is a drop-in alternative.)

- [ ] **Step 3: Type check + smoke test**

```bash
npx tsc --noEmit
npm run dev
```

Both forms still render as before.

- [ ] **Step 4: Commit**

```bash
git add components/SteppedRegistration/SingleFormShell.tsx components/PublicRegistration.tsx
git commit -m "feat: SingleFormShell — thin wrapper that will sit alongside SteppedFormShell"
```

### Task 9: Create SteppedFormShell with sidebar + per-step rendering

**Files:**
- Create: `components/SteppedRegistration/SteppedFormShell.tsx`
- Create: `components/Portal/ui/StepperSidebar.tsx`
- Modify: `components/SteppedRegistration/steppedValidation.ts`

- [ ] **Step 1: Add field-grouping helper**

Append to `components/SteppedRegistration/steppedValidation.ts`:

```ts
import type { FormField, FormStep } from '../../types';

export function groupFieldsBySection(
  fields: FormField[],
  steps: FormStep[],
): Record<string, FormField[]> {
  const byStep: Record<string, FormField[]> = {};
  for (const step of steps) byStep[step.id] = [];

  const firstStepId = steps[0]?.id;
  for (const field of fields) {
    const stepId = field.section && byStep[field.section] ? field.section : firstStepId;
    if (!stepId) continue;
    byStep[stepId].push(field);
  }

  for (const stepId of Object.keys(byStep)) {
    byStep[stepId].sort((a, b) => {
      const ao = (a.sectionOrder ?? (a as any).order ?? 0);
      const bo = (b.sectionOrder ?? (b as any).order ?? 0);
      return ao - bo;
    });
  }

  return byStep;
}
```

- [ ] **Step 2: Write test for groupFieldsBySection**

Append to `tests/rmsValidation.test.ts` (or create `tests/steppedFormGrouping.test.ts`):

```ts
import { groupFieldsBySection } from '../components/SteppedRegistration/steppedValidation';

describe('groupFieldsBySection', () => {
  it('groups fields by their section ID', () => {
    const steps = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const fields = [
      { id: 'f1', section: 'a', sectionOrder: 1, label: 'F1', type: 'text', required: false },
      { id: 'f2', section: 'b', sectionOrder: 1, label: 'F2', type: 'text', required: false },
      { id: 'f3', section: 'a', sectionOrder: 2, label: 'F3', type: 'text', required: false },
    ] as any[];
    const result = groupFieldsBySection(fields, steps);
    expect(result.a.map(f => f.id)).toEqual(['f1', 'f3']);
    expect(result.b.map(f => f.id)).toEqual(['f2']);
  });

  it('falls back to first step for fields with no section', () => {
    const steps = [{ id: 'first', label: 'First' }];
    const fields = [{ id: 'f1', label: 'F1', type: 'text', required: false }] as any[];
    expect(groupFieldsBySection(fields, steps).first).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/rmsValidation.test.ts
```

Expected: all pass.

- [ ] **Step 4: Create StepperSidebar UI**

Create `components/Portal/ui/StepperSidebar.tsx`:

```tsx
import type { FormStep } from '../../../types';

interface StepperSidebarProps {
  steps: FormStep[];
  currentIndex: number;
  completedSteps: Set<number>;
  onStepClick?: (index: number) => void;
}

export function StepperSidebar({ steps, currentIndex, completedSteps, onStepClick }: StepperSidebarProps) {
  return (
    <nav className="flex flex-col gap-6 py-4" aria-label="Registration steps">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isComplete = completedSteps.has(i);
        const isReachable = isComplete || i <= currentIndex;
        return (
          <div key={step.id} className="relative flex items-start gap-4">
            <button
              type="button"
              onClick={() => isReachable && onStepClick?.(i)}
              disabled={!isReachable}
              className={[
                'shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-display transition-all duration-300 ease-viscous',
                isCurrent
                  ? 'bg-gansid-secondary text-white shadow-invisible-lift'
                  : isComplete
                  ? 'bg-gansid-primary-container text-white'
                  : 'bg-gansid-surface-container-low text-gansid-on-surface/40',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isComplete ? '✓' : i + 1}
            </button>
            <div className="flex flex-col pt-1">
              <span
                className={[
                  'text-xs uppercase tracking-wide',
                  isCurrent ? 'text-gansid-secondary' : 'text-gansid-on-surface/40',
                ].join(' ')}
              >
                STEP {i + 1}
              </span>
              <span
                className={[
                  'font-display font-semibold',
                  isCurrent ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50',
                ].join(' ')}
              >
                {step.label}
              </span>
              {step.description && isCurrent && (
                <span className="text-sm text-gansid-on-surface/70 mt-1">{step.description}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <span
                className="absolute left-5 top-12 w-px h-12"
                style={{
                  background: isComplete || isCurrent
                    ? 'linear-gradient(to bottom, #2260a1, rgba(34, 96, 161, 0.2))'
                    : 'rgba(26, 28, 28, 0.15)',
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Create SteppedFormShell**

Create `components/SteppedRegistration/SteppedFormShell.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { FormRenderer, type FormRendererProps } from './FormRenderer';
import { StepperSidebar } from '../Portal/ui/StepperSidebar';
import { groupFieldsBySection, validateRequired, validateRms, validateGroupMembers } from './steppedValidation';
import { ViscousButton } from '../Portal/ui/ViscousButton';

interface SteppedFormShellProps extends Omit<FormRendererProps, 'filteredFields'> {
  onSubmit: () => void;
}

export function SteppedFormShell(props: SteppedFormShellProps) {
  const steps = props.form.settings?.steps ?? [];
  const fieldsByStep = useMemo(() => groupFieldsBySection(props.form.fields, steps), [props.form.fields, steps]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepError, setStepError] = useState<string>('');

  const currentStep = steps[currentIndex];
  const currentFields = currentStep ? fieldsByStep[currentStep.id] ?? [] : [];
  const isLastStep = currentIndex === steps.length - 1;
  const isRmsStep = currentFields.some(f => f.type === 'registration-mode-selector');

  const validateCurrentStep = (): boolean => {
    const req = validateRequired(currentFields, props.answers, props.isVisible);
    if (!req.ok) { setStepError(req.error!); return false; }

    if (isRmsStep) {
      const rmsField = currentFields.find(f => f.type === 'registration-mode-selector');
      const rms = validateRms(rmsField ?? null, props.registrationMode);
      if (!rms.ok) { setStepError(rms.error!); return false; }

      const grp = validateGroupMembers(props.registrationMode, (props as any).groupMembers ?? [], true);
      if (!grp.ok) { setStepError(grp.error!); return false; }
    }
    setStepError('');
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setCompletedSteps(prev => new Set(prev).add(currentIndex));
    setCurrentIndex(i => Math.min(i + 1, steps.length - 1));
  };

  const handlePrevious = () => {
    setStepError('');
    setCurrentIndex(i => Math.max(i - 1, 0));
  };

  const handleSubmitClick = () => {
    if (!validateCurrentStep()) return;
    setCompletedSteps(prev => new Set(prev).add(currentIndex));
    props.onSubmit();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
      <aside className="lg:w-64 shrink-0">
        <StepperSidebar
          steps={steps}
          currentIndex={currentIndex}
          completedSteps={completedSteps}
          onStepClick={(i) => setCurrentIndex(i)}
        />
      </aside>
      <div className="flex-1 portal-root">
        <div className="bg-gansid-surface-container-lowest/70 backdrop-blur-viscous rounded-gansid-lg p-8 shadow-invisible-lift">
          <h2 className="font-display text-2xl font-semibold text-gansid-on-surface mb-2">
            {currentStep?.label}
          </h2>
          {currentStep?.description && (
            <p className="text-gansid-on-surface/70 mb-6">{currentStep.description}</p>
          )}
          <FormRenderer {...props} filteredFields={currentFields} />
          {stepError && (
            <p className="mt-4 text-sm text-gansid-primary">{stepError}</p>
          )}
          <div className="flex justify-between items-center mt-8 pt-6">
            <ViscousButton variant="secondary" onClick={handlePrevious} disabled={currentIndex === 0}>
              Previous
            </ViscousButton>
            {isLastStep ? (
              <ViscousButton variant="primary" onClick={handleSubmitClick}>
                Complete Registration
              </ViscousButton>
            ) : (
              <ViscousButton variant="primary" onClick={handleNext}>
                Next Step →
              </ViscousButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire SteppedFormShell into PublicRegistration**

In `components/PublicRegistration.tsx`, replace the `<SingleFormShell ... />` invocation with:

```tsx
{form.settings?.renderMode === 'stepped' && form.settings.steps?.length ? (
  <SteppedFormShell {...allProps} onSubmit={handleSubmitClick} />
) : (
  <SingleFormShell {...allProps} />
)}
```

Where `handleSubmitClick` is the existing submit handler.

- [ ] **Step 7: Skip payment-step issue — flagged**

Note: the payment step (PayPal buttons) is rendered OUTSIDE `<FormRenderer>` in the current PublicRegistration layout. For stepped mode, PayPal buttons need to render on the final step. Check `components/PublicRegistration.tsx` for the PayPal block and confirm it still renders below/after SteppedFormShell on the last step. If it doesn't, move it inside the last step's rendering or pass it via a render prop. Add a TODO comment and address before Phase 6 go-live.

Actually — payment must be gated to the last step. Update SteppedFormShell to accept an optional `finalStepContent?: ReactNode` slot that renders BELOW FormRenderer when `isLastStep`. Pass the PayPal block via that prop.

Update SteppedFormShell:

```tsx
interface SteppedFormShellProps extends Omit<FormRendererProps, 'filteredFields'> {
  onSubmit: () => void;
  finalStepContent?: React.ReactNode;  // PayPal block, etc. — shown only on last step
}

// ... inside the render:
<FormRenderer {...props} filteredFields={currentFields} />
{isLastStep && props.finalStepContent}
```

In PublicRegistration, pass `finalStepContent={<PayPalBlock ... />}`.

- [ ] **Step 8: Smoke test with a hand-crafted stepped form**

Manually via Supabase SQL (or FormBuilder once Task 10 lands) set one test form's `settings.renderMode = 'stepped'` and add 2 steps with field.section assignments. Open it publicly. Verify: stepper sidebar shows; Next/Previous work; validation gates; last step shows submit button.

- [ ] **Step 9: Commit**

```bash
git add components/SteppedRegistration/steppedValidation.ts components/SteppedRegistration/SteppedFormShell.tsx components/Portal/ui/StepperSidebar.tsx components/PublicRegistration.tsx tests/rmsValidation.test.ts
git commit -m "feat: SteppedFormShell — multi-step form wrapper around FormRenderer

Sidebar stepper, per-step validation, final-step payment slot.
Non-stepped forms unchanged — this is opt-in via form.settings.renderMode."
```

### Task 10: Add localStorage persistence + signout cleanup

**Files:**
- Modify: `components/SteppedRegistration/SteppedFormShell.tsx`
- Modify: `components/AuthContext.tsx`

- [ ] **Step 1: Add persistence hook in SteppedFormShell**

At the top of the component:

```tsx
const storageKey = `gansid-portal-stepper:${props.form.id}:${(props as any).user?.id ?? 'anon'}`;

useEffect(() => {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.answers) props.setAnswers(parsed.answers);
      if (typeof parsed.currentIndex === 'number') setCurrentIndex(parsed.currentIndex);
    }
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ answers: props.answers, currentIndex }),
    );
  } catch {}
}, [props.answers, currentIndex, storageKey]);

const clearPersistence = () => {
  try { localStorage.removeItem(storageKey); } catch {}
};
```

On successful submit (i.e., after `onSubmit()` resolves), call `clearPersistence()`. The parent notifies via a callback OR we wrap `props.onSubmit`:

```tsx
const handleSubmitClick = async () => {
  if (!validateCurrentStep()) return;
  setCompletedSteps(prev => new Set(prev).add(currentIndex));
  await props.onSubmit();
  clearPersistence();
};
```

- [ ] **Step 2: Signout sweep in AuthContext**

Open `components/AuthContext.tsx`. In the `signOut` method:

```tsx
const signOut = async () => {
  // Sweep stepper persistence keys
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gansid-portal-stepper:')) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
  await supabase.auth.signOut();
};
```

- [ ] **Step 3: Manual test**

1. Open a stepped form, fill step 1, hit Next.
2. Refresh the page → answers restore, cursor lands on step 2.
3. Submit all the way through → localStorage key cleared.
4. Log out → any remaining `gansid-portal-stepper:*` keys cleared.

- [ ] **Step 4: Commit**

```bash
git add components/SteppedRegistration/SteppedFormShell.tsx components/AuthContext.tsx
git commit -m "feat: persist stepped-form progress in localStorage; sweep on signout"
```

### Task 11: FormBuilder — Steps manager + Section dropdown

**Files:**
- Create: `components/FormBuilder/StepsManager.tsx`
- Modify: `components/FormBuilder/index.tsx`
- Modify: `components/FormBuilder/FieldPropertiesPanel.tsx`
- Modify: `components/FormBuilder/FieldCard.tsx`

- [ ] **Step 1: Create StepsManager**

Create `components/FormBuilder/StepsManager.tsx`:

```tsx
import type { FormStep } from '../../types';

interface StepsManagerProps {
  renderMode: 'single' | 'stepped' | undefined;
  steps: FormStep[];
  onRenderModeChange: (mode: 'single' | 'stepped') => void;
  onStepsChange: (steps: FormStep[]) => void;
}

export function StepsManager({ renderMode, steps, onRenderModeChange, onStepsChange }: StepsManagerProps) {
  const addStep = () => {
    onStepsChange([...steps, { id: `step-${Date.now()}`, label: 'New Step' }]);
  };
  const updateStep = (i: number, patch: Partial<FormStep>) => {
    onStepsChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const removeStep = (i: number) => {
    onStepsChange(steps.filter((_, idx) => idx !== i));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onStepsChange(next);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={renderMode === 'stepped'}
          onChange={(e) => onRenderModeChange(e.target.checked ? 'stepped' : 'single')}
        />
        <span>Render as multi-step form</span>
      </label>
      {renderMode === 'stepped' && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Steps</h4>
            <button type="button" onClick={addStep} className="text-sm text-blue-600">+ Add step</button>
          </div>
          {steps.map((step, i) => (
            <div key={step.id} className="border rounded p-2 flex items-start gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-xs">↑</button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-xs">↓</button>
              </div>
              <div className="flex-1 space-y-1">
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={step.label}
                  onChange={(e) => updateStep(i, { label: e.target.value })}
                  placeholder="Step label"
                />
                <input
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={step.description ?? ''}
                  onChange={(e) => updateStep(i, { description: e.target.value })}
                  placeholder="Description (optional)"
                />
                <div className="text-xs text-slate-500">id: {step.id}</div>
              </div>
              <button type="button" onClick={() => removeStep(i)} className="text-red-600 text-sm">Remove</button>
            </div>
          ))}
          {steps.length === 0 && <p className="text-sm text-slate-500">No steps yet. Add your first step.</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire StepsManager into FormBuilder**

In `components/FormBuilder/index.tsx`, locate the form settings panel (probably a right-hand panel with tabs). Add a new section or tab for "Stepped Registration":

```tsx
<StepsManager
  renderMode={form.settings?.renderMode}
  steps={form.settings?.steps ?? []}
  onRenderModeChange={(mode) => setForm({ ...form, settings: { ...form.settings, renderMode: mode } })}
  onStepsChange={(steps) => setForm({ ...form, settings: { ...form.settings, steps } })}
/>
```

- [ ] **Step 3: Add Section dropdown in FieldPropertiesPanel**

Open `components/FormBuilder/FieldPropertiesPanel.tsx`. Add near the top of the properties list, conditional on stepped mode:

```tsx
{form.settings?.renderMode === 'stepped' && form.settings.steps?.length ? (
  <label className="block">
    <span className="text-sm">Step</span>
    <select
      className="w-full border rounded px-2 py-1"
      value={field.section ?? (form.settings.steps[0]?.id ?? '')}
      onChange={(e) => onFieldChange({ ...field, section: e.target.value })}
    >
      {form.settings.steps.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  </label>
) : null}
```

- [ ] **Step 4: Show step-assignment pill in FieldCard**

Open `components/FormBuilder/FieldCard.tsx`. Add a small pill when the field has a section:

```tsx
{field.section && form.settings?.renderMode === 'stepped' && (
  <span className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
    {form.settings.steps?.find((s) => s.id === field.section)?.label ?? field.section}
  </span>
)}
```

(If `FieldCard` doesn't receive `form`, thread it through as a prop.)

- [ ] **Step 5: Manual test**

1. Create a new form in FormBuilder.
2. Toggle "Render as multi-step form."
3. Add 2 steps.
4. Add some fields and assign them to different steps.
5. Save. Open public form URL — confirm stepper renders with correct field distribution.

- [ ] **Step 6: Commit**

```bash
git add components/FormBuilder/StepsManager.tsx components/FormBuilder/index.tsx components/FormBuilder/FieldPropertiesPanel.tsx components/FormBuilder/FieldCard.tsx
git commit -m "feat(form-builder): StepsManager + per-field Section dropdown + step-assignment pill"
```

### Task 12: Add show_in_portal toggle in FormsManager

**Files:**
- Modify: `components/FormsManager.tsx`

- [ ] **Step 1: Locate the form row / actions area**

Read `components/FormsManager.tsx`. Each form row renders actions (edit, delete, copy URL, etc.).

- [ ] **Step 2: Add toggle**

Add a toggle next to the existing actions:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={form.showInPortal ?? false}
    onChange={async (e) => {
      await updateForm({ ...form, showInPortal: e.target.checked });
    }}
  />
  <span>Show in portal</span>
</label>
```

Where `updateForm` writes to the forms table (existing helper in `storageService.ts`).

- [ ] **Step 3: Manual test**

Toggle it on/off for a form. Reload — value persists.

- [ ] **Step 4: Commit**

```bash
git add components/FormsManager.tsx
git commit -m "feat(forms-manager): show_in_portal toggle per form"
```

---

## Phase 3: Tailwind extension + Portal UI primitives

### Task 13: Extend Tailwind config + fonts

**Files:**
- Modify: `tailwind.config.js`
- Modify: `index.html`
- Create: `styles/portal.css`

- [ ] **Step 1: Extend tailwind.config.js**

Open `tailwind.config.js`. Extend the theme:

```js
module.exports = {
  content: [
    './index.html',
    './**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'gansid-primary': '#ba0028',
        'gansid-primary-container': '#E0243C',
        'gansid-secondary': '#2260a1',
        'gansid-surface': '#f9f9f9',
        'gansid-surface-container-low': '#f3f3f3',
        'gansid-surface-container-lowest': '#FDFDFD',
        'gansid-on-surface': '#1a1c1c',
        'gansid-outline-variant': '#e5bdbc',
      },
      fontFamily: {
        'display': ['Outfit', 'system-ui', 'sans-serif'],
        'body': ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'gansid-md': '1.5rem',
        'gansid-lg': '2rem',
        'gansid-xl': '3rem',
      },
      backdropBlur: {
        'viscous': '24px',
      },
      backgroundImage: {
        'gansid-primary-gradient': 'linear-gradient(135deg, #ba0028, #E0243C)',
      },
      boxShadow: {
        'invisible-lift': '0 0 64px -12px rgba(26, 28, 28, 0.06)',
      },
      transitionTimingFunction: {
        'viscous': 'cubic-bezier(0.8, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Add font preconnects + stylesheets to index.html**

In `index.html`'s `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Create portal.css**

Create `styles/portal.css`:

```css
.portal-root {
  font-family: 'DM Sans', system-ui, sans-serif;
  color: #1a1c1c;
  background: #f9f9f9;
}

.portal-root *,
.portal-root *::before,
.portal-root *::after {
  border-color: transparent;
}

.portal-root h1,
.portal-root h2,
.portal-root h3,
.portal-root h4 {
  font-family: 'Outfit', system-ui, sans-serif;
  letter-spacing: -0.02em;
}

.portal-root .glass {
  background: rgba(253, 253, 253, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

.portal-root .gansid-gradient {
  background: linear-gradient(135deg, #ba0028, #E0243C);
}

@keyframes viscousFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.portal-root .viscous-enter {
  animation: viscousFadeIn 400ms cubic-bezier(0.8, 0, 0.2, 1);
}
```

- [ ] **Step 4: Import portal.css**

In `index.tsx` (or the root entry file), add:

```tsx
import './styles/portal.css';
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Apply `className="portal-root"` to a test div in App.tsx and verify Outfit font loads.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js index.html styles/portal.css index.tsx
git commit -m "feat(styles): Viscous Flow design tokens — Tailwind extension + portal.css + fonts"
```

### Task 14: Portal UI primitives (GlassCard, ViscousButton, inputs, dialog, accordion)

**Files:**
- Create: `components/Portal/ui/GlassCard.tsx`
- Create: `components/Portal/ui/ViscousButton.tsx`
- Create: `components/Portal/ui/GlassInput.tsx`
- Create: `components/Portal/ui/GlassSelect.tsx`
- Create: `components/Portal/ui/GlassDialog.tsx`
- Create: `components/Portal/ui/FloatingToggleTabs.tsx`
- Create: `components/Portal/ui/OrganicAccordion.tsx`

- [ ] **Step 1: GlassCard**

```tsx
// components/Portal/ui/GlassCard.tsx
import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  tint?: 'default' | 'red' | 'blue';
}

export function GlassCard({ children, className = '', tint = 'default' }: GlassCardProps) {
  const tintBg = {
    default: 'bg-gansid-surface-container-lowest/70',
    red: 'bg-gansid-primary-container/10',
    blue: 'bg-gansid-secondary/10',
  }[tint];
  return (
    <div className={`glass ${tintBg} rounded-gansid-lg p-6 shadow-invisible-lift backdrop-blur-viscous ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: ViscousButton**

```tsx
// components/Portal/ui/ViscousButton.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ViscousButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
}

export function ViscousButton({ variant = 'primary', className = '', children, ...rest }: ViscousButtonProps) {
  const base = 'rounded-full px-6 py-3 font-display font-semibold transition-all duration-300 ease-viscous disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? 'bg-gansid-primary-gradient text-white hover:scale-[1.02] shadow-invisible-lift'
    : 'bg-gansid-surface-container-lowest/40 backdrop-blur-viscous text-gansid-secondary hover:bg-gansid-surface-container-lowest/60';
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>;
}
```

- [ ] **Step 3: GlassInput + GlassSelect**

```tsx
// components/Portal/ui/GlassInput.tsx
import type { InputHTMLAttributes } from 'react';

export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      className={`w-full px-4 py-3 rounded-full bg-gansid-surface-container-lowest/60 backdrop-blur-viscous font-body text-gansid-on-surface placeholder:text-gansid-on-surface/40 focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
```

```tsx
// components/Portal/ui/GlassSelect.tsx
import type { SelectHTMLAttributes } from 'react';

export function GlassSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      className={`w-full px-4 py-3 rounded-full bg-gansid-surface-container-lowest/60 backdrop-blur-viscous font-body text-gansid-on-surface focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 ${className}`}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: GlassDialog**

```tsx
// components/Portal/ui/GlassDialog.tsx
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface GlassDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function GlassDialog({ open, onClose, children }: GlassDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 portal-root"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-gansid-on-surface/40 backdrop-blur-md" />
      <div
        className="relative viscous-enter glass rounded-gansid-xl p-8 shadow-invisible-lift max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: FloatingToggleTabs**

```tsx
// components/Portal/ui/FloatingToggleTabs.tsx
interface FloatingToggleTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function FloatingToggleTabs<T extends string>({ tabs, active, onChange }: FloatingToggleTabsProps<T>) {
  return (
    <div className="inline-flex gap-1 bg-gansid-surface-container-low rounded-full p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'px-5 py-2 rounded-full font-display text-sm transition-all duration-300 ease-viscous',
              isActive
                ? 'bg-gansid-surface-container-lowest text-gansid-on-surface shadow-invisible-lift'
                : 'text-gansid-on-surface/60 hover:text-gansid-on-surface',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: OrganicAccordion**

```tsx
// components/Portal/ui/OrganicAccordion.tsx
import { useState, type ReactNode } from 'react';

interface AccordionItemProps {
  question: string;
  children: ReactNode;
}

export function OrganicAccordionItem({ question, children }: AccordionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={[
        'rounded-gansid-xl transition-all duration-400 ease-viscous overflow-hidden',
        open ? 'bg-gansid-surface-container-lowest/70 backdrop-blur-viscous shadow-invisible-lift' : 'bg-gansid-surface-container-low',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between font-display text-left"
      >
        <span>{question}</span>
        <span className={`transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && <div className="px-6 pb-6 text-gansid-on-surface/80 font-body viscous-enter">{children}</div>}
    </div>
  );
}

export function OrganicAccordion({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
```

- [ ] **Step 7: Smoke render check**

Render each component in a scratch page. Verify no console errors.

- [ ] **Step 8: Commit**

```bash
git add components/Portal/ui/
git commit -m "feat(portal-ui): glass primitives — GlassCard, ViscousButton, GlassInput/Select/Dialog, FloatingToggleTabs, OrganicAccordion"
```

---

## Phase 4: Auth context + ProtectedRoute + routing

### Task 15: Extend AuthContext with profile fetch

**Files:**
- Modify: `components/AuthContext.tsx`
- Create: `services/profileService.ts`
- Create: `tests/profileService.test.ts`

- [ ] **Step 1: Create profileService**

Create `services/profileService.ts`:

```ts
import { supabase } from './supabaseClient';
import type { Profile } from '../types';

export function mapProfileFromDb(row: any): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organization: row.organization,
    countryCode: row.country_code,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.error('fetchProfile', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<Profile | null> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if ('fullName' in patch) dbPatch.full_name = patch.fullName;
  if ('role' in patch) dbPatch.role = patch.role;
  if ('organization' in patch) dbPatch.organization = patch.organization;
  if ('countryCode' in patch) dbPatch.country_code = patch.countryCode;
  if ('phone' in patch) dbPatch.phone = patch.phone;
  if ('avatarUrl' in patch) dbPatch.avatar_url = patch.avatarUrl;

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('updateProfile', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}
```

- [ ] **Step 2: Write mapper test**

```ts
// tests/profileService.test.ts
import { describe, it, expect } from 'vitest';
import { mapProfileFromDb } from '../services/profileService';

describe('mapProfileFromDb', () => {
  it('maps snake_case DB columns to camelCase Profile', () => {
    const row = {
      id: 'u-1', email: 'x@y.z', full_name: 'Test', role: 'attendee',
      organization: 'ACME', country_code: 'IN', phone: null,
      avatar_url: null, created_at: 't', updated_at: 't',
    };
    const p = mapProfileFromDb(row);
    expect(p).toEqual({
      id: 'u-1', email: 'x@y.z', fullName: 'Test', role: 'attendee',
      organization: 'ACME', countryCode: 'IN', phone: null,
      avatarUrl: null, createdAt: 't', updatedAt: 't',
    });
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/profileService.test.ts
```

- [ ] **Step 4: Extend AuthContext**

Open `components/AuthContext.tsx`. Add `profile: Profile | null` to the context shape:

```tsx
import type { Profile } from '../types';
import { fetchProfile } from '../services/profileService';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
```

In the provider: add `profile` state, fetch on session change:

```tsx
const [profile, setProfile] = useState<Profile | null>(null);

useEffect(() => {
  if (!session?.user?.id) { setProfile(null); return; }
  fetchProfile(session.user.id).then(setProfile);
}, [session?.user?.id]);

const refreshProfile = async () => {
  if (!session?.user?.id) return;
  const p = await fetchProfile(session.user.id);
  setProfile(p);
};
```

Include `profile`, `refreshProfile` in the provided value.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add services/profileService.ts tests/profileService.test.ts components/AuthContext.tsx
git commit -m "feat(auth): AuthContext exposes profile + refreshProfile; fetches from profiles table on session change"
```

### Task 16: Extend ProtectedRoute with requireRole

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Update ProtectedRoute**

In `App.tsx`, find `ProtectedRoute` (around lines 385–401). Modify:

```tsx
interface ProtectedRouteProps {
  children: React.ReactElement;
  requireRole?: 'admin';
}

function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(CURRENT_SITE.portalEnabled ? '/' : '/login');
      return;
    }
    if (requireRole === 'admin' && profile?.role !== 'admin') {
      navigate(CURRENT_SITE.portalEnabled ? '/portal' : '/');
    }
  }, [user, profile, loading, requireRole, navigate]);

  if (loading) return <div className="p-8 text-center">Loading…</div>;
  if (!user) return null;
  if (requireRole === 'admin' && profile?.role !== 'admin') return null;
  return children;
}
```

- [ ] **Step 2: Apply `requireRole="admin"` to /admin/*)**

In the routes section:

```tsx
<Route path="/admin/*" element={<ProtectedRoute requireRole="admin"><AdminLayout /></ProtectedRoute>} />
```

- [ ] **Step 3: Type check + smoke test**

```bash
npx tsc --noEmit
npm run dev
```

1. Logged-in admin can still reach `/admin`.
2. Logged-out user redirected to `/` (GANSID) or `/login` (SCAGO).
3. Logged-in non-admin (future test case; for now all existing users are admins) redirected to `/portal`.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(auth): ProtectedRoute accepts requireRole prop; /admin gated to role='admin'"
```

### Task 17: Site-conditional routing

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Wrap routes based on portalEnabled**

In `App.tsx`'s route definitions:

```tsx
import { CURRENT_SITE } from './config/sites';
import { Landing } from './components/Portal/Landing/Landing';
import { PortalLayout } from './components/Portal/PortalLayout';
import { PortalDashboard } from './components/Portal/Dashboard/PortalDashboard';
import { ProfilePage } from './components/Portal/Profile/ProfilePage';
import { ResetPasswordPage } from './components/Portal/ResetPassword/ResetPasswordPage';

<Routes>
  {CURRENT_SITE.portalEnabled ? (
    <>
      <Route path="/" element={<Landing />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/portal" element={<ProtectedRoute><PortalLayout /></ProtectedRoute>}>
        <Route index element={<PortalDashboard />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </>
  ) : (
    <Route path="/" element={<Navigate to="/admin" replace />} />
  )}

  <Route path="/login" element={<Login />} />
  <Route path="/form/:formId" element={<PublicRegistration />} />
  <Route path="/admin/*" element={<ProtectedRoute requireRole="admin"><AdminLayout /></ProtectedRoute>} />
</Routes>
```

- [ ] **Step 2: Create placeholder Landing + dashboard + profile + reset-password**

For now, each component returns a simple placeholder:

```tsx
// components/Portal/Landing/Landing.tsx
export function Landing() { return <div className="p-8 portal-root">Landing (Phase 5)</div>; }
```

Same pattern for `PortalLayout`, `PortalDashboard`, `ProfilePage`, `ResetPasswordPage`. Later tasks flesh them out.

- [ ] **Step 3: Build + smoke test**

```bash
VITE_SITE=gansid npm run dev
```

Visit `http://localhost:3000/#/` → Landing placeholder renders.

```bash
VITE_SITE=scago npm run dev
```

Visit root → redirects to /admin (unchanged behavior).

- [ ] **Step 4: Commit**

```bash
git add App.tsx components/Portal/Landing/Landing.tsx components/Portal/PortalLayout.tsx components/Portal/Dashboard/PortalDashboard.tsx components/Portal/Profile/ProfilePage.tsx components/Portal/ResetPassword/ResetPasswordPage.tsx
git commit -m "feat(routing): site-conditional routes — GANSID portal front door, SCAGO unchanged"
```

---

## Phase 5: Landing page content

### Task 18: Landing content constants

**Files:**
- Create: `components/Portal/Landing/content.tsx`

- [ ] **Step 1: Extract verbatim content**

Create `components/Portal/Landing/content.tsx` with the Registration page details.md content as typed constants:

```tsx
export const HERO = {
  badge: 'Registration is open now!',
  location: 'Hyderabad, India',
  dates: 'October 23–25, 2026',
  venue: 'HITEX Exhibition Centre',
  intro: 'We are pleased to announce that registration for the GANSID Congress 2026 is now open. We invite you to join us from October 23–25, 2026 in the wonderful city of Hyderabad, India! This event is the first in-person Congress of the GANSID after the successes of our previous virtual conferences. We look forward to three days of knowledge-sharing, innovation, and ongoing advocacy with the brightest minds and organizations in the inherited blood disorders community worldwide.',
  ctaLabel: 'Register Now!',
};

export const REGISTRATION_PROCESS = [
  {
    number: '01',
    title: 'Account Setup',
    body: 'Create your user account to access the Congress portal and registration form.',
  },
  {
    number: '02',
    title: 'Details & Tier',
    body: 'Complete the registration form with your personal and professional details. Your tier is resolved by country.',
  },
  {
    number: '03',
    title: 'Finalize',
    body: 'Submit your payment details. Your information is not saved if you exit before completion — complete in one sitting.',
  },
];

export const IMPORTANT_NOTICE = 'Before you start completing the registration form, kindly ensure that you have readily available your relevant card, bank transfer, and billing details. Our system does not save your information if you exit the registration form before completion, so we recommend completing your registration in one sitting.';

export const GROUP_NOTE = 'Group Registration: Corporations and organizations may register 5 or more participants at a time. All registration information will be sent to the group contact person only, who will then be responsible for the distribution of information to each group member. No documentation will be sent directly to the group participants (unless specifically requested).';

export const INCLUDES = [
  'Full access to all scientific and educational sessions',
  'Entry to the exhibit hall during official hours',
  'Participation in poster networking sessions',
  'Access to supported symposia and presentation theatres',
  'Daily refreshments throughout the Congress',
  'Access to CME Credits',
];

export const NOT_INCLUDED = [
  'Access to the networking reception (requires an additional USD $50). The GANSID Networking Evening will take place separately from the GANSID Congress 2026. This event provides an opportunity for attendees to network with colleagues.',
];

export const FEES = {
  note: 'All prices are in USD; you will be able to pay with your local currency.',
  periods: [
    { id: 'early', label: 'Early Bird', subtitle: 'Ends June 30, 2026' },
    { id: 'regular', label: 'Regular', subtitle: 'July 1 – September 15, 2026' },
    { id: 'onsite', label: 'On-site', subtitle: 'September 16 – October 25, 2026' },
  ],
  tiers: [
    {
      id: 'tier1',
      label: 'Tier 1',
      subtitle: 'Asia, Africa, South America, Central America, Mexico',
      rows: [
        { category: 'Physicians / Researchers', early: 175, regular: 200, onsite: 250 },
        { category: 'Medical Trainees (Residents, Fellows)', early: 150, regular: 175, onsite: 200 },
        { category: 'Undergraduate, Medical, Graduate Students', early: 50, regular: 75, onsite: 100 },
        { category: 'Nurses or Allied Health Professionals', early: 100, regular: 125, onsite: 150 },
        { category: 'Industry Partners', early: 250, regular: 300, onsite: 350 },
        { category: 'Patient Organizations', early: 50, regular: 75, onsite: 100 },
        { category: 'Patients or Family Members', early: 25, regular: 40, onsite: 50 },
      ],
    },
    {
      id: 'tier2',
      label: 'Tier 2',
      subtitle: 'United States, Canada, Europe, Australia, New Zealand',
      rows: [
        { category: 'Physicians / Researchers', early: 250, regular: 300, onsite: 400 },
        { category: 'Medical Trainees (Residents, Fellows)', early: 200, regular: 250, onsite: 275 },
        { category: 'Undergraduate, Medical, Graduate Students', early: 75, regular: 100, onsite: 125 },
        { category: 'Nurses or Allied Health Professionals', early: 150, regular: 200, onsite: 250 },
        { category: 'Industry Partners', early: 300, regular: 350, onsite: 450 },
        { category: 'Patient Organizations', early: 75, regular: 100, onsite: 125 },
        { category: 'Patients or Family Members', early: 35, regular: 50, onsite: 60 },
      ],
    },
  ],
};

export const FAQS = [
  {
    q: 'What happens if I need to cancel my registration?',
    a: 'Due to the administrative expenses to organize registration, we can provide a 50% refund on your registration fee if you cancel before September 23, 2026. There will be no refunds after this date.',
  },
  {
    q: 'Where can I find housing or accommodations for the Congress?',
    a: 'A list of hotels available in the area will be provided on the Congress portal as the event approaches.',
  },
  {
    q: 'Is there an option to attend virtually?',
    a: 'The GANSID Congress 2026 is an in-person event. There will be no virtual options this year.',
  },
  {
    q: 'Which meals will be provided by the conference?',
    a: 'The conference will provide lunch during all 3 days of the conference alongside coffee, tea, and other refreshments. An optional Networking Reception dinner will be held, with a ticket price of $50 USD.',
  },
];

export const SUPPORT_EMAIL = 'congress@inheritedblooddisorders.world';
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/Landing/content.tsx
git commit -m "feat(landing): verbatim content constants from Registration page details.md"
```

### Task 19: HeroSection + AuthPanel + Landing composition

**Files:**
- Create: `components/Portal/Landing/HeroSection.tsx`
- Create: `components/Portal/Landing/AuthPanel.tsx`
- Modify: `components/Portal/Landing/Landing.tsx`

- [ ] **Step 1: HeroSection**

```tsx
// components/Portal/Landing/HeroSection.tsx
import { HERO } from './content';

export function HeroSection() {
  return (
    <div className="space-y-6">
      <img
        src="/branding/gansid/portal-hero.jpg"
        alt=""
        className="w-full rounded-gansid-lg object-cover aspect-[4/3] shadow-invisible-lift"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div>
        <span className="inline-block px-4 py-2 rounded-full bg-gansid-primary-gradient text-white text-sm font-display">
          {HERO.badge}
        </span>
      </div>
      <h1 className="font-display text-5xl md:text-6xl font-bold text-gansid-on-surface leading-tight tracking-tight">
        {HERO.location}
      </h1>
      <p className="font-display text-xl text-gansid-secondary">
        {HERO.dates} • {HERO.venue}
      </p>
      <p className="font-body text-gansid-on-surface/80 text-lg leading-relaxed max-w-xl">
        {HERO.intro}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: AuthPanel with sign-up / sign-in tabs**

```tsx
// components/Portal/Landing/AuthPanel.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { GlassCard } from '../ui/GlassCard';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassInput } from '../ui/GlassInput';
import { ViscousButton } from '../ui/ViscousButton';

type Mode = 'signup' | 'signin';

export function AuthPanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'attendee' | 'exhibitor' | 'sponsor'>('attendee');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSignupSuccess(true);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate('/portal');
  };

  return (
    <GlassCard className="w-full max-w-md sticky top-8">
      <div className="flex justify-center mb-6">
        <FloatingToggleTabs
          tabs={[{ id: 'signup', label: 'Sign Up' }, { id: 'signin', label: 'Sign In' }]}
          active={mode}
          onChange={(id) => { setMode(id); setError(''); setSignupSuccess(false); }}
        />
      </div>

      {signupSuccess ? (
        <div className="space-y-4 text-center">
          <h3 className="font-display text-2xl">Check your email</h3>
          <p className="font-body text-gansid-on-surface/70">
            We've sent a verification link to <strong>{email}</strong>. Click it to complete your registration.
          </p>
        </div>
      ) : mode === 'signup' ? (
        <form onSubmit={handleSignup} className="space-y-4">
          <GlassInput placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <GlassInput type="password" placeholder="Password (min 8 chars)" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
          <div>
            <label className="block text-sm font-display mb-2">I am a…</label>
            <div className="flex gap-2">
              {(['attendee', 'exhibitor', 'sponsor'] as const).map((r) => (
                <label key={r} className="flex-1">
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only peer" />
                  <span className="block text-center px-3 py-2 rounded-full border-2 border-transparent bg-gansid-surface-container-low cursor-pointer peer-checked:bg-gansid-primary-gradient peer-checked:text-white font-display text-sm capitalize">
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account'}
          </ViscousButton>
        </form>
      ) : (
        <form onSubmit={handleSignin} className="space-y-4">
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <GlassInput type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={async () => {
                if (!email) { setError('Enter your email first'); return; }
                const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/#/reset-password`,
                });
                if (err) setError(err.message); else setError('Password reset email sent.');
              }}
              className="text-sm text-gansid-secondary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </ViscousButton>
        </form>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 3: Compose Landing**

Replace `components/Portal/Landing/Landing.tsx`:

```tsx
import { HeroSection } from './HeroSection';
import { AuthPanel } from './AuthPanel';
import { InfoTabs } from './InfoTabs';

export function Landing() {
  return (
    <div className="portal-root min-h-screen bg-gansid-surface">
      <section className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10">
        <HeroSection />
        <div>
          <AuthPanel />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-6 py-16">
        <InfoTabs />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test (InfoTabs stub)**

Add a temporary stub for InfoTabs to unblock build:

```tsx
// components/Portal/Landing/InfoTabs.tsx
export function InfoTabs() { return <div>InfoTabs (Task 20)</div>; }
```

```bash
npm run dev
```

Visit `/` → see hero + auth panel. Submit signup with a test email → verification flow.

- [ ] **Step 5: Commit**

```bash
git add components/Portal/Landing/HeroSection.tsx components/Portal/Landing/AuthPanel.tsx components/Portal/Landing/Landing.tsx components/Portal/Landing/InfoTabs.tsx
git commit -m "feat(landing): Zone 1 — HeroSection + AuthPanel with sign-up/sign-in tab toggle"
```

### Task 20: InfoTabs (Zone 2) with 4 tabs

**Files:**
- Modify: `components/Portal/Landing/InfoTabs.tsx`

- [ ] **Step 1: Implement InfoTabs**

```tsx
// components/Portal/Landing/InfoTabs.tsx
import { useState } from 'react';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassCard } from '../ui/GlassCard';
import { OrganicAccordion, OrganicAccordionItem } from '../ui/OrganicAccordion';
import { REGISTRATION_PROCESS, IMPORTANT_NOTICE, GROUP_NOTE, INCLUDES, NOT_INCLUDED, FEES, FAQS, SUPPORT_EMAIL } from './content';

type TabId = 'about' | 'includes' | 'fees' | 'faqs';

export function InfoTabs() {
  const [tab, setTab] = useState<TabId>('about');
  const [feeTier, setFeeTier] = useState<'tier1' | 'tier2'>('tier1');
  const activeTier = FEES.tiers.find((t) => t.id === feeTier)!;

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <FloatingToggleTabs<TabId>
          tabs={[
            { id: 'about', label: 'About & Process' },
            { id: 'includes', label: "What's Included" },
            { id: 'fees', label: 'Conference Fees' },
            { id: 'faqs', label: 'FAQs' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'about' && (
        <div className="space-y-8 viscous-enter">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {REGISTRATION_PROCESS.map((step) => (
              <GlassCard key={step.number}>
                <div className="font-display text-5xl text-gansid-primary-container font-bold">{step.number}</div>
                <h3 className="font-display text-xl font-semibold mt-3">{step.title}</h3>
                <p className="font-body text-gansid-on-surface/80 mt-2">{step.body}</p>
              </GlassCard>
            ))}
          </div>
          <GlassCard tint="red">
            <h4 className="font-display font-semibold mb-2">⚠ Important Notice</h4>
            <p className="font-body text-gansid-on-surface/80">{IMPORTANT_NOTICE}</p>
          </GlassCard>
          <GlassCard tint="blue">
            <h4 className="font-display font-semibold mb-2">Group Registration</h4>
            <p className="font-body text-gansid-on-surface/80">{GROUP_NOTE}</p>
          </GlassCard>
        </div>
      )}

      {tab === 'includes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 viscous-enter">
          <GlassCard tint="blue">
            <h3 className="font-display text-2xl font-semibold mb-4">Registration Includes</h3>
            <ul className="space-y-2">
              {INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-secondary">✓</span>
                  <span className="font-body">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard tint="red">
            <h3 className="font-display text-2xl font-semibold mb-4">Not Included</h3>
            <ul className="space-y-2">
              {NOT_INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-primary-container">✕</span>
                  <span className="font-body">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      )}

      {tab === 'fees' && (
        <div className="viscous-enter space-y-6">
          <p className="text-center font-body text-gansid-on-surface/80">{FEES.note}</p>
          <div className="flex justify-center">
            <FloatingToggleTabs<'tier1' | 'tier2'>
              tabs={[
                { id: 'tier1', label: FEES.tiers[0].label },
                { id: 'tier2', label: FEES.tiers[1].label },
              ]}
              active={feeTier}
              onChange={setFeeTier}
            />
          </div>
          <p className="text-center font-body text-sm text-gansid-on-surface/60">{activeTier.subtitle}</p>
          <GlassCard className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="font-display">
                  <th className="text-left py-3">Category</th>
                  {FEES.periods.map((p) => (
                    <th key={p.id} className="text-right py-3">
                      <div>{p.label}</div>
                      <div className="text-xs text-gansid-on-surface/50 font-normal">{p.subtitle}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTier.rows.map((row, i) => (
                  <tr
                    key={row.category}
                    className={i % 2 === 0 ? 'bg-gansid-surface-container-low/40' : ''}
                  >
                    <td className="py-3 font-body">{row.category}</td>
                    <td className="py-3 text-right font-display text-gansid-primary-container">${row.early}</td>
                    <td className="py-3 text-right font-display">${row.regular}</td>
                    <td className="py-3 text-right font-display">${row.onsite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}

      {tab === 'faqs' && (
        <OrganicAccordion>
          {FAQS.map((faq) => (
            <OrganicAccordionItem key={faq.q} question={faq.q}>
              <p className="mt-2">{faq.a}</p>
            </OrganicAccordionItem>
          ))}
          <GlassCard>
            <p className="font-body">
              Questions? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gansid-secondary hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </GlassCard>
        </OrganicAccordion>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Visit `/`. All four tabs render with correct content. Tier toggle works on Fees. FAQ items expand.

- [ ] **Step 3: Commit**

```bash
git add components/Portal/Landing/InfoTabs.tsx
git commit -m "feat(landing): Zone 2 InfoTabs — About, Includes, Fees (tier toggle), FAQs"
```

---

## Phase 6: Dashboard + profile + reset-password

### Task 21: PortalLayout with avatar dropdown

**Files:**
- Modify: `components/Portal/PortalLayout.tsx`

- [ ] **Step 1: Implement PortalLayout**

```tsx
// components/Portal/PortalLayout.tsx
import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export function PortalLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (profile?.fullName ?? profile?.email ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="portal-root min-h-screen bg-gansid-surface">
      <header className="bg-gansid-surface-container-lowest/80 backdrop-blur-viscous sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <Link to="/portal" className="font-display font-bold text-lg">GANSID Portal</Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="h-10 w-10 rounded-full bg-gansid-primary-gradient text-white font-display flex items-center justify-center"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 glass rounded-gansid-lg p-2 min-w-[200px] shadow-invisible-lift">
              <Link to="/portal/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">Profile</Link>
              {profile?.role === 'admin' && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">Admin Dashboard</Link>
              )}
              <button
                type="button"
                onClick={async () => { await signOut(); navigate('/'); }}
                className="block w-full text-left px-3 py-2 hover:bg-gansid-surface-container-low rounded text-gansid-primary"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/PortalLayout.tsx
git commit -m "feat(portal): PortalLayout with avatar dropdown (Profile, Admin if role=admin, Sign Out)"
```

### Task 22: PortalDashboard shell + welcome + available forms + quick links

**Files:**
- Modify: `components/Portal/Dashboard/PortalDashboard.tsx`
- Create: `components/Portal/Dashboard/WelcomeBlock.tsx`
- Create: `components/Portal/Dashboard/AvailableFormsGrid.tsx`
- Create: `components/Portal/Dashboard/QuickLinks.tsx`
- Modify: `services/storageService.ts`

- [ ] **Step 1: Add getAttendeesForUser helper**

In `services/storageService.ts`:

```ts
export async function getAttendeesForUser(userId: string, email: string): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from('attendees')
    .select('*')
    .or(`user_id.eq.${userId},email.eq.${email}`)
    .order('created_at', { ascending: false });
  if (error) { console.error('getAttendeesForUser', error); return []; }
  return (data ?? []).map(mapAttendeeFromDb);
}

export async function getPortalForms(): Promise<Form[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('show_in_portal', true)
    .eq('is_active', true);
  if (error) { console.error('getPortalForms', error); return []; }
  return (data ?? []).map(mapFormFromDb);
}
```

- [ ] **Step 2: WelcomeBlock**

```tsx
// components/Portal/Dashboard/WelcomeBlock.tsx
import type { Profile, Attendee } from '../../../types';

interface Props {
  profile: Profile;
  latestAttendee: Attendee | null;
}

export function WelcomeBlock({ profile, latestAttendee }: Props) {
  const firstName = (profile.fullName ?? profile.email).split(' ')[0];
  const subhead = !latestAttendee
    ? 'Complete your Congress registration to receive your credential.'
    : latestAttendee.paymentStatus === 'paid'
    ? 'Your GANSID 2026 credential is ready.'
    : 'Awaiting payment confirmation for your Congress registration.';

  return (
    <div>
      <h1 className="font-display font-bold text-5xl leading-tight">
        Welcome back,
        <br />
        <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">{firstName}</span>
      </h1>
      <p className="font-body text-gansid-on-surface/70 mt-3 text-lg">{subhead}</p>
    </div>
  );
}
```

- [ ] **Step 3: AvailableFormsGrid**

```tsx
// components/Portal/Dashboard/AvailableFormsGrid.tsx
import type { Form, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { Link } from 'react-router-dom';

interface Props {
  forms: Form[];
  userAttendees: Attendee[];
  roleOrder: 'attendee' | 'exhibitor' | 'sponsor';
}

export function AvailableFormsGrid({ forms, userAttendees, roleOrder }: Props) {
  const sorted = [...forms].sort((a, b) => {
    const aMatches = (a as any).formType === roleOrder ? 1 : 0;
    const bMatches = (b as any).formType === roleOrder ? 1 : 0;
    return bMatches - aMatches;
  });

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Available Forms</h2>
      {sorted.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">No forms available yet.</p>
        </GlassCard>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((form) => {
          const registered = userAttendees.some((a) => a.formId === form.id);
          return (
            <GlassCard key={form.id}>
              <h3 className="font-display text-lg font-semibold">{form.name}</h3>
              <p className="font-body text-gansid-on-surface/70 text-sm mt-1 mb-4">{(form as any).description ?? ''}</p>
              <Link to={`/form/${form.id}`}>
                <ViscousButton variant={registered ? 'secondary' : 'primary'}>
                  {registered ? 'View Registration' : 'Start Registration'}
                </ViscousButton>
              </Link>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: QuickLinks placeholder**

```tsx
// components/Portal/Dashboard/QuickLinks.tsx
import { GlassCard } from '../ui/GlassCard';

const LINKS = [
  { label: 'Full Itinerary', icon: '📅' },
  { label: 'Congress Materials', icon: '📁' },
  { label: 'Venue Info', icon: '📍' },
];

export function QuickLinks() {
  return (
    <section>
      <h3 className="font-display text-xs uppercase tracking-wide text-gansid-on-surface/40 mb-3">Quick Links</h3>
      <div className="space-y-2">
        {LINKS.map((link) => (
          <GlassCard key={link.label} className="flex items-center gap-3 cursor-default opacity-60">
            <span>{link.icon}</span>
            <span className="font-body">{link.label}</span>
            <span className="ml-auto text-xs text-gansid-on-surface/30">Coming soon</span>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: PortalDashboard composition**

```tsx
// components/Portal/Dashboard/PortalDashboard.tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { getAttendeesForUser, getPortalForms } from '../../../services/storageService';
import type { Attendee, Form } from '../../../types';
import { WelcomeBlock } from './WelcomeBlock';
import { AvailableFormsGrid } from './AvailableFormsGrid';
import { CredentialCard } from './CredentialCard';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { QuickLinks } from './QuickLinks';

export function PortalDashboard() {
  const { profile, user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);

  useEffect(() => {
    if (!user || !profile) return;
    getAttendeesForUser(user.id, user.email!).then(setAttendees);
    getPortalForms().then(setForms);
  }, [user, profile]);

  if (!profile || !user) return null;

  const latestPaidAttendee = attendees.find((a) => a.paymentStatus === 'paid') ?? null;
  const latestAttendee = attendees[0] ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-8">
      <div className="space-y-8">
        <WelcomeBlock profile={profile} latestAttendee={latestAttendee} />
        <AvailableFormsGrid forms={forms} userAttendees={attendees} roleOrder={profile.role === 'admin' ? 'attendee' : (profile.role as any)} />
        <AnnouncementsFeed />
      </div>
      <aside className="space-y-6">
        <CredentialCard profile={profile} attendee={latestPaidAttendee} />
        <QuickLinks />
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/Portal/Dashboard/ services/storageService.ts
git commit -m "feat(portal): dashboard shell — WelcomeBlock, AvailableFormsGrid, QuickLinks"
```

### Task 23: CredentialCard + CredentialBadgeModal with html2canvas

**Files:**
- Modify: `package.json`
- Create: `components/Portal/Dashboard/CredentialCard.tsx`
- Create: `components/Portal/Dashboard/CredentialBadgeModal.tsx`

- [ ] **Step 1: Install html2canvas**

```bash
npm install html2canvas
```

- [ ] **Step 2: CredentialCard**

```tsx
// components/Portal/Dashboard/CredentialCard.tsx
import { useState } from 'react';
import type { Profile, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { CredentialBadgeModal } from './CredentialBadgeModal';
import { Link } from 'react-router-dom';

interface Props { profile: Profile; attendee: Attendee | null; }

export function CredentialCard({ profile, attendee }: Props) {
  const [open, setOpen] = useState(false);
  const initials = (profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor' : profile.role === 'sponsor' ? 'Sponsor' : 'Delegate';

  if (!attendee) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="font-display text-sm uppercase tracking-wider text-gansid-on-surface/50">GANSID '26</div>
          <div className="h-24 w-24 rounded-full bg-gansid-surface-container-low flex items-center justify-center font-display text-2xl text-gansid-on-surface/40">
            {initials}
          </div>
          <p className="font-body text-gansid-on-surface/70 text-sm">No credential yet.</p>
          <Link to="/form/gansid-congress-2026">
            <ViscousButton variant="primary">Register for Congress</ViscousButton>
          </Link>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard>
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-display text-sm uppercase tracking-wider text-gansid-on-surface/50">GANSID '26</span>
            <span className="px-3 py-1 text-xs rounded-full bg-gansid-primary-container/20 text-gansid-primary font-display uppercase tracking-wide">{roleBadge}</span>
          </div>
          <div className="h-24 w-24 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-2xl">
            {initials}
          </div>
          <div>
            <div className="font-display text-xl font-semibold">{profile.fullName}</div>
            <div className="font-body text-sm text-gansid-on-surface/70">{profile.organization}</div>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="mt-2">
            <img
              alt="Credential QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent((attendee as any).qrPayload ?? attendee.id)}`}
              className="rounded-lg"
            />
          </button>
          <p className="font-body text-xs text-gansid-on-surface/50">Click to enlarge</p>
        </div>
      </GlassCard>
      <CredentialBadgeModal open={open} onClose={() => setOpen(false)} profile={profile} attendee={attendee} />
    </>
  );
}
```

- [ ] **Step 3: CredentialBadgeModal**

```tsx
// components/Portal/Dashboard/CredentialBadgeModal.tsx
import { useRef } from 'react';
import html2canvas from 'html2canvas';
import type { Profile, Attendee } from '../../../types';
import { GlassDialog } from '../ui/GlassDialog';
import { ViscousButton } from '../ui/ViscousButton';

interface Props {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  attendee: Attendee;
}

export function CredentialBadgeModal({ open, onClose, profile, attendee }: Props) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const roleBadge = profile.role === 'exhibitor' ? 'Exhibitor' : profile.role === 'sponsor' ? 'Sponsor' : 'Delegate';

  const handleSave = async () => {
    if (!badgeRef.current) return;
    const canvas = await html2canvas(badgeRef.current, { backgroundColor: '#FDFDFD', scale: 2 });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GANSID-2026-Credential-${(profile.fullName ?? 'user').replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <GlassDialog open={open} onClose={onClose}>
      <div ref={badgeRef} className="bg-white rounded-gansid-xl overflow-hidden">
        <div className="h-20 bg-gansid-primary-gradient flex items-center justify-center">
          <span className="text-white font-display text-2xl tracking-wider">GANSID 2026</span>
        </div>
        <div className="p-8 flex flex-col items-center space-y-4">
          <div className="h-28 w-28 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-3xl">
            {(profile.fullName ?? 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="text-center">
            <div className="font-display text-2xl font-bold">{profile.fullName}</div>
            <div className="font-body text-gansid-on-surface/70">{profile.organization}</div>
            <div className="font-body text-sm text-gansid-on-surface/50">{profile.countryCode ?? ''}</div>
          </div>
          <span className="px-4 py-1 rounded-full bg-gansid-primary-container/20 text-gansid-primary font-display uppercase tracking-wide text-sm">{roleBadge}</span>
          <img
            alt="QR"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent((attendee as any).qrPayload ?? attendee.id)}`}
          />
          <p className="font-body text-xs text-gansid-on-surface/50 text-center">Present this QR at the Congress entrance.</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-6">
        <ViscousButton variant="secondary" onClick={onClose}>Close</ViscousButton>
        <ViscousButton variant="primary" onClick={handleSave}>Save as Image</ViscousButton>
      </div>
    </GlassDialog>
  );
}
```

- [ ] **Step 4: Smoke test**

Log in with a test user who has a paid attendee row. Click the QR → modal opens → Save as Image downloads PNG.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components/Portal/Dashboard/CredentialCard.tsx components/Portal/Dashboard/CredentialBadgeModal.tsx
git commit -m "feat(portal): CredentialCard + full-screen badge modal with html2canvas Save as Image"
```

### Task 24: ProfilePage — edit profile fields

**Files:**
- Modify: `components/Portal/Profile/ProfilePage.tsx`
- Modify: `services/profileService.ts` (already has updateProfile)

- [ ] **Step 1: Implement ProfilePage**

```tsx
// components/Portal/Profile/ProfilePage.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { updateProfile } from '../../../services/profileService';
import { COUNTRIES } from '../../../utils/countries';
import { GlassCard } from '../ui/GlassCard';
import { GlassInput } from '../ui/GlassInput';
import { GlassSelect } from '../ui/GlassSelect';
import { ViscousButton } from '../ui/ViscousButton';

export function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setOrganization(profile.organization ?? '');
    setCountryCode(profile.countryCode ?? '');
    setPhone(profile.phone ?? '');
  }, [profile]);

  if (!profile || !user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile(user.id, { fullName, organization, countryCode, phone });
    await refreshProfile();
    setSaving(false);
    setToast('Profile saved.');
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-6">Profile</h1>
      <GlassCard>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-display mb-1">Full Name</label>
            <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Email</label>
            <GlassInput value={profile.email} disabled />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Organization</label>
            <GlassInput value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Country</label>
            <GlassSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="">Select a country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </GlassSelect>
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Phone</label>
            <GlassInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Role</label>
            <div className="font-body text-gansid-on-surface/80">{profile.role}</div>
            <p className="text-xs text-gansid-on-surface/50 mt-1">Contact support to change your role.</p>
          </div>
          {toast && <p className="text-sm text-gansid-secondary">{toast}</p>}
          <ViscousButton type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </ViscousButton>
        </form>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/Profile/ProfilePage.tsx
git commit -m "feat(portal): ProfilePage — edit full name, organization, country, phone"
```

### Task 25: ResetPasswordPage

**Files:**
- Modify: `components/Portal/ResetPassword/ResetPasswordPage.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/Portal/ResetPassword/ResetPasswordPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { GlassCard } from '../ui/GlassCard';
import { GlassInput } from '../ui/GlassInput';
import { ViscousButton } from '../ui/ViscousButton';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (err) { setError(err.message); return; }
    navigate('/portal');
  };

  return (
    <div className="portal-root min-h-screen bg-gansid-surface flex items-center justify-center p-6">
      <GlassCard className="max-w-md w-full">
        <h1 className="font-display text-2xl font-bold mb-4">Set a new password</h1>
        <form onSubmit={submit} className="space-y-4">
          <GlassInput type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
          <GlassInput type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Update Password'}
          </ViscousButton>
        </form>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 2: Configure Supabase redirect URL**

In the Supabase dashboards (both projects) → Auth → URL Configuration:
- Add to "Redirect URLs": `<site_url>/#/reset-password`

(Site URL for GANSID = `https://gansidcongress.netlify.app`; for SCAGO = the existing SCAGO URL.)

- [ ] **Step 3: Commit**

```bash
git add components/Portal/ResetPassword/ResetPasswordPage.tsx
git commit -m "feat(portal): ResetPasswordPage — set new password after email link click"
```

---

## Phase 7: Announcements admin + feed

### Task 26: announcementService + admin CRUD UI

**Files:**
- Create: `services/announcementService.ts`
- Create: `components/Settings/AnnouncementsTab.tsx`
- Modify: `components/Settings.tsx`
- Create: `tests/announcementService.test.ts`

- [ ] **Step 1: announcementService**

```ts
// services/announcementService.ts
import { supabase } from './supabaseClient';
import type { Announcement } from '../types';

export function mapAnnouncementFromDb(row: any): Announcement {
  return {
    id: row.id,
    site: row.site,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    isActive: row.is_active,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAnnouncements(site: 'scago' | 'gansid'): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('site', site)
    .order('published_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapAnnouncementFromDb);
}

export async function listActiveAnnouncements(site: 'scago' | 'gansid', limit = 3): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('site', site)
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(mapAnnouncementFromDb);
}

export async function createAnnouncement(
  site: 'scago' | 'gansid',
  data: { title: string; body: string | null; imageUrl: string | null; isActive: boolean },
): Promise<Announcement | null> {
  const { data: row, error } = await supabase
    .from('announcements')
    .insert({
      site, title: data.title, body: data.body, image_url: data.imageUrl, is_active: data.isActive,
    })
    .select('*').maybeSingle();
  if (error) return null;
  return row ? mapAnnouncementFromDb(row) : null;
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Omit<Announcement, 'id' | 'site' | 'createdAt' | 'updatedAt'>>,
): Promise<Announcement | null> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if ('title' in patch) dbPatch.title = patch.title;
  if ('body' in patch) dbPatch.body = patch.body;
  if ('imageUrl' in patch) dbPatch.image_url = patch.imageUrl;
  if ('isActive' in patch) dbPatch.is_active = patch.isActive;
  if ('publishedAt' in patch) dbPatch.published_at = patch.publishedAt;
  const { data, error } = await supabase
    .from('announcements').update(dbPatch).eq('id', id).select('*').maybeSingle();
  if (error) return null;
  return data ? mapAnnouncementFromDb(data) : null;
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  return !error;
}

export async function uploadAnnouncementImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop();
  const path = `announcements/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('portal-assets').upload(path, file);
  if (error) { console.error('uploadAnnouncementImage', error); return null; }
  const { data } = supabase.storage.from('portal-assets').getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2: Test mapper**

```ts
// tests/announcementService.test.ts
import { describe, it, expect } from 'vitest';
import { mapAnnouncementFromDb } from '../services/announcementService';

describe('mapAnnouncementFromDb', () => {
  it('maps snake_case to camelCase', () => {
    const row = {
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', image_url: null,
      is_active: true, published_at: 't', created_at: 't', updated_at: 't',
    };
    expect(mapAnnouncementFromDb(row)).toEqual({
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', imageUrl: null,
      isActive: true, publishedAt: 't', createdAt: 't', updatedAt: 't',
    });
  });
});
```

Run: `npx vitest run tests/announcementService.test.ts` → passes.

- [ ] **Step 3: AnnouncementsTab**

```tsx
// components/Settings/AnnouncementsTab.tsx
import { useState, useEffect } from 'react';
import { CURRENT_SITE } from '../../config/sites';
import { listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, uploadAnnouncementImage } from '../../services/announcementService';
import type { Announcement } from '../../types';

export function AnnouncementsTab() {
  const site = CURRENT_SITE.key;
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { refresh(); }, []);
  const refresh = async () => setItems(await listAnnouncements(site));

  const save = async () => {
    if (!editing) return;
    if (!editing.id) {
      await createAnnouncement(site, {
        title: editing.title ?? 'Untitled',
        body: editing.body ?? null,
        imageUrl: editing.imageUrl ?? null,
        isActive: editing.isActive ?? true,
      });
    } else {
      await updateAnnouncement(editing.id, editing);
    }
    setEditing(null);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Announcements</h3>
        <button type="button" onClick={() => setEditing({})} className="px-4 py-2 bg-blue-600 text-white rounded">+ New</button>
      </div>

      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="border rounded p-3 flex items-start gap-3">
            {a.imageUrl && <img src={a.imageUrl} alt="" className="h-16 w-16 object-cover rounded" />}
            <div className="flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="text-sm text-slate-500">{new Date(a.publishedAt).toLocaleString()}</div>
              {a.body && <p className="text-sm mt-1">{a.body.slice(0, 120)}{a.body.length > 120 ? '…' : ''}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={a.isActive} onChange={async (e) => { await updateAnnouncement(a.id, { isActive: e.target.checked }); await refresh(); }} />
                Active
              </label>
              <button type="button" onClick={() => setEditing(a)} className="text-sm text-blue-600">Edit</button>
              <button type="button" onClick={async () => { if (confirm('Delete this announcement?')) { await deleteAnnouncement(a.id); await refresh(); } }} className="text-sm text-red-600">Delete</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
      </ul>

      {editing && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-semibold">{editing.id ? 'Edit' : 'New'} Announcement</h4>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Title"
            value={editing.title ?? ''}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
          <textarea
            className="w-full border rounded px-3 py-2"
            placeholder="Body (optional)"
            value={editing.body ?? ''}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            rows={4}
          />
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                const url = await uploadAnnouncementImage(file);
                setUploading(false);
                if (url) setEditing({ ...editing, imageUrl: url });
              }}
            />
            {uploading && <span className="ml-2 text-sm">Uploading…</span>}
            {editing.imageUrl && <img src={editing.imageUrl} alt="" className="mt-2 h-32 rounded" />}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={editing.isActive ?? true} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
            Active
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border rounded">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add to Settings.tsx tabs**

Open `components/Settings.tsx`. Add a new tab entry alongside existing ones (e.g., "SMTP", "Templates"):

```tsx
{ id: 'announcements', label: 'Announcements' }
```

And in the tab content switch:

```tsx
{activeTab === 'announcements' && <AnnouncementsTab />}
```

- [ ] **Step 5: Manual test**

As admin, open Settings → Announcements tab. Create one with title + image. Verify the row appears with image thumbnail. Toggle Active off → disappears from dashboard query.

- [ ] **Step 6: Commit**

```bash
git add services/announcementService.ts tests/announcementService.test.ts components/Settings/AnnouncementsTab.tsx components/Settings.tsx
git commit -m "feat(admin): Announcements CRUD tab in Settings with image upload to portal-assets bucket"
```

### Task 27: AnnouncementsFeed on dashboard

**Files:**
- Create: `components/Portal/Dashboard/AnnouncementsFeed.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/Portal/Dashboard/AnnouncementsFeed.tsx
import { useEffect, useState } from 'react';
import { listActiveAnnouncements } from '../../../services/announcementService';
import { CURRENT_SITE } from '../../../config/sites';
import type { Announcement } from '../../../types';
import { GlassCard } from '../ui/GlassCard';

export function AnnouncementsFeed() {
  const site = CURRENT_SITE.key;
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => { listActiveAnnouncements(site, 3).then(setItems); }, [site]);

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Announcements</h2>
      {items.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">No announcements yet. Check back soon.</p>
        </GlassCard>
      )}
      <div className="space-y-4">
        {items.map((a) => (
          <GlassCard key={a.id}>
            {a.imageUrl && <img src={a.imageUrl} alt="" className="w-full rounded-gansid-md object-cover max-h-64 mb-4" />}
            <h3 className="font-display text-lg font-semibold">{a.title}</h3>
            <div className="font-body text-sm text-gansid-on-surface/50 mb-2">{new Date(a.publishedAt).toLocaleDateString()}</div>
            {a.body && <p className="font-body whitespace-pre-wrap">{a.body}</p>}
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/Dashboard/AnnouncementsFeed.tsx
git commit -m "feat(portal): AnnouncementsFeed — most-recent 3 active announcements on dashboard"
```

---

## Phase 8: verify-payment JWT + go-live

### Task 28: verify-payment reads JWT for user_id

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Add JWT parsing at request entry**

In `supabase/functions/verify-payment/index.ts`, near the top of the request handler (after CORS handling, before the main logic), add:

```ts
let authUserId: string | null = null;
const authHeader = req.headers.get('Authorization');
if (authHeader?.startsWith('Bearer ')) {
  const jwt = authHeader.slice(7);
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (!userErr && userData?.user) {
    authUserId = userData.user.id;
  }
}
```

- [ ] **Step 2: Stamp user_id on every attendee insert in each flow branch**

Find each `.insert(...)` into `attendees` (there are multiple branches: sponsor, exhibitor, group, single). For each attendee row being inserted, add:

```ts
user_id: authUserId,
```

- [ ] **Step 3: Deploy to both projects**

```bash
supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs
supabase functions deploy verify-payment --project-ref gticuvgclbvhwvpzkuez
```

- [ ] **Step 4: Smoke test**

1. Log in to the portal, open the GANSID Congress form, complete registration.
2. Query GANSID `attendees` table: `SELECT user_id, email FROM attendees ORDER BY created_at DESC LIMIT 1;`
3. Expected: `user_id` matches the logged-in user's UUID.
4. Repeat for an anonymous flow (incognito, no login): `user_id` is NULL.

- [ ] **Step 5: Client-side: pass auth header**

In `components/PublicRegistration.tsx`, locate the fetch call to `verify-payment`. Update:

```tsx
const { data: { session } } = await supabase.auth.getSession();
const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    ...authHeader,
  },
  body: JSON.stringify(verifyBody),
});
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/verify-payment/index.ts components/PublicRegistration.tsx
git commit -m "feat(auth+payment): stamp attendees.user_id from verified JWT; anonymous submits set NULL"
```

### Task 29: Seed GANSID Congress form with step assignments

**Files:**
- Create: `tmp/seed-gansid-form-steps.sql` (not committed)

- [ ] **Step 1: Write the seed**

```sql
-- tmp/seed-gansid-form-steps.sql — apply to GANSID only

WITH updated AS (
  UPDATE forms
  SET settings = jsonb_set(
    jsonb_set(
      settings,
      '{renderMode}', '"stepped"'
    ),
    '{steps}',
    '[
      {"id": "personal", "label": "Personal Details", "description": "Let us get to know you."},
      {"id": "affiliation", "label": "Affiliation & Role"},
      {"id": "needs", "label": "Needs & Preferences"},
      {"id": "registration", "label": "Registration Type"},
      {"id": "consent", "label": "Consent & Payment"}
    ]'
  )
  WHERE id = '<GANSID_CONGRESS_FORM_ID>'
  RETURNING *
)
SELECT COUNT(*) FROM updated;
```

Also update each `FormField` in the form's `fields` column to include `section: '<step-id>'`. This is a JSONB array patch — do manually via Supabase SQL editor or via the FormBuilder UI (easier).

- [ ] **Step 2: Verify Form ID**

Call `mcp__claude_ai_Supabase__execute_sql` on GANSID:

```sql
SELECT id, name FROM forms WHERE form_type='event' AND name ILIKE '%congress%';
```

Replace `<GANSID_CONGRESS_FORM_ID>` in the SQL above.

- [ ] **Step 3: Apply via MCP**

`mcp__claude_ai_Supabase__execute_sql` with `project_id = gticuvgclbvhwvpzkuez`, query = the SQL above.

- [ ] **Step 4: Manually assign sections**

Open the FormBuilder for this form on GANSID deploy (`/admin/builder/<form-id>`). For each field, pick a step in the new Section dropdown:

- Full Name, Email, Phone, Country, Category → `personal`
- Organization, Role Type, Title, Specialization → `affiliation`
- Dietary, Accessibility, Special Requests → `needs`
- registration-mode-selector, Ticket → `registration`
- T&Cs, Disclaimer, Payment → `consent`

Save the form.

- [ ] **Step 5: Toggle show_in_portal**

In FormsManager, flip the "Show in portal" toggle for the Congress form to true.

- [ ] **Step 6: End-to-end smoke test**

1. Visit root → landing page loads.
2. Sign up with a new test email.
3. Click verification link in email.
4. Portal dashboard loads.
5. Click the Congress form card.
6. Complete the stepped form step-by-step.
7. Submit via PayPal (sandbox).
8. Return to dashboard → credential card now shows the QR.
9. Click QR → badge modal opens → Save as Image works.

- [ ] **Step 7: No commit needed — this is a data change, not code.**

Document the seed in the PR description.

### Task 30: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a new section "User Portal" before "Conventions"**

Include:
- Summary of the portal (landing, dashboard, profile, reset-password)
- `portalEnabled` flag in sites.ts
- Auth flow (signup, email verify, signin, password reset)
- Profile schema + `handle_new_user` trigger
- `attendees.user_id` FK linkage
- `forms.show_in_portal` opt-in
- `announcements` table + admin UI
- Stepped form architecture (`form.settings.renderMode='stepped'`, `FormField.section`, `<SteppedFormShell>`)
- Credential badge modal + html2canvas
- Site-conditional routing summary
- References to spec + plan

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — document user portal architecture"
```

---

## Self-review checklist (run before handoff)

- [ ] All spec sections covered:
  - [x] Routing & site-conditional → Task 17
  - [x] Data model (profiles, user_id, show_in_portal, announcements) → Tasks 2, 4, 5
  - [x] Auth flow → Tasks 2 (trigger), 15 (context), 19 (signup/signin), 25 (reset)
  - [x] Landing page → Tasks 18, 19, 20
  - [x] Portal dashboard → Tasks 21, 22, 23
  - [x] Stepped form → Tasks 7, 8, 9, 10, 11
  - [x] Credential badge modal → Task 23
  - [x] Announcements → Tasks 26, 27
  - [x] Styling foundation → Tasks 13, 14
  - [x] Migration & deploy → Task 2 (both projects), Task 3 (buckets), Task 28 (edge function)
  - [x] RMS bug fix (Phase 0) → Task 1
- [ ] No placeholders: searched for TBD/TODO. Task 7's Step 2 notes "paste the JSX" which is a deliberate extract-pointer for a large chunk — acceptable given the scale. Task 29 has `<GANSID_CONGRESS_FORM_ID>` placeholder but Step 2 explicitly instructs how to resolve it via SQL query.
- [ ] Type consistency: Profile field names match across types.ts, profileService mapper, AuthContext usage, ProfilePage usage. Announcement same. FormField.section matches StepsManager output and SteppedFormShell input.
- [ ] File paths are absolute from repo root throughout.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-gansid-user-portal.md`. Per the user's standing preference (feedback memory: "always subagent-driven"), execution will use **superpowers:subagent-driven-development**: fresh subagent per task, two-stage review between tasks.
