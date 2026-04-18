# GANSID User Portal — Design

**Date:** 2026-04-18
**Status:** Design approved in brainstorming, ready for implementation plan
**Scope:** New public-facing user portal for the GANSID Congress 2026 deployment. Wraps the existing registration flow in a stepped UI, adds account creation + profile management, adds an admin-managed announcements feed, and re-skins the GANSID front door with the Viscous Flow design system. SCAGO deployment is unaffected on first ship.

## Background

EventCheck today is admin-only: the root URL redirects to `/admin`, and attendees reach forms via direct `/form/:formId` links emailed to them. For GANSID Congress 2026 we need a user-facing portal where people can:

1. Land on a branded Congress home page with registration info.
2. Sign up for a Congress account (or sign in if they already have one).
3. Fill the Congress registration form in a guided multi-step flow instead of one long scrolling page.
4. Manage a profile (name, email, organization, country, role).
5. View their registration status, re-download their ticket, and present a credential QR at the door.
6. See announcements posted by GANSID admins (image + text).

The existing registration engine, PayPal flow, pricing engine, group flow, email system, and admin dashboard all stay intact. The portal is a new surface over the same data model, with two small schema extensions (`profiles`, `attendees.user_id`, `forms.show_in_portal`, `announcements`).

GANSID becomes the default front door when `VITE_SITE=gansid`. SCAGO keeps its current behavior (root → `/admin`) until it explicitly opts in later.

## Approach: site-conditional front door + additive schema + stepper view wrapper

Five loosely coupled pieces:

1. **Routing** — site-conditional default route. On GANSID, `/#/` renders the new `<Landing />`; on SCAGO, `/#/` still redirects to `/#/admin`. Admin is reachable at `/#/admin` on both sites.
2. **Auth + profiles** — reuse existing Supabase auth (same client, same `signInWithPassword`). Add a `profiles` table keyed on `auth.users.id` with a `handle_new_user` trigger so signup auto-creates the profile from metadata. Add a `role` column on `profiles` (`attendee | exhibitor | sponsor | admin`) used for dashboard personalization and admin-link gating.
3. **Portal ↔ attendees link** — `attendees.user_id UUID` nullable. When a logged-in user fills a form, `verify-payment` stamps `user_id`. Legacy rows stay NULL. The portal surfaces attendee rows either by `user_id` or by fallback email match.
4. **Stepped form rendering** — additive layer. New `FormField.section` + `FormField.sectionOrder` properties; `Form.settings.renderMode: 'single' | 'stepped'`. A new `<SteppedFormShell>` wraps `PublicRegistration` logic and renders sections one at a time with the left-sidebar stepper from the reference mockup. Non-stepped forms render as today. Form builder gains a Steps manager + per-field Section dropdown.
5. **Announcements** — new `announcements` table with image upload to a new `portal-assets` Supabase bucket. Admin CRUD lives in `Settings → Announcements`. Dashboard renders the three most recent published items.

### Alternatives considered

- **Make the portal the default for both sites** — rejected. SCAGO has an established flow; introducing a portal there without a SCAGO-specific content plan creates empty/broken UX. Site-conditional keeps SCAGO stable.
- **New `portal_users` table separate from `auth.users`** — rejected. Supabase auth already gives us user rows. Adding a parallel identity system just to avoid touching the users table creates sync burden.
- **Sync profile changes back to attendee rows on form submit** — rejected. A user registering a colleague would overwrite their own profile. Profile is one-way pre-fill source only.
- **shadcn/ui for portal components** — rejected. shadcn components use 1px borders by default and would fight the "no-line rule" in GANSID-DESIGN.md. We hand-roll a small component set tuned to Viscous Flow tokens.
- **Schedule / session features in MVP** — deferred. Registration-focused MVP. The dashboard's "Up Next" card renders a countdown placeholder; real schedule wiring ships later.
- **Congress ID identifier separate from email** — rejected (user request). Sign-in is email + password; "Congress ID" language from the mockup is illustrative only.

