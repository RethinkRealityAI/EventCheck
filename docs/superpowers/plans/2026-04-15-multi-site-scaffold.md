# Multi-Site Scaffold — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a second deployment — `gansidcongress.netlify.app` backed by its own Supabase project — while sharing the codebase with the existing SCAGO deployment, with zero schema changes and zero visible change to the live SCAGO event.

**Architecture:** See [2026-04-15-multi-site-scaffold-design.md](../specs/2026-04-15-multi-site-scaffold-design.md). Two Netlify sites + two Supabase projects + one git repo. Site-level branding driven by a new `VITE_SITE` env var + `config/sites.ts` module. Runtime settings (PayPal/SMTP/templates) remain per-Supabase in `app_settings`.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind, Vitest, Supabase CLI, Netlify

---

## File structure

**Create:**
- `config/sites.ts` — site-config module exporting `CURRENT_SITE`
- `tests/sites.test.ts` — unit tests for `CURRENT_SITE` resolution
- `public/branding/gansid/README.md` — documents which assets go here (actual image files added via Task 5)

**Modify:**
- `env.d.ts` — add `VITE_SITE` to `ImportMetaEnv`
- `index.tsx` — set `document.title` and CSS variables from `CURRENT_SITE` before mounting React
- `App.tsx` lines 250–274 — admin shell header reads `CURRENT_SITE.displayName` + conditionally renders `CURRENT_SITE.logoImage`
- `CLAUDE.md` — add "Multi-site deployment" section; update Commands section to note per-project-ref variants

**Not modified (spec is explicit about this):**
- Any table schema, any RLS policy, any edge function source code (they already support `PAYPAL_MODE`), `types.ts`, form builder, PDF generator, email templates, `services/supabaseClient.ts`

**Deviation from spec:** Spec step B.3 said "move existing SCAGO logo into `public/branding/scago/`". Reality check during planning: there is no SCAGO logo file — the current admin header uses the `QrCode` lucide icon + hardcoded "EventCheck" text. So SCAGO gets no asset work. `config/sites.ts` makes `logoImage` optional; when absent, the header keeps its current `QrCode` rendering. SCAGO's `displayName` stays as "EventCheck" to preserve its current visual appearance exactly.

---

## Phase 1 — Code changes (single branch `feat/multi-site-scaffold`)

### Task 1: Create the branch and declare VITE_SITE in env types

**Files:**
- Modify: `env.d.ts`

- [ ] **Step 1: Create and switch to the feature branch**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
git checkout main
git pull
git checkout -b feat/multi-site-scaffold
```

Expected: `Switched to a new branch 'feat/multi-site-scaffold'`

- [ ] **Step 2: Add `VITE_SITE` to `env.d.ts`**

Replace the entire contents of `env.d.ts` with:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_PAYPAL_CLIENT_ID: string
    readonly VITE_SITE?: 'scago' | 'gansid'
    readonly GEMINI_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no new errors — the optional `?` means existing builds without `VITE_SITE` set still type-check)

---

### Task 2: Create `config/sites.ts` with unit tests

**Files:**
- Create: `config/sites.ts`
- Create: `tests/sites.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `tests/sites.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('site config resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to scago when VITE_SITE is unset', async () => {
    vi.stubEnv('VITE_SITE', '');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('scago');
    expect(CURRENT_SITE.displayName).toBe('EventCheck');
    expect(CURRENT_SITE.logoImage).toBeUndefined();
  });

  it('resolves gansid when VITE_SITE=gansid', async () => {
    vi.stubEnv('VITE_SITE', 'gansid');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('gansid');
    expect(CURRENT_SITE.displayName).toBe('GANSID Congress');
    expect(CURRENT_SITE.logoImage).toBe('/branding/gansid/mark.svg');
  });

  it('falls back to scago on unknown VITE_SITE value', async () => {
    vi.stubEnv('VITE_SITE', 'nonsense');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('scago');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- sites.test.ts`
Expected: FAIL — `Cannot find module '../config/sites'`

- [ ] **Step 3: Create `config/sites.ts` with the minimal implementation**

