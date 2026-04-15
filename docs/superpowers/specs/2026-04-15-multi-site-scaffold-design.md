# Multi-Site Scaffold — Phase 1

**Date:** 2026-04-15
**Status:** Design approved, ready for implementation plan
**Scope:** Phase 1 only. Phase 2 (GANSID-specific form features) is a follow-up spec.

## Background

EventCheck is currently a single-tenant platform. The live SCAGO Hope Gala event is actively in use. A second organization — GANSID (Global Alliance on Sickle Cell & Inherited Blood Disorders) — needs to run their 2026 Congress on the same platform without disturbing the SCAGO deployment, and under a completely separate admin team with no cross-visibility.

The current codebase assumes:
- A single Supabase project (`iigbgbgakevcgilucvbs`, hard-coded in CLAUDE.md)
- A single Netlify site
- A global `app_settings` singleton row (enforced by a `check (id = 1)` constraint) holding PayPal, SMTP, email templates, PDF settings, branding
- A single set of PayPal + SMTP credentials via edge-function env vars
- No `organization_id` / `tenant_id` columns anywhere
- `"Allow all"` RLS policies — auth exists but is not org-scoped

A true multi-tenant refactor (org_id on every table, role-based RLS, per-org settings rows, auth context refactor) is the right long-term answer but is too invasive to ship quickly alongside a live event.

## Approach: shared code, separate backends

One git repo, two Netlify sites, two Supabase projects. Each Netlify site has its own `VITE_SUPABASE_URL`, `VITE_PAYPAL_CLIENT_ID`, and `VITE_SITE` env var. Each Supabase project has its own PayPal + SMTP secrets and its own `app_settings` singleton row.

Isolation is at the infrastructure layer, not the row layer. The schema stays single-tenant. Two Supabase projects means two independent databases — zero cross-contamination possible.

Maintainability: `git push` still deploys to both sites. Bug fixes, new features, edge function updates land on both.

### Alternatives considered

- **Full fork (duplicate repo + Supabase):** fastest to ship, but creates two diverging codebases requiring double maintenance forever. Rejected.
- **True multi-tenant refactor (org_id everywhere, per-org RLS, role tables):** correct long-term, but invasive schema and auth work on a live production database. Rejected for this phase; may revisit if a third org arrives.

## Architecture

```
           ┌──────────────── git repo (single main branch) ────────────────┐
           │                                                                │
           │   components/   services/   utils/   supabase/functions/       │
           │   config/sites.ts (new)   public/branding/{scago,gansid}/      │
           │                                                                │
           └───────────┬─────────────────────────────────┬──────────────────┘
                       │                                 │
               Netlify site A                     Netlify site B
           (existing — SCAGO)                    (new — gansidcongress)
                       │                                 │
             VITE_SITE=scago                     VITE_SITE=gansid
             VITE_SUPABASE_URL=A                 VITE_SUPABASE_URL=B
             VITE_SUPABASE_ANON_KEY=A            VITE_SUPABASE_ANON_KEY=B
             VITE_PAYPAL_CLIENT_ID=A             VITE_PAYPAL_CLIENT_ID=B
                       │                                 │
                       ▼                                 ▼
            Supabase project A                 Supabase project B
         (iigbgbgakevcgilucvbs)                    (new, TBD ref)
         Secrets: PAYPAL_*, SMTP_*             Secrets: PAYPAL_*, SMTP_*,
                                                         PAYPAL_MODE=production
                       │                                 │
         ┌─────────────┴────────────┐      ┌─────────────┴────────────┐
         │ Existing tables as-is    │      │ Fresh clone of schema    │
         │ No schema changes        │      │ + RLS + edge functions   │
         │ app_settings singleton = │      │ app_settings singleton = │
         │   SCAGO branding         │      │   GANSID branding        │
         └──────────────────────────┘      └──────────────────────────┘
```

## New code

### `config/sites.ts`

Single source of truth for per-site build-time defaults. Runtime settings (PayPal creds, email templates, uploaded logo) stay in `app_settings` where they already live.