## Data model

### Migrations (apply to BOTH SCAGO `iigbgbgakevcgilucvbs` and GANSID `gticuvgclbvhwvpzkuez` project refs)

**Migration: `20260418000000_add_user_portal_schema.sql`**

```sql
-- profiles: one row per auth.users, auto-created via trigger
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'attendee'
    CHECK (role IN ('attendee', 'exhibitor', 'sponsor', 'admin')),
  organization TEXT,
  country_code TEXT,  -- ISO 3166-1 alpha-2, matches utils/countries.ts
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_email ON public.profiles(email);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper avoids RLS recursion when admin policies need to look up
-- the current user's role from the same table they're protecting (profiles).
-- Same pattern as GANSID-LMS public.is_admin().
CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Users read and update their own profile
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
-- Profile row insert is done by the trigger (SECURITY DEFINER); no client insert policy.
-- Admins read all profiles (for the admin dashboard's user-lookup features, future phase)
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT
  USING (public.is_portal_admin());

-- Trigger to auto-create profile row on signup, reading metadata from signUp({ options: { data: {...} } })
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

-- Link attendees to portal users (nullable — legacy rows stay NULL)
ALTER TABLE public.attendees ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_attendees_user_id ON public.attendees(user_id) WHERE user_id IS NOT NULL;

-- Opt-in visibility flag for forms that should appear in the portal
ALTER TABLE public.forms ADD COLUMN show_in_portal BOOLEAN NOT NULL DEFAULT false;

-- Announcements feed (admin-managed)
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL CHECK (site IN ('scago', 'gansid')),
  title TEXT NOT NULL,
  body TEXT,                        -- optional markdown / plain-text body
  image_url TEXT,                   -- optional Supabase storage URL
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_site_active ON public.announcements(site, is_active, published_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated OR anonymous can read active announcements (portal is open)
CREATE POLICY "announcements_public_read" ON public.announcements FOR SELECT
  USING (is_active = true);
-- Admins can do anything
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL
  USING (public.is_portal_admin());

-- Bootstrap: create profile rows for all existing auth.users. Pre-portal, every existing
-- auth.users row is an admin (EventCheck was admin-only before this migration). This
-- assumption holds for both SCAGO and GANSID Supabase projects. If a non-admin auth user
-- ever exists pre-migration, flip their role manually after applying this.
INSERT INTO public.profiles (id, email, full_name, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', ''), 'admin'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

**Storage bucket (created manually via Supabase dashboard or CLI, both projects):**

- Bucket name: `portal-assets`
- Public read: yes
- Authenticated upload: yes (admin-only enforced in client code + RLS check on `profiles.role`)
- Used for: announcement images, future profile avatars

### Why `show_in_portal` is a per-form boolean, not a site-wide default

Explicit opt-in prevents internal test forms, deprecated forms, or sponsor/exhibitor forms that aren't for self-service registration from cluttering the user's portal dashboard. Admins toggle it per form in FormsManager.

### Why `attendees.user_id` is nullable and additive

- Pre-portal attendee rows never had a user — they came from public form links with no auth.
- Guest-claim rows are pre-created on a group purchase before the guest has an account.
- Forcing a user_id would break migration + historical data + guest-claim flow.
- The portal queries `user_id = auth.uid() OR email = auth.user.email` so authenticated users see both portal-originated and legacy email-matched registrations.

## Routing & site-conditional behavior

### Current state (App.tsx)

```
/#/              → redirect to /#/admin
/#/login         → admin login
/#/form/:formId  → public form
/#/admin/*       → admin dashboard (ProtectedRoute)
```

### New state

Portal routes are registered **only when** `CURRENT_SITE.portalEnabled === true`. On SCAGO
(`portalEnabled=false`), `/#/` and `/#/admin` behave exactly as today; no portal routes exist.

On GANSID (`portalEnabled=true`):

