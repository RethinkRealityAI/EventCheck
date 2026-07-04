# GANSID Content CMS + Early-Bird Pricing Pill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give GANSID admins a full-width admin CMS (with ~90%-viewport iframe live preview) to edit the landing page, the portal (announcements + sidebar links), and an early-bird pricing promo — all without a code deploy, persisted as JSONB.

**Architecture:** A new `site_content` (JSONB) table + `siteContentService` + a `ContentProvider` React context feed the existing landing/portal components (which get refactored to read content from context, defaulting to today's hardcoded `content.tsx`). A new `/admin/content` route hosts section editors; "Preview" opens a shared `IframeViewer` modal that renders the real routes in preview mode via `postMessage`. Announcements gain additive columns (CTA/color/mode). The early-bird pill is a shared `PromoPrice` component driven by one config, rendered in both the landing fees table and the checkout selector — presentation only, no edge-function changes.

**Tech Stack:** React 18 + TS + Vite, Tailwind v4 (`gansid-*` utilities), Supabase (Postgres + RLS + Storage), Vitest. New dep: `dompurify`.

**Tenancy:** GANSID-only for landing/portal (SCAGO has `portalEnabled:false`). Migrations still apply to BOTH tenants for schema parity (§15/§16). SCAGO via MCP, GANSID via CLI.

---

## File Structure

**New files:**
- `supabase/migrations/<ts>_add_site_content.sql` — table + RLS
- `supabase/migrations/<ts>_extend_announcements_cms.sql` — additive columns
- `services/siteContentService.ts` — get/save + typed mappers + default-merge
- `components/Portal/content/ContentProvider.tsx` — context, merge, preview/draft mode
- `components/Portal/content/landingDefaults.ts` — typed defaults (migrated from `content.tsx`)
- `components/Portal/ui/IframeViewer.tsx` — 90vw/90vh modal iframe (portalled)
- `components/ContentCms/ContentCms.tsx` — shell + sub-tabs + Publish/Discard/Preview
- `components/ContentCms/LandingEditor.tsx` — landing section cards
- `components/ContentCms/PortalEditor.tsx` — announcements + sidebar links
- `components/ContentCms/PricingFeesEditor.tsx` — fees table + early-bird config
- `components/ContentCms/fields/` — `PlainField.tsx`, `RichField.tsx`, `StringListField.tsx`, `RepeaterField.tsx`, `ColorField.tsx` (shared editor primitives)
- `components/Pricing/PromoPrice.tsx` — shared badge + strikethrough
- `utils/pricingPromo.ts` — pure promo helpers
- `utils/sanitizeHtml.ts` — DOMPurify wrapper
- `tests/pricingPromo.test.ts`, `tests/siteContent.test.ts`, `tests/announcementMapper.test.ts`

**Modified:**
- `types.ts` — content + config types; extend `Announcement`
- `App.tsx` — `/admin/content` route + provider mount + preview param handling
- `utils/adminPermissions.ts` — `content` page key
- `components/Portal/Landing/content.tsx` — re-export from `landingDefaults` (keep import path stable)
- `components/Portal/Landing/{HeroSection,InfoTabs,FeesSection,RegistrationOverview}.tsx` — read from context
- `components/Portal/Dashboard/{AnnouncementsFeed,QuickLinks}.tsx` — read from context, CTA/iframe
- `services/announcementService.ts` — mapper + create/update + list filter
- `components/Pricing/{LivePriceCategory,RunningTotal}.tsx` — promo pill
- `components/RichTextEditor.tsx` — optional `toolbar` prop
- `components/Settings.tsx` — drop the `announcements` tab (retired)
- `CLAUDE.md` — §19 + affected sections

---

## Phase 0 — Dependency

### Task 0: Add DOMPurify

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

Run: `npm install dompurify@^3 && npm install -D @types/dompurify`
Expected: added to dependencies, no peer errors.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dompurify for CMS rich-text sanitization"
```

---

## Phase 1 — Database migrations

> Author the SQL now; APPLY to tenants in Phase 12 (right before merge). Filenames use a real `YYYYMMDDHHMMSS`.

### Task 1: `site_content` table + RLS

**Files:** Create `supabase/migrations/<ts>_add_site_content.sql`

- [ ] **Step 1: Write the migration**

```sql
-- site_content: JSONB-per-page CMS store. Public-read (landing is public),
-- admin-write. Decoupled from app_settings (avoids the monolithic saveSettings
-- explicit-column trap). Policies reference only auth.uid()/role — never
-- subquery site_content itself (§16 rule #13).
create table if not exists public.site_content (
  site       text not null,
  page       text not null,
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (site, page)
);

alter table public.site_content enable row level security;

-- Public read (anon + authenticated). Content holds no secrets.
drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content
  for select using (true);

-- Admin write via the existing helper (used by imported_contacts RLS).
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content
  for all using (public.is_portal_admin()) with check (public.is_portal_admin());
```

- [ ] **Step 2: Lint**

Run: `npm run lint:migrations`
Expected: PASS (has `IF NOT EXISTS`, no recursion, no undocumented destructive op).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_add_site_content.sql
git commit -m "feat(db): site_content JSONB table + public-read/admin-write RLS"
```

### Task 2: Extend `announcements`

**Files:** Create `supabase/migrations/<ts>_extend_announcements_cms.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Additive columns for CMS announcements: CTA, accent color, style, schedule.
alter table public.announcements
  add column if not exists cta_label   text,
  add column if not exists cta_url      text,
  add column if not exists cta_mode     text not null default 'none',
  add column if not exists accent_color text,
  add column if not exists style        text not null default 'card',
  add column if not exists starts_at    timestamptz,
  add column if not exists ends_at      timestamptz;

-- Guard the enum-ish columns.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_cta_mode_check') then
    alter table public.announcements
      add constraint announcements_cta_mode_check check (cta_mode in ('none','link','iframe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'announcements_style_check') then
    alter table public.announcements
      add constraint announcements_style_check check (style in ('card','banner'));
  end if;
end $$;
```

- [ ] **Step 2: Lint + Commit**

Run: `npm run lint:migrations` → PASS

```bash
git add supabase/migrations/*_extend_announcements_cms.sql
git commit -m "feat(db): additive announcement CMS columns (cta/accent/style/schedule)"
```

---

## Phase 2 — Types + defaults

### Task 3: Content + promo types; extend `Announcement`

**Files:** Modify `types.ts`

- [ ] **Step 1: Add the types** (near the existing `Announcement` and pricing types)

```ts
// ---- CMS content ----
export interface RegistrationStep { id: string; number: string; title: string; bodyHtml: string; }
export interface Faq { id: string; question: string; answerHtml: string; }

export interface FeesPeriod { id: string; label: string; subtitle: string; }
export interface FeesRow { category: string; [periodId: string]: string | number; } // prices keyed by period id
export interface FeesTier { id: string; label: string; subtitle: string; rows: FeesRow[]; }
export interface FeesContent { note: string; periods: FeesPeriod[]; tiers: FeesTier[]; }

export type PromoColorPreset = 'gansid-red' | 'gansid-blue' | 'save-green' | 'amber' | 'custom';
export interface PricingPromoConfig {
  enabled: boolean;
  label: string;
  colorPreset: PromoColorPreset;
  customBg?: string;
  customText?: string;
  promoPeriodId: string;
  comparePeriodId: string;
  categories: 'all' | string[];
  endDate?: string | null;
  showCountdown?: boolean;
}

export interface LandingContent {
  hero: { eyebrow: string; badge: string; location: string; dates: string; venue: string; introHtml: string; ctaLabel: string; imageUrl?: string | null; };
  registrationProcess: RegistrationStep[];
  importantNoticeHtml: string;
  groupNoteHtml: string;
  includes: string[];
  notIncluded: string[];
  faqs: Faq[];
  supportEmail: string;
  fees: FeesContent;
  pricingPromo: PricingPromoConfig;
}

export type SidebarLinkMode = 'link' | 'iframe' | 'soon';
export interface SidebarLink { id: string; label: string; description?: string; icon?: string; mode: SidebarLinkMode; href?: string; }
export interface PortalContent {
  intro?: { heading?: string; subheadingHtml?: string };
  sidebarLinks: SidebarLink[];
}
```

- [ ] **Step 2: Extend the existing `Announcement` interface**

Find `export interface Announcement { ... }` and add:

```ts
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaMode?: 'none' | 'link' | 'iframe';
  accentColor?: string | null;
  style?: 'card' | 'banner';
  startsAt?: string | null;
  endsAt?: string | null;
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add types.ts
git commit -m "feat(types): CMS content, pricing promo, extended Announcement"
```

### Task 4: Landing defaults module

**Files:** Create `components/Portal/content/landingDefaults.ts`; Modify `components/Portal/Landing/content.tsx`

- [ ] **Step 1: Create `landingDefaults.ts`** — export a `LANDING_DEFAULTS: LandingContent` and `PORTAL_DEFAULTS: PortalContent` built from the CURRENT values in `content.tsx` and `QuickLinks.tsx`. Map the existing `FEES` object into `FeesContent` where each row's prices become `{ early, regular, onsite }` keyed values (period ids `early|regular|onsite`). Include a default `pricingPromo`:

```ts
import type { LandingContent, PortalContent } from '../../../types';

export const LANDING_DEFAULTS: LandingContent = {
  hero: {
    eyebrow: 'GANSID Congress 2026',
    badge: 'REGISTER ONE, GET ONE FREE!',
    location: 'Hyderabad, India',
    dates: 'October 23–25, 2026',
    venue: 'HICC - Novotel',
    introHtml: '<p>We are pleased to announce that registration for the GANSID Congress 2026 is now open...</p>', // full current HERO.intro text wrapped in <p>
    ctaLabel: 'Register Now!',
    imageUrl: null,
  },
  registrationProcess: [
    { id: 'step1', number: '01', title: 'Account Setup', bodyHtml: '<p>Create your user account to access the Congress portal and registration form.</p>' },
    { id: 'step2', number: '02', title: 'Details & Tier', bodyHtml: '<p>Complete the registration form with your personal and professional details. Your tier is resolved by country.</p>' },
    { id: 'step3', number: '03', title: 'Finalize', bodyHtml: '<p>Submit your payment. We accept PayPal and all major credit cards...</p>' },
  ],
  importantNoticeHtml: '<p>Before beginning the registration form...</p>', // full current IMPORTANT_NOTICE
  groupNoteHtml: '<p>Group Registration: The person who purchases the tickets...</p>', // full current GROUP_NOTE
  includes: [
    'Full access to all scientific and educational sessions',
    'Entry to the exhibit hall during official hours',
    'Participation in poster networking sessions',
    'Access to supported symposia and presentation theatres',
    'Daily refreshments throughout the Congress',
    'Access to CME Credits',
  ],
  notIncluded: [
    'Access to the networking reception (requires an additional USD $50)...',
  ],
  faqs: [
    { id: 'faq1', question: 'What happens if I need to cancel my registration?', answerHtml: '<p>Due to the administrative expenses...</p>' },
    // ...remaining 3 FAQs verbatim
  ],
  supportEmail: 'congress@inheritedblooddisorders.world',
  fees: {
    note: 'All prices are in USD; you will be able to pay with your local currency.',
    periods: [
      { id: 'early', label: 'Early Bird', subtitle: 'Ends June 30, 2026' },
      { id: 'regular', label: 'Regular', subtitle: 'July 1 – September 15, 2026' },
      { id: 'onsite', label: 'On-site', subtitle: 'September 16 – October 25, 2026' },
    ],
    tiers: [
      { id: 'tier1', label: 'Tier 1', subtitle: 'Asia, Africa, South America, Central America, Mexico', rows: [
        { category: 'Physicians / Researchers', early: 175, regular: 200, onsite: 250 },
        // ...all tier1 rows verbatim
      ]},
      { id: 'tier2', label: 'Tier 2', subtitle: 'United States, Canada, Europe, Australia, New Zealand', rows: [
        { category: 'Physicians / Researchers', early: 250, regular: 300, onsite: 400 },
        // ...all tier2 rows verbatim
      ]},
    ],
  },
  pricingPromo: {
    enabled: false,
    label: 'Early Bird',
    colorPreset: 'save-green',
    promoPeriodId: 'early',
    comparePeriodId: 'regular',
    categories: 'all',
    endDate: null,
    showCountdown: false,
  },
};

export const PORTAL_DEFAULTS: PortalContent = {
  intro: { heading: 'Welcome', subheadingHtml: '' },
  sidebarLinks: [
    { id: 'home', label: 'Congress Home', description: 'Return to the main Congress page', icon: '🌐', mode: 'link', href: 'https://inheritedblooddisorders.world/congress-2026/' },
    { id: 'itinerary', label: 'Full Itinerary', icon: '📅', mode: 'soon' },
    { id: 'materials', label: 'Congress Materials', icon: '📁', mode: 'soon' },
    { id: 'venue', label: 'Venue Info', icon: '📍', mode: 'soon' },
  ],
};
```

> Copy the FULL current strings verbatim from `content.tsx` (don't truncate the `...` above — those are shorthand for this plan).

- [ ] **Step 2: Make `content.tsx` re-export defaults** so existing imports keep working during the refactor. Keep the raw named exports (`HERO`, `FEES`, etc.) derived from `LANDING_DEFAULTS` OR leave `content.tsx` untouched and only consume via context. Simplest: leave `content.tsx` as-is (it's the source the defaults were copied from) — the provider imports `landingDefaults`, components stop importing `content.tsx`. Delete unused named exports at the end of Phase 8.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS

```bash
git add components/Portal/content/landingDefaults.ts
git commit -m "feat(cms): typed landing + portal content defaults"
```

---

## Phase 3 — siteContentService (TDD)

### Task 5: Content merge helper + service

**Files:** Create `services/siteContentService.ts`, `tests/siteContent.test.ts`

- [ ] **Step 1: Write failing test** for a pure `mergeContent` deep-merge (DB over defaults, arrays replaced wholesale when present).

```ts
import { describe, it, expect } from 'vitest';
import { mergeContent } from '../services/siteContentService';

describe('mergeContent', () => {
  it('returns defaults when override is empty', () => {
    const defaults = { hero: { badge: 'A' }, includes: ['x'] };
    expect(mergeContent(defaults, {})).toEqual(defaults);
  });
  it('overrides scalar fields but keeps unspecified defaults', () => {
    const defaults = { hero: { badge: 'A', dates: 'D' } };
    const out = mergeContent(defaults, { hero: { badge: 'B' } });
    expect(out.hero.badge).toBe('B');
    expect(out.hero.dates).toBe('D');
  });
  it('replaces arrays wholesale when provided', () => {
    const defaults = { includes: ['a', 'b'] };
    expect(mergeContent(defaults, { includes: ['c'] }).includes).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`mergeContent` not defined). Run: `npm test -- siteContent`

- [ ] **Step 3: Implement**

```ts
import { supabase } from './supabaseClient';

// Deep-merge override over defaults. Objects merge recursively; arrays and
// scalars from override replace defaults wholesale. Undefined/null in override
// is ignored (falls back to default) so a partial edit never blanks the page.
export function mergeContent<T>(defaults: T, override: any): T {
  if (override == null) return defaults;
  if (Array.isArray(defaults) || typeof defaults !== 'object') {
    return (override ?? defaults) as T;
  }
  const out: any = { ...defaults };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (ov === undefined || ov === null) continue;
    const dv = (defaults as any)[key];
    if (Array.isArray(ov) || typeof ov !== 'object') out[key] = ov;
    else out[key] = mergeContent(dv ?? {}, ov);
  }
  return out;
}

export async function getSiteContent(site: string, page: string): Promise<any> {
  const { data, error } = await supabase
    .from('site_content').select('content').eq('site', site).eq('page', page).maybeSingle();
  if (error) { console.error('getSiteContent', error); return {}; }
  return data?.content ?? {};
}

export async function saveSiteContent(site: string, page: string, content: any): Promise<boolean> {
  const { data, error } = await supabase
    .from('site_content')
    .upsert({ site, page, content, updated_at: new Date().toISOString() })
    .select('site');
  if (error) { console.error('saveSiteContent', error); return false; }
  return (data?.length ?? 0) > 0; // rowcount check (§16 rule #4)
}
```

- [ ] **Step 4: Run → PASS.** Run: `npm test -- siteContent`

- [ ] **Step 5: Commit**

```bash
git add services/siteContentService.ts tests/siteContent.test.ts
git commit -m "feat(cms): siteContentService with tested deep-merge"
```

---

## Phase 4 — ContentProvider + preview transport

### Task 6: ContentProvider

**Files:** Create `components/Portal/content/ContentProvider.tsx`

- [ ] **Step 1: Implement** — fetch DB content, merge over defaults, expose hooks; support a `draftContent` prop (preview) that bypasses the DB fetch and a `postMessage` listener for live preview updates.

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CURRENT_SITE } from '../../../config/sites';
import { getSiteContent, mergeContent } from '../../../services/siteContentService';
import { LANDING_DEFAULTS, PORTAL_DEFAULTS } from './landingDefaults';
import type { LandingContent, PortalContent } from '../../../types';

interface Ctx { landing: LandingContent; portal: PortalContent; }
const ContentContext = createContext<Ctx>({ landing: LANDING_DEFAULTS, portal: PORTAL_DEFAULTS });

export function useLandingContent() { return useContext(ContentContext).landing; }
export function usePortalContent() { return useContext(ContentContext).portal; }

// draftOverride: when set (preview mode), skip the DB and render this instead.
export function ContentProvider({ children, previewMode = false }: { children: ReactNode; previewMode?: boolean }) {
  const [landingOv, setLandingOv] = useState<any>({});
  const [portalOv, setPortalOv] = useState<any>({});

  useEffect(() => {
    if (previewMode) return; // preview gets content via postMessage below
    getSiteContent(CURRENT_SITE.key, 'landing').then(setLandingOv);
    getSiteContent(CURRENT_SITE.key, 'portal').then(setPortalOv);
  }, [previewMode]);

  useEffect(() => {
    if (!previewMode) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'cms-preview') {
        if (e.data.page === 'landing') setLandingOv(e.data.content ?? {});
        if (e.data.page === 'portal') setPortalOv(e.data.content ?? {});
      }
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'cms-preview-ready' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, [previewMode]);

  const value: Ctx = {
    landing: mergeContent(LANDING_DEFAULTS, landingOv),
    portal: mergeContent(PORTAL_DEFAULTS, portalOv),
  };
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
```

- [ ] **Step 2: Mount the provider.** In `App.tsx`, wrap the portal/landing route subtree (the GANSID `<Landing/>` + `/portal` tree) in `<ContentProvider previewMode={isPreview}>`, where `isPreview` reads a hash param `cmsPreview=1`. Read the param from `window.location.hash`.

- [ ] **Step 3: Typecheck + commit**

```bash
git add components/Portal/content/ContentProvider.tsx App.tsx
git commit -m "feat(cms): ContentProvider with DB merge + postMessage preview transport"
```

---

## Phase 5 — RichText toolbar + sanitize

### Task 7: sanitizeHtml + RichTextEditor toolbar prop

**Files:** Create `utils/sanitizeHtml.ts`; Modify `components/RichTextEditor.tsx`

- [ ] **Step 1: sanitize wrapper**

```ts
import DOMPurify from 'dompurify';
const ALLOWED_TAGS = ['p','br','strong','b','em','i','u','a','ul','ol','li','span'];
const ALLOWED_ATTR = ['href','target','rel'];
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS, ALLOWED_ATTR });
}
```

- [ ] **Step 2: Add optional `toolbar` prop** to `RichTextEditor` — an array like `['bold','italic','underline','link','list']`; when provided, render only those buttons (default = current full set, so email templates are unchanged).

- [ ] **Step 3: Typecheck + commit**

```bash
git add utils/sanitizeHtml.ts components/RichTextEditor.tsx
git commit -m "feat(cms): html sanitizer + scoped RichTextEditor toolbar"
```

---

## Phase 6 — IframeViewer

### Task 8: Shared iframe modal

**Files:** Create `components/Portal/ui/IframeViewer.tsx`

- [ ] **Step 1: Implement** — portalled to `document.body` (§16 rule #7); ~90vw×90vh; close on X / Esc / backdrop; blocked-frame fallback via `onLoad` failure heuristic + a persistent "Open in new tab" link.

```tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

export function IframeViewer({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => { /* heuristic: if frame never fired load, offer fallback */ }, 4000);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-[90vw] h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="font-display font-semibold truncate">{title || url}</span>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-gansid-secondary inline-flex items-center gap-1"><ExternalLink className="w-4 h-4" /> Open in new tab</a>
            <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {blocked ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div><p className="mb-3">This page can't be embedded here.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded bg-gansid-primary-gradient text-white inline-flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Open in new tab</a></div>
          </div>
        ) : (
          <iframe src={url} title={title || 'preview'} className="flex-1 w-full" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" onError={() => setBlocked(true)} />
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Portal/ui/IframeViewer.tsx
git commit -m "feat(cms): shared IframeViewer modal (90vw, portalled, blocked-frame fallback)"
```

---

## Phase 7 — Admin CMS shell + preview wiring

### Task 9: Permission + route

**Files:** Modify `utils/adminPermissions.ts`, `App.tsx`

- [ ] **Step 1** Add a `content` page key to the permission map + `canAccessPage` handling (follow the existing key pattern; super-admin always true). Add `/admin/content` inside `AdminLayout`'s routes and a sidebar link "Content" gated on `CURRENT_SITE.portalEnabled && canAccessPage(profile,'content')`.

- [ ] **Step 2: Typecheck + commit**

```bash
git add utils/adminPermissions.ts App.tsx
git commit -m "feat(cms): /admin/content route + content permission (GANSID-gated)"
```

### Task 10: CMS shell + Preview

**Files:** Create `components/ContentCms/ContentCms.tsx` + `fields/*`

- [ ] **Step 1** Build the shell: sub-tab switch (Landing / Portal / Pricing & Fees), a draft-state model (`useState<LandingContent>` seeded from `getSiteContent` merged over `LANDING_DEFAULTS`; likewise portal), and a top bar with **Publish** (`saveSiteContent`), **Discard** (reload from DB), **Preview**. Preview opens `IframeViewer` at `#/?cmsPreview=1` (landing) or `#/portal?cmsPreview=1` (portal); on the child's `cms-preview-ready` message, `postMessage` the current draft; re-post on every draft change (via `useEffect` on draft).

- [ ] **Step 2** Build shared field primitives in `components/ContentCms/fields/`: `PlainField` (label + input), `RichField` (label + `RichTextEditor` scoped toolbar, stores sanitized HTML), `StringListField` (add/remove/reorder text rows), `RepeaterField<T>` (generic add/remove/drag list rendering a child editor per item), `ColorField` (preset swatches + custom hex). Keep each small and reused by all three editors.

- [ ] **Step 3: Typecheck + commit**

```bash
git add components/ContentCms/ContentCms.tsx components/ContentCms/fields
git commit -m "feat(cms): CMS shell, draft state, iframe preview wiring, field primitives"
```

---

## Phase 8 — Landing editor + component refactor

### Task 11: Refactor landing components to context

**Files:** Modify `HeroSection.tsx`, `InfoTabs.tsx`, `FeesSection.tsx`, `RegistrationOverview.tsx`

- [ ] **Step 1** Replace `import { HERO } from './content'` with `const { hero } = useLandingContent()` etc. Render `*Html` fields via `dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}`. **Fix the drift:** `InfoTabs` "Not Included" tab now maps `notIncluded` list items (mirroring the `includes` list rendering) instead of the hardcoded card.

- [ ] **Step 2: Manual verify** (dev server): landing renders identically to before (defaults path). Run `npm run dev`, load `/#/`, confirm hero/tabs/fees/FAQ unchanged.

- [ ] **Step 3: Commit**

```bash
git add components/Portal/Landing
git commit -m "refactor(landing): read content from ContentProvider; fix Not-Included drift"
```

### Task 12: Landing editor UI

**Files:** Create `components/ContentCms/LandingEditor.tsx`

- [ ] **Step 1** Build collapsible section cards using the field primitives: Hero (PlainFields + RichField intro + optional image upload via `uploadAnnouncementImage`), Registration Process (`RepeaterField<RegistrationStep>`), Important Notice (RichField), Group Note (RichField), Includes/NotIncluded (two `StringListField`), FAQs (`RepeaterField<Faq>`), Support email (PlainField). Each card has **Reset to default** (writes `LANDING_DEFAULTS[section]` into draft). Wire `onChange` to update the shell's draft.

- [ ] **Step 2: Manual verify:** edit a hero field → Preview modal reflects it live; Publish → reload public `/#/` shows the change.

- [ ] **Step 3: Commit**

```bash
git add components/ContentCms/LandingEditor.tsx
git commit -m "feat(cms): landing page section editors"
```

---

## Phase 9 — Announcements

### Task 13: announcementService mapper + list filter

**Files:** Modify `services/announcementService.ts`; Create `tests/announcementMapper.test.ts`

- [ ] **Step 1: Failing test** for the mapper round-trip of the new fields (db snake → camel).

```ts
import { describe, it, expect } from 'vitest';
import { mapAnnouncementFromDb } from '../services/announcementService';
describe('mapAnnouncementFromDb', () => {
  it('maps CTA + style fields', () => {
    const a = mapAnnouncementFromDb({ id:'1', site:'gansid', title:'t', body:null, image_url:null, is_active:true, published_at:'2026-01-01', created_at:'', updated_at:'', cta_label:'Go', cta_url:'https://x', cta_mode:'iframe', accent_color:'#ba0028', style:'banner', starts_at:null, ends_at:null });
    expect(a.ctaMode).toBe('iframe'); expect(a.accentColor).toBe('#ba0028'); expect(a.style).toBe('banner');
  });
});
```

- [ ] **Step 2: Run → FAIL.** Run: `npm test -- announcementMapper`

- [ ] **Step 3: Implement** — extend `mapAnnouncementFromDb` (new fields), `createAnnouncement`/`updateAnnouncement` (write new columns), and `listActiveAnnouncements` (add date-window filter: `starts_at is null or <= now`, `ends_at is null or > now`).

- [ ] **Step 4: Run → PASS.** Commit.

```bash
git add services/announcementService.ts tests/announcementMapper.test.ts
git commit -m "feat(cms): announcement CTA/style/schedule mapping + active window filter"
```

### Task 14: Announcement editor + feed rendering

**Files:** Create `components/ContentCms/PortalEditor.tsx` (announcements half); Modify `components/Portal/Dashboard/AnnouncementsFeed.tsx`; Modify `components/Settings.tsx`

- [ ] **Step 1** PortalEditor announcements list: reuse the CRUD from the old `AnnouncementsTab` but upgraded — title (Plain), body (Rich), image upload, CTA (label + url + mode select `none|link|iframe`), accent ColorField (default GANSID), active toggle, optional style/schedule. Preview via IframeViewer (`/portal?cmsPreview=1`).

- [ ] **Step 2** `AnnouncementsFeed`: render CTA button styled with `accentColor` (fallback GANSID gradient). `link` → anchor (external `target="_top"`/new tab, internal route); `iframe` → button that opens `IframeViewer`.

- [ ] **Step 3** Remove the `announcements` tab from `Settings.tsx` (retired). Verify SCAGO surfaces announcements nowhere; if it does, leave the Settings tab for SCAGO only (`!CURRENT_SITE.portalEnabled`).

- [ ] **Step 4: Manual verify + commit** — create a link-CTA and an iframe-CTA announcement; confirm feed renders + iframe opens.

```bash
git add components/ContentCms/PortalEditor.tsx components/Portal/Dashboard/AnnouncementsFeed.tsx components/Settings.tsx
git commit -m "feat(cms): announcement editor + CTA/iframe feed rendering; retire Settings tab"
```

### Task 15: Sidebar links (QuickLinks)

**Files:** Modify `components/Portal/Dashboard/QuickLinks.tsx`; extend `PortalEditor.tsx`

- [ ] **Step 1** `QuickLinks` reads `usePortalContent().sidebarLinks`. Render per mode: `link` → anchor; `soon` → "Coming soon" chip; `iframe` → button opening `IframeViewer` (agenda use-case). Keep GlassCard styling.

- [ ] **Step 2** PortalEditor sidebar-links half: `RepeaterField<SidebarLink>` (label, description, icon emoji/upload, mode select, href). Reset-to-default available.

- [ ] **Step 3: Manual verify + commit** — add an `iframe` agenda link, confirm it opens in the viewer.

```bash
git add components/Portal/Dashboard/QuickLinks.tsx components/ContentCms/PortalEditor.tsx
git commit -m "feat(cms): CMS-managed sidebar links incl. agenda-as-iframe"
```

---

## Phase 10 — Early-bird pill

### Task 16: pricingPromo helpers (TDD)

**Files:** Create `utils/pricingPromo.ts`, `tests/pricingPromo.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { isPromoActive, promoColors, shouldShowForCategory } from '../utils/pricingPromo';
import type { PricingPromoConfig } from '../types';
const base: PricingPromoConfig = { enabled:true, label:'Early Bird', colorPreset:'save-green', promoPeriodId:'early', comparePeriodId:'regular', categories:'all' };

describe('isPromoActive', () => {
  it('false when disabled', () => expect(isPromoActive({...base, enabled:false}, new Date('2026-01-01'))).toBe(false));
  it('true when enabled and no endDate', () => expect(isPromoActive(base, new Date('2026-01-01'))).toBe(true));
  it('false after endDate', () => expect(isPromoActive({...base, endDate:'2026-06-30'}, new Date('2026-07-01'))).toBe(false));
  it('true before endDate', () => expect(isPromoActive({...base, endDate:'2026-06-30'}, new Date('2026-06-01'))).toBe(true));
});
describe('shouldShowForCategory', () => {
  it('all → always true', () => expect(shouldShowForCategory(base, 'cat1')).toBe(true));
  it('list → membership', () => {
    expect(shouldShowForCategory({...base, categories:['cat1']}, 'cat1')).toBe(true);
    expect(shouldShowForCategory({...base, categories:['cat1']}, 'cat2')).toBe(false);
  });
});
describe('promoColors', () => {
  it('preset returns classes', () => expect(promoColors(base).length).toBeGreaterThan(0));
  it('custom returns inline style', () => { const c = promoColors({...base, colorPreset:'custom', customBg:'#111', customText:'#fff'}); expect(c).toContain('#111'); });
});
```

- [ ] **Step 2: Run → FAIL.** Run: `npm test -- pricingPromo`

- [ ] **Step 3: Implement**

```ts
import type { PricingPromoConfig } from '../types';
export function isPromoActive(cfg: PricingPromoConfig, now: Date): boolean {
  if (!cfg?.enabled) return false;
  if (cfg.endDate) { const end = new Date(`${cfg.endDate}T23:59:59.999Z`).getTime(); if (now.getTime() > end) return false; }
  return true;
}
export function shouldShowForCategory(cfg: PricingPromoConfig, categoryId: string): boolean {
  return cfg.categories === 'all' || cfg.categories.includes(categoryId);
}
// returns a className string for presets, or an inline-style-ish token for custom
export function promoColors(cfg: PricingPromoConfig): string {
  switch (cfg.colorPreset) {
    case 'gansid-red': return 'bg-gansid-primary-gradient text-white';
    case 'gansid-blue': return 'bg-gansid-secondary text-white';
    case 'save-green': return 'bg-emerald-500 text-white';
    case 'amber': return 'bg-amber-500 text-white';
    case 'custom': return `custom:${cfg.customBg ?? '#059669'}:${cfg.customText ?? '#ffffff'}`;
  }
}
```

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git add utils/pricingPromo.ts tests/pricingPromo.test.ts
git commit -m "feat(pricing): tested early-bird promo helpers"
```

### Task 17: PromoPrice component

**Files:** Create `components/Pricing/PromoPrice.tsx`

- [ ] **Step 1** Render: muted strikethrough `oldPrice`, emphasized `newPrice`, a rounded-full pill (`promoColors` — parse the `custom:` token into `style`), optional "ends {date}" caption. Props: `{ oldPrice?: number; newPrice: number; currency: string; config: PricingPromoConfig; compact?: boolean }`. Uses `formatPrice` from `utils/pricing.ts`.

- [ ] **Step 2: Commit**

```bash
git add components/Pricing/PromoPrice.tsx
git commit -m "feat(pricing): shared PromoPrice pill + strikethrough component"
```

### Task 18: Landing fees table integration

**Files:** Modify `components/Portal/Landing/FeesSection.tsx`

- [ ] **Step 1** Read `pricingPromo` from `useLandingContent()`. When `isPromoActive(config, new Date())`, for each row where `shouldShowForCategory(config, row.category)`, render the promo-period cell via `PromoPrice` (old = `comparePeriodId` cell, new = `promoPeriodId` cell). Non-promo cells render as today. Keep the emerald/sky/amber column colors.

- [ ] **Step 2: Manual verify + commit** — enable promo in CMS, confirm strikethrough + pill on landing table.

```bash
git add components/Portal/Landing/FeesSection.tsx
git commit -m "feat(pricing): early-bird pill on landing fees table (CMS-authored)"
```

### Task 19: Checkout integration

**Files:** Modify `components/Pricing/LivePriceCategory.tsx`, `components/Pricing/RunningTotal.tsx`

- [ ] **Step 1** Fetch `pricingPromo` (via `getSiteContent(CURRENT_SITE.key,'landing')` once, or thread from a parent). Map the config's `promoPeriodId`/`comparePeriodId` to engine bracket ids by matching bracket **name** (case-insensitive) to the period label; if no match, skip the checkout pill (landing still works). When the active resolved bracket == promo bracket, render category price via `PromoPrice` (old = compare bracket price at the user's tier, new = active price).

- [ ] **Step 2: Manual verify + commit** — checkout selector shows the same pill; charged amount equals the "new" price.

```bash
git add components/Pricing/LivePriceCategory.tsx components/Pricing/RunningTotal.tsx
git commit -m "feat(pricing): early-bird pill at checkout (engine-derived, name-mapped)"
```

### Task 20: Pricing & Fees editor

**Files:** Create `components/ContentCms/PricingFeesEditor.tsx`

- [ ] **Step 1** Two parts: (a) **Fees table editor** — edit periods (label/subtitle), tiers (label/subtitle), and per-row category + per-period prices (numeric grid), reusing `RepeaterField`. (b) **Early-bird config** — enabled toggle, label, `ColorField` presets+custom, promo/compare period selectors (populated from `fees.periods`), category targeting (all vs multiselect of `fees` row categories), optional endDate + countdown. Live preview via IframeViewer (landing).

- [ ] **Step 2: Manual verify + commit**

```bash
git add components/ContentCms/PricingFeesEditor.tsx
git commit -m "feat(cms): fees table + early-bird promo editor"
```

---

## Phase 11 — Cleanup

### Task 21: Remove dead exports

**Files:** Modify `components/Portal/Landing/content.tsx`

- [ ] **Step 1** Once nothing imports the old named exports (`grep -r "from './content'" components/Portal/Landing`), delete the now-unused constants (or keep `content.tsx` re-exporting `LANDING_DEFAULTS`-derived values if any non-refactored consumer remains). Run `npx tsc --noEmit` to confirm no dangling imports.

- [ ] **Step 2: Commit**

```bash
git add components/Portal/Landing/content.tsx
git commit -m "chore(cms): remove content.tsx constants superseded by CMS defaults"
```

---

## Phase 12 — Migrate, verify, document

### Task 22: Apply migrations to BOTH tenants

- [ ] **Step 1: Pre-flight lint.** Run: `npm run lint:migrations` → PASS.
- [ ] **Step 2: SCAGO via MCP** — `apply_migration` for both `site_content` and `extend_announcements_cms`. (Probe: neither touches existing data destructively; `is_portal_admin()` exists on SCAGO — confirm.)
- [ ] **Step 3: GANSID via CLI:**

```bash
npx supabase link --project-ref gticuvgclbvhwvpzkuez --yes
echo "y" | npx --yes supabase db push --include-all
```

- [ ] **Step 4: Post-apply** — `npm run smoke:db` (both green) + `npm run check:migrations` (add `site_content` presence + any app-read announcement cols to `REQUIRED_APP_COLUMNS` if flagged). Both must pass.
- [ ] **Step 5: Seed rows** — insert `(gansid,'landing')` and `(gansid,'portal')` with `{}` on GANSID so the provider reads cleanly (optional; provider handles absent rows).

### Task 23: Full verification

- [ ] **Step 1** `npx tsc --noEmit` → clean.
- [ ] **Step 2** `npm test` → all pass (new: pricingPromo, siteContent, announcementMapper).
- [ ] **Step 3** `npm run build` → succeeds.
- [ ] **Step 4** Dev-server manual pass (per spec §8): each landing section edit → preview → publish → public reflects; announcement link + iframe CTA; agenda sidebar iframe; blocked-frame fallback; early-bird pill on landing + checkout with matching charged price; Reset-to-default; SCAGO admin has no Content tab and Settings still saves.

### Task 24: Update CLAUDE.md

- [ ] **Step 1** Bump the "Last refreshed" date; add a §19 entry (top); patch §4 (repo layout — new `components/ContentCms/`, `site_content`), §11 (no new edge fns — note explicitly), §12 (schema — `site_content`, extended `announcements`), §13 (new `/admin/content`), §18 (new gotchas: CMS preview postMessage, iframe framing fallback, sanitize-on-render).
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — GANSID content CMS + early-bird pill"
```

---

## Self-Review notes

- **Spec coverage:** Landing CMS (Tasks 11-12, 4), Portal announcements (13-14), sidebar/agenda iframe (15, 8), early-bird both surfaces from one config (16-20), JSONB storage (1,5), iframe preview (6,8,10), rich text + sanitize (7), migrations both tenants (22), tests (5,13,16), CLAUDE.md (24). All spec sections mapped.
- **No edge-function work** — confirmed; verify-payment untouched.
- **Type consistency:** `LandingContent`/`PortalContent`/`PricingPromoConfig`/`SidebarLink` defined once (Task 3) and consumed consistently; `mergeContent`, `getSiteContent`, `saveSiteContent`, `isPromoActive`, `shouldShowForCategory`, `promoColors`, `sanitizeHtml`, `IframeViewer`, `PromoPrice`, `ContentProvider` names stable across tasks.
- **Ordering:** DB → types → service (TDD) → provider → shared UI → editors → pricing → migrate/verify/doc. Foundation before consumers.