```ts
export type SiteKey = 'scago' | 'gansid'

export interface SiteConfig {
  key: SiteKey
  displayName: string
  pageTitle: string
  fallbackLogo: string
  fallbackColors: { primary: string; accent: string }
  supportEmail: string
}

const CONFIGS: Record<SiteKey, SiteConfig> = {
  scago: {
    key: 'scago',
    displayName: 'SCAGO',
    pageTitle: 'SCAGO — Event Registration',
    fallbackLogo: '/branding/scago/mark.svg',
    // Actual SCAGO brand colors + support email to be read from the current
    // deployment's app_settings row and hard-coded here as fallbacks during implementation.
    fallbackColors: { primary: '/* TBD during impl */', accent: '/* TBD */' },
    supportEmail: '/* TBD during impl */',
  },
  gansid: {
    key: 'gansid',
    displayName: 'GANSID Congress',
    pageTitle: 'GANSID Congress — Registration',
    fallbackLogo: '/branding/gansid/mark.svg',
    fallbackColors: { primary: '#B3282D', accent: '#1E4A8C' },
    supportEmail: 'congress@inheritedblooddisorders.world',
  },
}

export const CURRENT_SITE: SiteConfig =
  CONFIGS[(import.meta.env.VITE_SITE ?? 'scago') as SiteKey]
```

Default to `'scago'` when `VITE_SITE` is missing — belt-and-suspenders so the live SCAGO site can't accidentally render as GANSID if the env var is forgotten.

### Branding assets

```
public/branding/
  scago/
    mark.svg            existing SCAGO logo (relocated or symlinked)
  gansid/
    mark.svg            the blood-drops icon (generic, year-agnostic)
    wordmark-2026.png   "GANSID Congress 2026 / Hyderabad" wordmark
    hero-2026.png       full banner for email/PDF headers
```

Generic GANSID `mark.svg` is the site-level shell branding (admin header, loading state, fallback before `app_settings` loads). The year-specific `wordmark-2026.png` is uploaded by the GANSID admin into `app_settings.pdfSettings.logo` + email template headers via the existing Settings UI — so next year's congress swaps branding without a code change.

## Modified code

- **`App.tsx` / `main.tsx`** — import `CURRENT_SITE`, set `document.title = CURRENT_SITE.pageTitle`, apply `fallbackColors.primary` / `fallbackColors.accent` as CSS variables until `app_settings` loads
- **Admin shell header** — render `CURRENT_SITE.displayName` + `CURRENT_SITE.fallbackLogo`
- **`CLAUDE.md`** — new "Multi-site deployment" section documenting both project-refs, the `VITE_SITE` env var contract, the per-site secrets list, and the rule that migrations must be applied to both project-refs

## Unchanged code

- Table schemas (no `org_id`, no new columns)
- RLS policies (stay "allow all" as today — separate hardening effort if ever undertaken)
- Edge function source (`verify-payment`, `send-ticket-email`) — same source, deployed twice
- `types.ts`
- Form builder, public registration component, PDF generator, sponsor flow, email templates
- `services/storageService.ts` / `services/supabaseClient.ts` — already read from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## Setup flow

### A. Supabase project B (GANSID backend)

1. Create Supabase project in `ap-south-1` (close to Hyderabad)
2. Record `project-ref`; add to CLAUDE.md
3. `supabase db push --project-ref <new-ref>` to apply all existing migrations
4. Deploy edge functions: `supabase functions deploy verify-payment --project-ref <new-ref>` and `... send-ticket-email ...`
5. Set secrets via `supabase secrets set ... --project-ref <new-ref>`:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (GANSID live PayPal)
   - `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET` (GANSID sandbox)
   - `PAYPAL_MODE=production` — overrides auto-detect, avoids needing to edit the Origin-based detection in the edge function
   - SMTP secrets for GANSID mail account — use the same secret key names that `supabase/functions/send-ticket-email/index.ts` reads today (to be read off during implementation; do not hard-code names here)
6. Seed initial `app_settings` row — GANSID branding, email templates (copy from project A as starting point, then edit), logo pointing at `wordmark-2026.png`

### B. Repo changes (single PR on branch `feat/multi-site-scaffold`)

1. Add `config/sites.ts` with both site entries
2. Add `public/branding/gansid/` assets (mark.svg, wordmark-2026.png, hero-2026.png)
3. Move existing SCAGO logo asset into `public/branding/scago/` (update any `<img>` / CSS references to the new path)
4. Wire `CURRENT_SITE` into `App.tsx` + admin shell
5. Verify both `VITE_SITE=scago npm run build` and `VITE_SITE=gansid npm run build` succeed locally
6. Update CLAUDE.md with multi-site deployment section

### C. Netlify site B (GANSID frontend)