```
/#/              → <Landing />
/#/portal        → <PortalDashboard /> (ProtectedRoute; redirects to /#/ if not logged in)
/#/portal/profile → <ProfilePage /> (ProtectedRoute)
/#/reset-password → <ResetPasswordPage /> (public; arrives via Supabase auth email link)
/#/form/:formId  → unchanged (public, stepper-aware if form.settings.renderMode='stepped')
/#/admin/*       → unchanged (ProtectedRoute, admin role required)
/#/login         → unchanged (admin-only login; portal uses the landing-page modal)
```

On SCAGO:

```
/#/              → redirect to /#/admin (unchanged)
/#/form/:formId  → unchanged
/#/admin/*       → unchanged
/#/login         → unchanged
```

### Why two login surfaces (landing modal + `/#/login`)

The landing modal is the primary portal entry point — a tab-toggle card on the right of the landing page. `/#/login` remains as the admin's bookmarkable sign-in (and a fallback if the landing page is bypassed). Both call the same `signInWithPassword`; the landing page redirects post-login to `/#/portal`, while `/#/login` redirects to `/#/admin` for users with `role='admin'` or `/#/portal` otherwise.

### Admin link placement

Avatar dropdown in the portal header. Rendered only when `profiles.role === 'admin'`. Labelled "Admin Dashboard" → `/#/admin`. Non-admin users never see it.

### Site-config additions (`config/sites.ts`)

Add one new field per site:

```ts
type SiteConfig = { /* existing fields */ portalEnabled: boolean };
// gansid.portalEnabled = true
// scago.portalEnabled = false (until they opt in)
```

App.tsx reads `CURRENT_SITE.portalEnabled` to decide the `/#/` route.

## Auth flow

### Signup (from landing page Sign Up tab)

1. User fills: full name, email, password, role (radio: Attendee / Exhibitor / Sponsor).
2. Client calls `supabase.auth.signUp({ email, password, options: { data: { full_name, role } } })`.
3. Supabase sends a verification email (template configured in Supabase dashboard — matches LMS pattern).
4. `handle_new_user` trigger fires on `auth.users` insert, creates `profiles` row with metadata.
5. User clicks email link → Supabase verifies → redirects back to `/#/portal` (configured as the site URL in Supabase auth settings).
6. On first portal load, `PortalDashboard` reads the profile and renders the onboarding state (no attendee rows yet).

### Signin (from landing page Sign In tab or `/#/login`)

1. User fills email + password.
2. `signInWithPassword` → redirect.
3. Landing-page signin redirects to `/#/portal`. `/#/login` signin redirects by role.

### Password reset

Standard `supabase.auth.resetPasswordForEmail(email, { redirectTo: <site_url>/#/reset-password })`. New `/#/reset-password` page shows email-link-arrived-here state + "set new password" form. Matches the LMS pattern (`src/app/reset-password/page.tsx`).

### Session handling

Reuses existing `components/AuthContext.tsx`. Extended lightly: `useAuth()` now exposes a `profile: Profile | null` field in addition to the existing `user` and `session`. On auth state change, the context fetches the profile row and caches it. All portal pages wrap in the existing provider.

### Admin role provisioning

The signup UI offers only `attendee | exhibitor | sponsor`. The `admin` role is a permission, not a self-selection. An auth user becomes admin by:

1. **Bootstrap:** the migration's backfill INSERT flags all pre-portal `auth.users` as admins.
2. **Future additions:** set manually via Supabase SQL (`UPDATE profiles SET role='admin' WHERE email='...'`). A proper admin-management UI is deferred post-MVP.

### ProtectedRoute extension

`ProtectedRoute` (App.tsx lines 385–401 today) currently checks only `useAuth().user` presence. It gets one optional prop added: `requireRole?: 'admin'`. When set, the route additionally checks `profile.role === 'admin'` and redirects to `/#/portal` (GANSID) or `/#/login` (SCAGO) if the check fails. The `/#/admin/*` routes get `requireRole="admin"`. Existing callers pass no prop and behave identically to today.