```typescript
export type SiteKey = 'scago' | 'gansid';

export interface SiteConfig {
  key: SiteKey;
  displayName: string;
  adminSubtitle: string;
  pageTitle: string;
  /** Optional image asset path in `public/`. When unset, consumer falls back to an icon. */
  logoImage?: string;
  fallbackColors: { primary: string; accent: string };
  supportEmail: string;
}

const CONFIGS: Record<SiteKey, SiteConfig> = {
  scago: {
    key: 'scago',
    displayName: 'EventCheck',
    adminSubtitle: 'Admin Console',
    pageTitle: 'EventCheck',
    fallbackColors: { primary: '#4F46E5', accent: '#4F46E5' },
    supportEmail: 'info@scago.ca',
  },
  gansid: {
    key: 'gansid',
    displayName: 'GANSID Congress',
    adminSubtitle: 'Congress Admin',
    pageTitle: 'GANSID Congress — Registration',
    logoImage: '/branding/gansid/mark.svg',
    fallbackColors: { primary: '#B3282D', accent: '#1E4A8C' },
    supportEmail: 'congress@inheritedblooddisorders.world',
  },
};

function resolveSiteKey(): SiteKey {
  const raw = import.meta.env.VITE_SITE ?? '';
  return raw === 'gansid' ? 'gansid' : 'scago';
}

export const CURRENT_SITE: SiteConfig = CONFIGS[resolveSiteKey()];
```

Note: the SCAGO `fallbackColors.primary` is set to the current `indigo-600` (`#4F46E5`) used by the admin sidebar accent — this keeps SCAGO visually identical. The `supportEmail` is a best guess; adjust to the real SCAGO support address during Task 6 CLAUDE.md edits if known.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npm test -- sites.test.ts`
Expected: 3 passing tests

- [ ] **Step 5: Type-check the module**

Run: `npx tsc --noEmit`
Expected: clean

---

### Task 3: Apply branding to document head + CSS variables

**Files:**
- Modify: `index.tsx`
- Modify: `index.css` (define CSS variables)

- [ ] **Step 1: Update `index.tsx` to apply site config to document head before mount**

Replace the entire contents of `index.tsx` with:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { CURRENT_SITE } from './config/sites';

// Apply per-site branding to the document before React mounts.
// Runtime settings from app_settings still override this at render time.
document.title = CURRENT_SITE.pageTitle;
document.documentElement.style.setProperty('--site-primary', CURRENT_SITE.fallbackColors.primary);
document.documentElement.style.setProperty('--site-accent', CURRENT_SITE.fallbackColors.accent);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Declare the CSS variables in `index.css`**

At the top of `index.css`, immediately after the `@import "tailwindcss";` line, insert:

```css
:root {
  --site-primary: #4F46E5;
  --site-accent: #4F46E5;
}
```

(The values match SCAGO's current indigo so there is no FOUC — the CSS default matches what `CURRENT_SITE` will set.)

- [ ] **Step 3: Build locally with default (SCAGO) to confirm no regression**

Run: `npm run build`
Expected: succeeds. Browser tab title shows "EventCheck".

- [ ] **Step 4: Build locally with GANSID to confirm title switches**

Run: `VITE_SITE=gansid npm run build` (on Windows PowerShell: `$env:VITE_SITE='gansid'; npm run build`; on Windows Git Bash: `VITE_SITE=gansid npm run build` works)

Expected: build succeeds.

- [ ] **Step 5: Serve the GANSID build and inspect**

Run: `VITE_SITE=gansid npm run preview`
Open the served URL. Expected: tab title is "GANSID Congress — Registration". Inspect `document.documentElement.style` in DevTools — `--site-primary` should be `#B3282D`.

Stop the preview (Ctrl-C).

---

### Task 4: Apply branding to the admin shell header

**Files:**
- Modify: `App.tsx` lines 250–274

- [ ] **Step 1: Import `CURRENT_SITE` at the top of `App.tsx`**

In `App.tsx`, add to the import block (group with the other relative imports, e.g. near the `./components/...` imports):

```typescript
import { CURRENT_SITE } from './config/sites';
```

- [ ] **Step 2: Replace the hardcoded header block**

Locate the block in `App.tsx` that currently reads (around lines 250–262):