1. Create new Netlify site, connect to same git repo, `main` branch
2. Set site-scoped env vars:
   - `VITE_SITE=gansid`
   - `VITE_SUPABASE_URL` = project B URL
   - `VITE_SUPABASE_ANON_KEY` = project B anon key
   - `VITE_PAYPAL_CLIENT_ID` = GANSID live PayPal client ID
   - `VITE_PAYPAL_ENV=live`
3. Confirm site resolves at `gansidcongress.netlify.app`
4. On the existing SCAGO Netlify site, add `VITE_SITE=scago` env var

### D. Smoke verification

1. **GANSID admin login** — `gansidcongress.netlify.app`, log in, land on GANSID-branded admin, confirm no SCAGO data visible
2. **GANSID Settings** — open Settings, confirm `app_settings` loads from project B; edit primary color, verify persists and does not appear on SCAGO site
3. **GANSID golden path** — build a minimal test form in admin, open the public URL, complete a sandbox-PayPal registration, receive ticket PDF + email
4. **SCAGO regression** — load SCAGO site, confirm live gala form, attendee list, sponsor dashboard, and Settings are visually and functionally unchanged
5. **No cross-contamination** — create a sponsor prospect in SCAGO admin, confirm it does NOT appear in GANSID admin; reverse check

### Order of operations (minimize SCAGO risk)

1. All repo work on `feat/multi-site-scaffold` branch. Do not merge.
2. Create Supabase project B (touches nothing of SCAGO)
3. Create Netlify site B, point at `feat/multi-site-scaffold` branch for a preview deploy
4. Run verification D1–D3 on the preview
5. On SCAGO Netlify site, set `VITE_SITE=scago` and redeploy current main (no code change yet — just confirms old code ignores the new env var)
6. Merge `feat/multi-site-scaffold` to main. Both sites auto-deploy. Run verification D4 + D5.
7. Repoint GANSID Netlify site from preview branch to `main`

## Risks & mitigations

- **SCAGO renders as GANSID after merge.** Mitigated by setting `VITE_SITE=scago` on the SCAGO Netlify site before merging (step C4) AND by the `'scago'` default in `config/sites.ts`.
- **PayPal sandbox/prod misdetection.** The existing `verify-payment` edge function detects env via `Origin` header. Adding a new production domain would otherwise require code changes. Mitigated by setting `PAYPAL_MODE=production` as a project-B secret — the env var overrides the auto-detect.
- **Schema drift between projects.** If a future migration is applied to A but not B, the shared codebase breaks on one site. Mitigated by a CLAUDE.md rule that every `supabase db push` command be run against both project-refs, listed side-by-side.
- **Missing branding assets.** Phase 1 blocks on three GANSID assets in `public/branding/gansid/`. The user has provided PNGs; commit as-is, optionally replace with SVG exports later.

## Rollback plan

- **GANSID-only issue:** disable the GANSID Netlify site. SCAGO unaffected.
- **Merge breaks SCAGO:** `git revert` the merge commit; Netlify redeploys the prior working build. Project B remains inert until reattempted.
- **No database rollback needed** — project A schema is untouched.

## Out of scope for Phase 1 (deferred to Phase 2)

Captured here so the scope boundary is explicit. Each of these will be its own design discussion:

- Date-bracket pricing schedules (Early Bird / Regular / On-site with automatic date-based switching)
- Geographic tier pricing (country → Tier 1 / Tier 2 lookup)
- Inline group registration mode (purchaser-side branch where all N registrants are entered upfront instead of via ref-link)
- Exhibitor form + staff roster (tier-driven quotas: Platinum 12+6, Gold 8+4, Silver 6+3, Bronze 4+2; staff invitation flow; optional add-on m² pricing)
- Trimmed staff form variant (individual form minus presenting / networking questions, pre-filled with exhibitor context)
- Admin dashboard tabs by registration type (attendees vs exhibitors; exhibitor rows expandable to show registered / unclaimed staff)
- Form-builder field additions audit (multiselect, country dropdown, consent checkbox groups — may or may not already exist)
- Optional add-on tickets post-registration (e.g. $50 Networking Reception) with conditional pricing line items
- RLS hardening to replace "allow all" policies with role-scoped policies

## Definition of done

All five verification steps (D1–D5) pass. `feat/multi-site-scaffold` is merged to `main`. Both Netlify sites deploy from `main` and resolve to their distinct branded admin UIs. CLAUDE.md documents the multi-site model. No schema changes landed on Supabase project A.