### Email verification as a soft block

The portal loads for unverified users but shows a banner "Verify your email to complete registration" with a "resend verification" button. Registering for a form requires a verified session — enforced in `verify-payment` by checking the session token's email_verified claim. Unverified users can still browse and build their profile.

## Landing page

### Layout (two zones, full-width)

**Zone 1 — Hero + Register (above the fold, two-column full-width):**

- **Left column (60% width):** Hero image (configurable via `config/sites.ts` `hero.image`) + "Registration is open now!" pill badge + display headline ("Hyderabad, India") + date/location line + short welcome copy.
- **Right column (40% width):** Glassmorphic card, sticky on scroll. Top: Floating Toggle tabs — [Sign Up] [Sign In]. Below the active tab, the form:
  - **Sign Up:** Full Name, Email, Password, Role (radio: Attendee / Exhibitor / Sponsor), "I agree to T&Cs" checkbox (opens modal via existing `ConsentCheckbox` component), primary gradient "Create Account" button.
  - **Sign In:** Email, Password, Remember Me, Forgot Password link, primary gradient "Sign In" button.

**Zone 2 — Full-width Congress info (below hero, tabbed):**

Horizontal Floating Toggle tab bar with four tabs. Each renders in a full-width container (not a narrow column). Sign-up card stays sticky so scroll never feels wasted.

- **About & Process tab** — welcome copy + three glass cards for "01 Account Setup / 02 Details & Tier / 03 Finalize" + Important Notice callout in red-tinted glass.
- **What's Included tab** — two side-by-side cards. Includes card uses blue-tinted glass background. Not-Included card uses muted-red-tinted glass.
- **Conference Fees tab** — Tier 1 / Tier 2 Floating Toggle at top, then the pricing table from `Registration page details.md`. Rows use alternating surface tones (no row borders). Early Bird column highlighted with a subtle orange accent.
- **FAQs tab** — organic-expansion accordions per GANSID-DESIGN.md §5.

### Content source

All landing-page copy is verbatim (with light rewrites for markup) from `GANSID Docs/Registration page details.md`. Content lives as JSX in `components/Portal/Landing/` — not fetched at runtime, not in the DB. If content needs to change, it's a code change.

### Register Now CTAs

The hero's "Register Now!" button and the tab cards' CTAs all scroll to the sticky sign-up card (or, if the user is already authenticated, link to `/#/portal`). Single source of truth for the registration entry point.

### Site-specific asset path

Hero image lives at `public/branding/gansid/portal-hero.jpg` (user uploads later). `config/sites.ts` `gansid.hero.image` points at it.

## Portal dashboard

### Layout (two-column on desktop, stacked on mobile)

**Left column (~65%):**

- Welcome block: "Welcome back, {first_name}" in display typography, red-on-primary gradient on the first name.
- Subhead: dynamic based on state:
  - No attendee yet → "Complete your Congress registration to receive your credential."
  - Paid attendee → "Your GANSID 2026 credential is ready."
  - Pending cheque → "Awaiting payment confirmation for your Congress registration."
- "Up Next" card (empty-state for MVP): static countdown to `2026-10-23` + caption "Congress opens in X days. Schedule coming soon."
- **Available Forms section:** card grid of all `forms.show_in_portal = true` forms, filtered by the user's role preference (attendee-role user sees event forms first; exhibitor sees exhibitor forms first; sponsor sees sponsor forms first — just ordering, not gating). Each card shows form name, short description, and either "Start Registration" (if no matching attendee row) or "View Registration" (if they have one for that form).
- **Announcements section:** three most recent active announcements for the current site. Each card: optional image at top, title, body preview, published date.

**Right column (~35%, sticky):**