```tsx
<div className="flex items-center gap-3 overflow-hidden">
  <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30 flex-shrink-0">
    <QrCode className="w-6 h-6 text-white" />
  </div>
  <div className={`transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
    <h1 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
      EventCheck
    </h1>
    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Admin Console</p>
  </div>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-3 overflow-hidden">
  <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30 flex-shrink-0">
    {CURRENT_SITE.logoImage ? (
      <img src={CURRENT_SITE.logoImage} alt={CURRENT_SITE.displayName} className="w-6 h-6 object-contain" />
    ) : (
      <QrCode className="w-6 h-6 text-white" />
    )}
  </div>
  <div className={`transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
    <h1 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
      {CURRENT_SITE.displayName}
    </h1>
    <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">{CURRENT_SITE.adminSubtitle}</p>
  </div>
</div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Run the dev server as SCAGO and visually verify unchanged appearance**

Run: `npm run dev`
Navigate to `http://localhost:5173/#/admin` (log in if needed). Expected: sidebar header shows the indigo square with QrCode icon, text "EventCheck / Admin Console" — **visually identical to main**.

Stop dev server (Ctrl-C).

---

### Task 5: Add GANSID branding assets + directory

**Files:**
- Create: `public/branding/gansid/mark.svg`
- Create: `public/branding/gansid/wordmark-2026.png`
- Create: `public/branding/gansid/hero-2026.png`
- Create: `public/branding/gansid/README.md`

**Manual asset step:** the three GANSID image files come from the attachments the user shared in brainstorming. The executing agent (or user) must save them into `public/branding/gansid/` with these exact filenames:
- `mark.svg` — the GANSID blood-drops mark (year-agnostic). If only a PNG is available, save as `mark.png` AND update `config/sites.ts` `logoImage` to `/branding/gansid/mark.png`.
- `wordmark-2026.png` — "GANSID CONGRESS 2026 / HYDERABAD INDIA" wordmark
- `hero-2026.png` — full banner with "Registration Now Open"

- [ ] **Step 1: Create the directory and save the three assets**

```bash
mkdir -p public/branding/gansid
# Then save the three image files into this directory (manual step)
```

- [ ] **Step 2: Create `public/branding/gansid/README.md`**

```markdown
# GANSID branding assets

- `mark.svg` — year-agnostic GANSID mark. Used as the admin shell logo.
- `wordmark-2026.png` — year-specific wordmark. Admin uploads this into
  `app_settings.email_header_logo` + `pdf_settings.logo` via Settings UI.
- `hero-2026.png` — optional banner for email headers and promotional pages.

When a new year's Congress starts, update the `-2026` assets alongside a fresh
`app_settings` upload. `mark.svg` does not need to change year-over-year.
```

- [ ] **Step 3: Verify assets are reachable**

Run: `npm run dev`
Open `http://localhost:5173/branding/gansid/mark.svg` in a browser.
Expected: the GANSID mark renders.

If Step 2 of Task 5 used `mark.png` instead of `mark.svg`, update `config/sites.ts` `logoImage` value accordingly and re-run Task 2 Step 4 to confirm tests still pass.

Stop dev server.

- [ ] **Step 4: Run the dev server as GANSID and verify the mark appears**

Run (Git Bash): `VITE_SITE=gansid npm run dev`
(PowerShell: `$env:VITE_SITE='gansid'; npm run dev`)

Navigate to `http://localhost:5173/#/admin` (log in). Expected: indigo square now renders the GANSID mark instead of the QrCode icon. Sidebar reads "GANSID Congress / Congress Admin".

Stop dev server.

---

### Task 6: Update CLAUDE.md with multi-site deployment section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Commands section**

Replace the existing Commands section (currently ending with a hard-coded `--project-ref iigbgbgakevcgilucvbs`) with a version that documents both project refs. Add after the existing Commands section:

```markdown
## Multi-site deployment

This repo powers two independent deployments from one `main` branch:

| Site | Netlify site | Supabase project-ref | VITE_SITE |
|------|--------------|----------------------|-----------|
| SCAGO (live) | scago.netlify.app (or custom domain) | `iigbgbgakevcgilucvbs` | `scago` |
| GANSID Congress | `gansidcongress.netlify.app` | `<GANSID_PROJECT_REF>` | `gansid` |

Design details: `docs/superpowers/specs/2026-04-15-multi-site-scaffold-design.md`

**Required env vars per Netlify site:**
- `VITE_SITE` (`scago` or `gansid`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYPAL_CLIENT_ID`
- `VITE_PAYPAL_ENV=live`

**Required Supabase secrets per project (both projects):**
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
- `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`
- `PAYPAL_MODE=production` (GANSID only — avoids Origin-based auto-detect for the new domain)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

**Critical rule:** every migration and edge-function deploy must be applied to BOTH project-refs. Example:

```bash
# SCAGO
supabase db push --project-ref iigbgbgakevcgilucvbs
supabase functions deploy verify-payment --project-ref iigbgbgakevcgilucvbs

# GANSID (replace <GANSID_PROJECT_REF> with the actual ref from the Supabase dashboard)
supabase db push --project-ref <GANSID_PROJECT_REF>
supabase functions deploy verify-payment --project-ref <GANSID_PROJECT_REF>
```

If a migration is applied to only one project, the shared codebase will break on the other site.
```

- [ ] **Step 2: Replace `<GANSID_PROJECT_REF>` with the real ref once Phase 2 Task 8 is complete**

(Defer this edit until after Phase 2 Task 8 creates the Supabase project. Add a TODO comment to yourself to come back.)

---

### Task 7: Commit Phase 1 code changes

- [ ] **Step 1: Run the full test suite + type-check + both builds**

```bash
npm test
npx tsc --noEmit
npm run build
VITE_SITE=gansid npm run build
```

Expected: all pass.

- [ ] **Step 2: Review the diff**

```bash
git status
git diff --stat
```

Expected files changed:
- `env.d.ts`
- `index.tsx`
- `index.css`
- `App.tsx`
- `CLAUDE.md`
- new: `config/sites.ts`, `tests/sites.test.ts`, `public/branding/gansid/*`

- [ ] **Step 3: Commit**

```bash
git add env.d.ts index.tsx index.css App.tsx CLAUDE.md config/sites.ts tests/sites.test.ts public/branding/gansid/
git commit -m "$(cat <<'EOF'
feat(multi-site): add site-config scaffold for dual-deployment support

Introduces config/sites.ts + VITE_SITE env var to support a second
Netlify deployment (GANSID Congress) backed by its own Supabase project,
without schema changes. SCAGO visual appearance preserved (displayName
stays 'EventCheck', QrCode icon fallback retained when logoImage absent).

Per docs/superpowers/specs/2026-04-15-multi-site-scaffold-design.md.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push branch for preview builds**

```bash
git push -u origin feat/multi-site-scaffold
```

---

## Phase 2 — Supabase project B (GANSID backend)

All tasks in this phase are against the NEW Supabase project only. Project A (SCAGO `iigbgbgakevcgilucvbs`) is untouched.

### Task 8: Create the GANSID Supabase project

- [ ] **Step 1: In the Supabase dashboard, create a new project**

- Organization: same as SCAGO (or a separate one if the user prefers — confirm before creating)
- Project name: `gansid-congress`
- Database password: generate a strong one, save to password manager
- Region: `ap-south-1` (Mumbai — close to Hyderabad)
- Pricing plan: match SCAGO's plan unless otherwise specified

- [ ] **Step 2: Capture credentials**

From the new project's Settings → API page, copy:
- Project URL (goes into Netlify as `VITE_SUPABASE_URL`)
- `anon` / publishable key (goes into Netlify as `VITE_SUPABASE_ANON_KEY`)
- `service_role` key (kept for CLI use only — never commit)
- Project Ref (the short string in the URL, e.g. `abcdxyz123`)

Save to a secure note. Export the project ref as an env var for convenience:

```bash
export GANSID_REF="<the-project-ref>"
```

- [ ] **Step 3: Verify CLI auth**

```bash
supabase projects list
```

Expected: the new GANSID project appears in the list.

---

### Task 9: Apply existing migrations to project B

- [ ] **Step 1: Link the local repo to the GANSID project**

```bash
cd "c:/Users/devel/OneDrive/Documents/RethinkReality/eventcheck---qr-event-management"
supabase link --project-ref "$GANSID_REF"
```

Expected: prompts for DB password (from Task 8). On success: `Finished supabase link.`

- [ ] **Step 2: Push all migrations**

```bash
supabase db push
```

Expected: applies every file in `supabase/migrations/` in order. Ends with `Finished supabase db push.`

- [ ] **Step 3: Verify the schema**

```bash
supabase db remote commit --dry-run
```

Or via dashboard → Database → Tables, confirm the following tables exist: `forms`, `attendees`, `app_settings`, `sponsor_prospects`, plus any seating tables.

Also verify the singleton constraint:

```sql
-- Run in Supabase SQL editor
SELECT id FROM app_settings;
```

Expected: zero or one row. (The migration may auto-seed a row; if not, Task 12 will.)

- [ ] **Step 4: Re-link back to SCAGO to avoid accidental project-A operations from a stale link**

```bash
supabase link --project-ref iigbgbgakevcgilucvbs
```

From now on, any project-B work uses explicit `--project-ref "$GANSID_REF"` flags.

---

### Task 10: Deploy edge functions to project B

- [ ] **Step 1: Deploy `verify-payment`**

```bash
supabase functions deploy verify-payment --project-ref "$GANSID_REF"
```

Expected: `Deployed Function verify-payment`

- [ ] **Step 2: Deploy `send-ticket-email`**

```bash
supabase functions deploy send-ticket-email --project-ref "$GANSID_REF"
```

Expected: `Deployed Function send-ticket-email`

- [ ] **Step 3: List functions to verify**

```bash
supabase functions list --project-ref "$GANSID_REF"
```

Expected: both functions appear.

---

### Task 11: Set secrets on project B

All commands in this task use `--project-ref "$GANSID_REF"`. **Do not run without that flag — it would mutate SCAGO.**

- [ ] **Step 1: Set PayPal secrets**

Request GANSID's PayPal business account credentials from the user. Set all four:

```bash
supabase secrets set \
  PAYPAL_CLIENT_ID=<gansid-live-client-id> \
  PAYPAL_CLIENT_SECRET=<gansid-live-secret> \
  PAYPAL_SANDBOX_CLIENT_ID=<gansid-sandbox-client-id> \
  PAYPAL_SANDBOX_CLIENT_SECRET=<gansid-sandbox-secret> \
  PAYPAL_MODE=production \
  --project-ref "$GANSID_REF"
```

`PAYPAL_MODE=production` overrides the edge function's Origin-based auto-detect. See `supabase/functions/verify-payment/index.ts` line 445 — `paypalMode === 'production'` short-circuits to `useSandbox=false`. This is essential because the new `gansidcongress.netlify.app` domain isn't in the auto-detect allow list and missing/unknown origins would otherwise hit production anyway, but making it explicit removes ambiguity.

- [ ] **Step 2: Set SMTP secrets**

Request GANSID's SMTP credentials (host, port, auth user, auth pass). The edge function reads exactly these keys (`supabase/functions/send-ticket-email/index.ts:85-88`):

```bash
supabase secrets set \
  SMTP_HOST=<host> \
  SMTP_PORT=587 \
  SMTP_USER=<auth-user> \
  SMTP_PASS=<auth-pass> \
  --project-ref "$GANSID_REF"
```

- [ ] **Step 3: List secrets to verify (values are masked)**

```bash
supabase secrets list --project-ref "$GANSID_REF"
```

Expected: all five PayPal keys, four SMTP keys, plus the auto-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

### Task 12: Seed the `app_settings` row on project B

- [ ] **Step 1: Check whether migrations already seeded a row**

In the Supabase dashboard → SQL editor (GANSID project):

```sql
SELECT * FROM app_settings;
```

- If **one row** exists with `id=1`, skip to Step 2 (UPDATE).
- If **zero rows**, use INSERT in Step 2.

- [ ] **Step 2: Seed or update the row with GANSID defaults**

Run in the SQL editor. If the row does not exist:

```sql
INSERT INTO app_settings (
  id,
  currency,
  ticket_price,
  email_header_logo,
  email_subject,
  email_body_template,
  email_footer_text
) VALUES (
  1,
  'USD',
  0,
  '/branding/gansid/wordmark-2026.png',
  'Your GANSID Congress 2026 registration',
  '<p>Hello {{name}},</p><p>Your registration for the GANSID Congress 2026 (Oct 23–25, Hyderabad) is confirmed. Your ticket is attached.</p>',
  'GANSID Congress 2026 · congress@inheritedblooddisorders.world'
);
```

If the row already exists:

```sql
UPDATE app_settings SET
  currency = 'USD',
  email_header_logo = '/branding/gansid/wordmark-2026.png',
  email_subject = 'Your GANSID Congress 2026 registration',
  email_body_template = '<p>Hello {{name}},</p><p>Your registration for the GANSID Congress 2026 (Oct 23–25, Hyderabad) is confirmed. Your ticket is attached.</p>',
  email_footer_text = 'GANSID Congress 2026 · congress@inheritedblooddisorders.world'
WHERE id = 1;
```

- [ ] **Step 3: Verify the row**

```sql
SELECT id, currency, email_subject, email_footer_text FROM app_settings;
```

Expected: one row, GANSID values.

Note: all sponsor-related and PDF-specific fields are left NULL/default. The GANSID admin will flesh those out via the Settings UI after Phase 1 ships, because email templates / PDF templates are content decisions that belong to them, not to this scaffolding plan.

---

## Phase 3 — Netlify site B + cutover

### Task 13: Create the GANSID Netlify site pointing at the feature branch

- [ ] **Step 1: Create the Netlify site**

In the Netlify dashboard:
- Click "Add new site" → "Import an existing project"
- Choose the same git repo
- Branch to deploy: `feat/multi-site-scaffold` (NOT `main` — this is the preview phase)
- Site name: `gansidcongress` (this gives the `gansidcongress.netlify.app` URL)
- Build command: `npm run build`
- Publish directory: `dist`

- [ ] **Step 2: Set site-scoped environment variables**

In the new site's Site Settings → Build & Deploy → Environment:

| Key | Value |
|-----|-------|
| `VITE_SITE` | `gansid` |
| `VITE_SUPABASE_URL` | (GANSID project URL from Task 8) |
| `VITE_SUPABASE_ANON_KEY` | (GANSID anon key from Task 8) |
| `VITE_PAYPAL_CLIENT_ID` | (GANSID live PayPal client ID) |
| `VITE_PAYPAL_ENV` | `live` |

- [ ] **Step 3: Trigger a deploy and confirm**

Netlify should auto-deploy after setting env vars. If not, click "Trigger deploy" → "Deploy site".

Expected: deploy succeeds, site available at `https://gansidcongress.netlify.app`.

---

### Task 14: Preflight SCAGO — add `VITE_SITE=scago` with no code change

Goal: confirm that adding `VITE_SITE` to the SCAGO site doesn't break anything BEFORE merging new code.

- [ ] **Step 1: Add env var to the SCAGO Netlify site**

In the SCAGO site's Environment settings, add:

| Key | Value |
|-----|-------|
| `VITE_SITE` | `scago` |

- [ ] **Step 2: Trigger a redeploy of SCAGO's current `main`**

The deploy runs against unchanged code (pre-merge), so `VITE_SITE` is simply ignored. This is a sanity check that the env var itself doesn't break the build.

Expected: deploy succeeds, site remains visually and functionally identical.

- [ ] **Step 3: Spot-check SCAGO**

Open the live SCAGO URL. Log in to admin. Check that:
- Sidebar still shows "EventCheck / Admin Console"
- Attendee list loads
- Settings page loads
- Current live form is unchanged

---

### Task 15: Preview-phase smoke verification on GANSID

Run verification steps D1–D3 from the spec against `gansidcongress.netlify.app`.

- [ ] **D1: Admin login**

- Navigate to `https://gansidcongress.netlify.app/#/admin`
- Create an admin user in the GANSID Supabase (Dashboard → Authentication → Users → Add user)
- Log in with that user
- Expected: land on the GANSID-branded admin (sidebar says "GANSID Congress / Congress Admin", GANSID mark visible). No SCAGO attendees or forms are visible (DB is isolated).

- [ ] **D2: Settings page loads and saves**

- Open Settings
- Verify `app_settings` loads with the values seeded in Task 12
- Change the email subject to a throwaway value, save
- Reload, confirm it persisted
- Revert the change

- [ ] **D3: End-to-end test registration**

- Create a minimal test form in the form builder (a single Full Name + Email field, one $1 ticket)
- Open its public URL
- Complete a sandbox-PayPal purchase (use a sandbox PayPal account)
- Expected: attendee record created in GANSID Supabase, ticket PDF generated, confirmation email sent from GANSID's SMTP
- Check `attendees` table in GANSID Supabase — new row exists
- Check `attendees` table in SCAGO Supabase — no new row (confirms isolation)

If any of D1–D3 fail, STOP and debug before proceeding to Task 16. Do not merge the branch until all three pass.

---

### Task 16: Merge to `main`

- [ ] **Step 1: Open a pull request**

```bash
gh pr create --title "feat(multi-site): Phase 1 scaffold for dual-deployment (SCAGO + GANSID)" --body "$(cat <<'EOF'
## Summary
- Adds config/sites.ts + VITE_SITE env var for per-site branding
- Parameterizes admin shell header (displayName + optional logoImage)
- Adds GANSID branding assets under public/branding/gansid/
- Updates CLAUDE.md with multi-site deployment section

No schema changes. No edge-function source changes. SCAGO visual appearance preserved.

Design: docs/superpowers/specs/2026-04-15-multi-site-scaffold-design.md
Plan: docs/superpowers/plans/2026-04-15-multi-site-scaffold.md

## Test plan
- [x] Unit tests pass: `npm test`
- [x] Type check: `npx tsc --noEmit`
- [x] Build as SCAGO: `npm run build`
- [x] Build as GANSID: `VITE_SITE=gansid npm run build`
- [x] GANSID preview deploy passed D1–D3 smoke tests
- [x] SCAGO preflight with VITE_SITE=scago passed (Task 14)
EOF
)"
```

- [ ] **Step 2: Review + merge**

- User reviews the PR
- Merge via GitHub (squash or merge — match existing repo convention, check `git log --oneline -20` main to see which is used)

Do NOT force-merge. If CI fails, stop and fix the underlying issue.

- [ ] **Step 3: Confirm both sites auto-deploy from `main`**

- SCAGO Netlify: auto-deploys, check the deploy log for success
- GANSID Netlify: still pointing at `feat/multi-site-scaffold` branch — will NOT auto-deploy from main yet. That's Task 18.

---

### Task 17: Post-merge verification (D4 + D5)

- [ ] **D4: SCAGO regression check on main**

Open the live SCAGO URL. Log in. Verify:
- Sidebar still "EventCheck / Admin Console" (unchanged)
- Live gala attendee list loads, no differences in data or column ordering
- Sponsor dashboard loads (if applicable)
- Settings page loads unchanged
- Open one existing attendee record, confirm ticket PDF still generates
- If possible, perform a sandbox test registration and confirm the email sends from SCAGO's SMTP

- [ ] **D5: No cross-contamination between sites**

- In SCAGO admin, note an existing sponsor prospect's name/email
- In GANSID admin (still running on preview branch at this point), open the sponsor prospects view — confirm that prospect does NOT appear
- In GANSID admin, create a throwaway sponsor prospect
- In SCAGO admin, confirm that throwaway prospect does NOT appear
- Delete the throwaway prospect from GANSID

---

### Task 18: Repoint GANSID Netlify site from feature branch to `main`

- [ ] **Step 1: Change the production branch**

In the GANSID Netlify site's Site Settings → Build & Deploy → Continuous Deployment → Production branch, change from `feat/multi-site-scaffold` to `main`.

- [ ] **Step 2: Trigger a deploy from main**

Click "Trigger deploy" → "Deploy site". This builds from `main` against the GANSID env vars.

- [ ] **Step 3: Re-run D1 (quickest smoke test) on the main deploy**

- Open `https://gansidcongress.netlify.app/#/admin`, log in, confirm GANSID branding + isolation still work.

- [ ] **Step 4: Delete the feature branch**

```bash
git checkout main
git pull
git branch -d feat/multi-site-scaffold
git push origin --delete feat/multi-site-scaffold
```

---

### Task 19: Update CLAUDE.md with the real GANSID project-ref

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace `<GANSID_PROJECT_REF>` in CLAUDE.md**

Find-and-replace all instances of `<GANSID_PROJECT_REF>` in `CLAUDE.md` with the actual ref from Task 8.

- [ ] **Step 2: Commit directly to main**

This is a doc-only change and the scaffold is already deployed:

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record GANSID Supabase project-ref in CLAUDE.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

---

## Definition of done

All the following pass:

- `npm test` green
- `npx tsc --noEmit` clean
- `npm run build` succeeds (SCAGO)
- `VITE_SITE=gansid npm run build` succeeds (GANSID)
- `gansidcongress.netlify.app` loads with GANSID branding, admin login works, Settings persists, end-to-end test registration completes (attendee → PayPal sandbox → PDF → email)
- SCAGO live site loads identically to pre-merge appearance, live gala data intact, end-to-end flow still works
- No cross-contamination between the two Supabase projects (data created in one does not appear in the other)
- CLAUDE.md documents both project-refs and the per-site secrets/env-var contract
- `feat/multi-site-scaffold` branch deleted

## Not done here (explicit — to be covered in Phase 2 spec)

See spec's "Out of scope for Phase 1" section. Do not creep any of these features into this plan.