- **Credential card** (glass, red-to-blue subtle gradient border):
  - Top-right: role badge (Delegate / Exhibitor / Sponsor) in a pill.
  - Avatar (future upload, default initials circle for MVP).
  - Full name + organization + role line.
  - QR code (large) — clickable, opens Credential Badge Modal.
  - Footer: "Scan at door" caption.
  - If the user has no paid attendee row yet, render a placeholder card with a "Register for Congress" CTA instead of the QR.
- **Quick Links section:** static cards for MVP (non-functional, visual placeholders): Full Itinerary, Congress Materials, Venue Info.

### Avatar dropdown (top-right header)

- Profile → `/#/portal/profile`
- Admin Dashboard → `/#/admin` (conditional on `role === 'admin'`)
- Sign Out → `supabase.auth.signOut()`, redirect to `/#/`

### Credential QR source

Query `attendees` where `(user_id = auth.uid() OR email = auth.user.email) AND payment_status = 'paid'`, order by `created_at DESC`, take 1. Display `qr_payload`. If multiple paid attendees exist (e.g., user attended previous events), the most recent one is the active credential. A future phase adds an event picker.

### Credential Badge Modal

Full-screen glass modal (`backdrop-filter: blur(24px)`, `on_surface @ 6% opacity` ambient shadow). Layout matches a physical conference badge:

- Portrait-oriented glass card (~400px × 600px).
- Top band: red-to-blue gradient with "GANSID 2026" wordmark.
- Avatar placeholder.
- Full name (display typography).
- Organization + role subline.
- Country flag emoji (if country_code is set).
- Large QR (~240px).
- Role badge pill (Delegate / Exhibitor / Sponsor).
- Footer: "Present this QR at the Congress entrance."
- Actions: "Save as Image" (client-side canvas render → PNG download), "Close."

The "Save as Image" action uses `html2canvas` (~48KB gzipped, MIT licensed, established API). On click: snapshot the badge-card DOM node, convert to PNG blob, trigger download as `GANSID-2026-Credential-{full_name}.png`.

## Multi-step registration form

### Data model additions (types.ts)

```ts
interface FormField {
  // ... existing fields
  section?: string;        // ID of the step this field belongs to. Undefined = first step.
  sectionOrder?: number;   // Order within the step (defaults to FormField.order).
}

interface FormSettings {
  // ... existing fields
  renderMode?: 'single' | 'stepped';   // default 'single'
  steps?: Array<{
    id: string;            // stable identifier referenced by FormField.section
    label: string;         // display label, e.g. "Personal Details"
    description?: string;  // subtitle, optional
  }>;
}
```

### New component: `components/SteppedRegistration/SteppedFormShell.tsx`

- Accepts the same props as the inner `PublicRegistration` body.
- Reads `form.settings.steps` + `form.settings.renderMode`.
- Groups `form.fields` by `field.section` (fields with no section go to the first step).
- Renders:
  - Left sidebar stepper (Viscous Flow vertical timeline): step labels + active/complete icons.
  - Right panel: the fields for the active step, using the **existing** field renderers from PublicRegistration.
  - Footer: Previous / Next / Submit buttons. Next validates only the active step's fields. Submit appears on the last step and runs the existing full-form submit logic.
- Persists in-progress answers to `localStorage` keyed on `form.id + user.id` so refreshes don't wipe state.

### Refactor: extract `PublicRegistration.tsx` body into a renderer

Split PublicRegistration into:

1. **`PublicRegistration.tsx`** (outer) — loads form, handles mode detection (purchaser / guest / pending-claim), dispatches to the correct sub-component.
2. **`components/SteppedRegistration/FormRenderer.tsx`** (new, extracted) — contains the field-rendering JSX + validation + submit logic currently in PublicRegistration lines ~900–1600. Accepts `filteredFields: FormField[]` so SteppedFormShell can pass in just the current step's fields or the full list.
3. **`components/SteppedRegistration/SingleFormShell.tsx`** (thin wrapper) — renders FormRenderer with all fields at once. Replaces current PublicRegistration body.
4. **`components/SteppedRegistration/SteppedFormShell.tsx`** — renders FormRenderer one section at a time.

This refactor is the biggest single chunk of work in the spec. It's mechanical but needs care around:

- **Validation scoping:** per-step validation during Next click, full validation on Submit. Reuse `validate()` but accept a `fieldSubset` parameter.
- **Visibility logic:** `isVisible(field)` depends on answers from prior fields. When the user is on step 3, fields hidden by step-1 answers must still honor that logic. Works because answers is global state across steps.
- **Group registration state:** `registrationMode` + `groupMembers` + `groupSize` live in the outer component so they persist across step changes. The group UI for entering N members sits on its own step.
- **Payment step:** PayPal buttons always on the final step.

### Bug fix: RMS submission validation (Phase 0)

`components/PublicRegistration.tsx` line 362–407 `validate()` loop excludes `field.type !== 'ticket'` from the `!answers[field.id]` check, but not `registration-mode-selector`. The RMS value lives in the `registrationMode` state, not in `answers`, so the check fails for every submit when the field is required.

**Fix:**

```ts
// Before (line 367):
if (isVisible(field) && field.required && !answers[field.id] && field.type !== 'ticket') {

// After:
if (
  isVisible(field)
  && field.required
  && !answers[field.id]
  && field.type !== 'ticket'
  && field.type !== 'registration-mode-selector'
) {
```

Plus add an explicit RMS check after the loop:

```ts
if (rmsField && rmsField.required && registrationMode === null) {
  setError(`Please select ${rmsField.label}`);
  return false;
}
```

This fix lands **before** the stepper refactor to avoid debugging two things at once.

### Other logic gaps to address in Phase 0

While auditing the validation path, fix these related issues:

1. **FormPreview mirrors the bug** — `components/FormPreview.tsx` reimplements the same validation loop and has the same RMS exclusion gap. Apply the same fix.
2. **Consent checkboxes with modals** — `ConsentCheckbox` writes `answers[field.id]` as `true | undefined`. The `!answers[field.id]` check treats explicit `false` and undefined identically, which is fine today, but flag for re-audit during the stepper refactor (a step transition might re-trigger visibility eval).
3. **Group registration member validation** — the submit-button disabled logic on line 1518 already validates `groupMembers` presence. But `validate()` itself doesn't mirror this, so a keyboard-triggered submit with incomplete group members could bypass. Add parallel validation in `validate()` for group mode.

### Form builder UI changes

`components/FormBuilder/` gains:

- **Form Settings tab** (or existing settings panel): new "Stepped Registration" toggle. When on, shows a Steps manager: add/rename/delete/reorder steps. Each step has ID + label + optional description.
- **Field Properties Panel** (`FieldPropertiesPanel.tsx`): new "Step" dropdown visible only when `form.settings.renderMode === 'stepped'`. Dropdown options are the form's configured steps. Defaults to first step when a new field is added.
- **Field Card** (`FieldCard.tsx`): shows the step assignment as a small pill in the field card, so admins can see at a glance which step a field is in.

### Default Congress form stepping

The seed for the GANSID Individual/Group form is updated to include a `settings.steps` array and `section` tags on fields. Suggested mapping:

- **Step 1 — Personal Details:** Full Name, Email, Phone, Country (pricing-linked), Category.
- **Step 2 — Affiliation & Role:** Organization, Role Type, Professional Title, Specialization.
- **Step 3 — Needs & Preferences:** Dietary, Accessibility, Special Requests.
- **Step 4 — Registration Type:** registration-mode-selector + group member details (if group chosen) + ticket selector.
- **Step 5 — Consent & Payment:** T&Cs checkbox, Disclaimer checkbox, PayPal buttons.

Admin can rearrange via the Steps manager. The seed in `tmp/seed-gansid-form.sql` is updated; the running form needs a one-time migration to assign step IDs.

## Announcements feed

### Admin UI (`Settings → Announcements` tab)

- List view: all announcements for the current site, sortable by published_at desc.
- Each row: image thumbnail, title, published date, is_active toggle, Edit, Delete.
- "+ New Announcement" button → modal with: title, body (textarea, plain text for MVP; markdown rendering post-MVP), image upload (to `portal-assets/announcements/{uuid}.{ext}`), is_active checkbox, published_at (default now).
- Image upload uses `supabase.storage.from('portal-assets').upload(...)`.

### Dashboard display

- Query: `SELECT * FROM announcements WHERE site = CURRENT_SITE AND is_active = true ORDER BY published_at DESC LIMIT 3`.
- Render as three stacked glass cards in the Announcements section of the dashboard left column.
- Empty state: "No announcements yet. Check back soon." in muted tone.

### Why it's scoped to Settings, not its own admin route

Settings already has the tabbed structure and is where the admin touches global app state. Adding one more tab is lower-cost than a new top-level route.

## Styling foundation

### Tailwind config extension

`tailwind.config.js` gains a new theme extension scoped via a CSS class prefix (`portal-*`) so the design tokens don't leak into the existing admin or public-form surfaces:

```js
// tailwind.config.js excerpt
module.exports = {
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
};
```

Fonts loaded via `<link>` in `index.html` head (Google Fonts). No webpack config changes.

### Scoping strategy

All portal components render inside a root `<div className="portal-root font-body">` wrapper in `<PortalLayout />`, with a CSS rule in `styles/portal.css`:

```css
.portal-root {
  /* reset divider colors, apply token defaults */
  --portal-surface: theme('colors.gansid-surface');
  /* ... */
}
.portal-root *, .portal-root *::before, .portal-root *::after {
  border-color: transparent; /* enforce the no-line rule at the root */
}
```

This keeps the design system isolated. Existing admin components outside `portal-root` are unaffected. The CSS module prevents scope creep.

### Custom component set (hand-rolled, `components/Portal/ui/`)

Minimum viable: GlassCard, FloatingToggleTabs, ViscousButton (primary gradient + secondary glass variants), GlassInput, GlassSelect, GlassDialog, StepperSidebar, OrganicAccordion.

Each is a thin JSX + Tailwind component, ~50–100 lines. No third-party UI library. Total component file footprint: ~8 files, ~600 LOC.

## Error handling, security, and edge cases

- **Unverified email + form submit:** `verify-payment` checks `session.user.email_confirmed_at IS NOT NULL`. Returns 401 with a specific error code; client shows "verify your email first" banner + resend button.
- **Email mismatch between profile and form field:** if the user fills a form with a different email than their profile, the attendee row is stamped `user_id = auth.uid()` anyway (the portal trusts the session, not the form field). The form-level email stays as the ticket recipient.
- **Duplicate attendees per user:** allowed. A user can register multiple times (e.g., one attendee registration plus one sponsor submission). The portal groups them under "Your Registrations" list.
- **Role mismatch between profile and form:** no gating. A user with `role='attendee'` can still submit the exhibitor form. The profile role is a soft preference for dashboard ordering.
- **Legacy attendees (pre-portal):** visible to the logged-in user via email match. If the email was mistyped, they won't see it — user can contact support to relink, or re-register. Documented limitation.
- **Stepper localStorage persistence:** keyed on `form_id:user_id`. Cleared on successful submit AND on `supabase.auth.signOut()` (AuthContext subscribes to auth state changes and sweeps all `gansid-portal-stepper:*` keys on signout). If the user clears localStorage mid-flow manually, they restart from step 1. Acceptable.
- **Admin posting announcement with no image:** image_url is nullable. Body-only announcement renders with no image area.
- **Announcement image size:** client-side validation caps at 2MB / 4096×4096. Server-side: Supabase storage policies default to 50MB but we don't enforce tighter in MVP.
- **Site-conditional routing at build time:** `VITE_SITE` is baked into the Netlify build. Changing it means a redeploy. This is already how multi-site works; no regression.

## Testing strategy

Follows project convention: **Vitest unit tests for pure logic only; UI flows tested manually.**

New test files:

- `tests/profileMapper.test.ts` — profile row ↔ UI mapper correctness.
- `tests/steppedForm.test.ts` — `groupFieldsBySection`, per-step validation pure helpers.
- `tests/announcementQuery.test.ts` — announcement filter logic.

Manual QA checklist (included in the plan):

1. GANSID root → landing page renders, sign-up tab works, email arrives, link click → portal loads.
2. Sign-in with existing account → portal loads, profile row visible.
3. Stepped form: Previous/Next validates per step, refresh mid-flow restores answers, submit clears localStorage.
4. RMS bug: Individual submit now works. Group submit works. Both with and without pricing template.
5. Credential QR: shows only for paid attendees, badge modal opens, Save as Image works.
6. Admin posts announcement with image → visible on dashboard within 5s (no cache).
7. SCAGO root still redirects to `/admin` — no landing page, no portal routes reachable.

## Migration & deploy plan

1. **Phase 0 — bug fixes + non-schema prep (no migration):** fix RMS validation bug in `PublicRegistration.tsx` + `FormPreview.tsx`, add the group-member parallel validation. Ship as its own PR, deploy to both Netlify sites.
2. **Phase 1 — schema migration to both Supabase projects.** Apply `20260418000000_add_user_portal_schema.sql` to SCAGO ref `iigbgbgakevcgilucvbs` then GANSID ref `gticuvgclbvhwvpzkuez`. Create `portal-assets` bucket on both.
3. **Phase 2 — stepped form refactor:** extract FormRenderer, add SingleFormShell + SteppedFormShell, update FormBuilder. Ship with a dark-launch (no form has `renderMode='stepped'` yet). Regression test all existing forms.
4. **Phase 3 — portal shell + landing + dashboard + auth.** Ship behind `portalEnabled=true` on GANSID only. SCAGO unaffected.
5. **Phase 4 — announcements admin + dashboard display.**
6. **Phase 5 — credential badge modal + Save as Image.**
7. **Phase 6 — seed the GANSID Congress form with step IDs and `renderMode='stepped'`.** This is the go-live flip.
8. **Phase 7 — `verify-payment` edge function update:** when the request carries an `Authorization: Bearer <jwt>` header, the function calls `supabase.auth.getUser(jwt)` to verify the session and extracts the authenticated `user_id` server-side. The client never supplies `user_id` in the payload (that would be forgeable). When no auth header is present (public-form submissions from anonymous users), rows are inserted with `user_id = NULL`. Same belt-and-suspenders pattern as `confirm-sponsor-cheque`. Deploy to both projects.

Rollback: every phase is independently revertable. Phase 1 (schema) is forward-compatible — old code doesn't reference the new columns. Phase 3+ (portal routes) is a pure addition.

## Success criteria

- A new GANSID visitor hits the root, sees the landing page, signs up, verifies email, lands on a portal dashboard, clicks the Congress registration form, completes it as a stepped flow, pays via PayPal, and sees their credential QR on their dashboard — all in one session, all without admin intervention.
- Existing admin workflows (forms manager, attendee dashboard, sponsor admin, exhibitor admin) are untouched.
- SCAGO users see no change.
- The RMS submission bug is resolved.
- The form builder edits stepped forms as naturally as non-stepped forms.

## Follow-up scope (not in this phase)

- Exhibitor form feature additions (user mentioned a separate phase).
- Session schedule / speakers / itinerary.
- Announcement feed reactions, comments, markdown rendering.
- SCAGO portal opt-in.
- Profile avatar upload UI.
- Multi-credential picker (when a user has multiple paid attendee rows across events).
- Legacy attendee email-match reconciliation UI.
