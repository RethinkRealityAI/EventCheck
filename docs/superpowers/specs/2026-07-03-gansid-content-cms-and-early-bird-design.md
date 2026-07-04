# GANSID Content CMS + Early-Bird Pricing Pill — Design Spec

> Date: 2026-07-03
> Branch: `claude/gansid-content-cms-early-bird`
> Tenancy: **GANSID-only** for the Landing + Portal CMS (SCAGO has `portalEnabled: false`, so it has no landing/portal to manage). The early-bird pill works on any tenant that renders a fees table / dynamic-pricing checkout, but is gated behind CMS config that only GANSID edits.
> Rollout: **one combined release** (all three features ship together).

---

## 1. Goal

Let GANSID admins manage the public **landing page**, the **Congress portal** (announcements + sidebar links), and an **early-bird pricing promo** — all without a code deploy. Editing happens in a new full-width admin CMS with a ~90%-viewport **iframe live preview** modal. Content persists as JSONB so copy/section changes never require another migration.

Three deliverables, one release:

1. **Landing Page CMS** — every piece of copy (+ optional images) editable, rich text where prose warrants it.
2. **Portal & Announcements CMS** — announcements with title / rich body / image / **CTA button (link *or* iframe mode)** / accent color; plus CMS-managed **sidebar links** (Congress materials, website, **agenda-as-iframe**).
3. **Early-bird pricing pill** — a configurable promo badge + "old price struck through → new price" treatment shown in **both** the landing Fees table and the checkout category selector, from one shared config.

## 2. Non-goals / out of scope

- No changes to `verify-payment` or any edge function. The pill is presentation-only; the server still validates real bracket prices. (Confirmed: pricing is re-computed server-side; the CMS never feeds price into checkout capture.)
- No SCAGO landing/portal (it has none). SCAGO's existing `app_settings`/announcements behavior is untouched.
- No server-saved draft workflow in v1 (drafts live in the editor's browser state until Publish). A `published` vs `draft` split is a documented future enhancement.
- No CMS control over personal/dynamic portal widgets (tickets, credential, welcome-by-name).
- No pricing-engine coupling for the landing Fees table — it stays **CMS-authored** (admin decision). The pill derives strikethrough per-surface, not by wiring the table to the engine.

## 3. Architecture

### 3.1 Storage — new `site_content` table (decoupled from `app_settings`)

```sql
create table if not exists site_content (
  site       text not null,
  page       text not null,        -- 'landing' | 'portal'
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (site, page)
);
```

- **RLS:** `SELECT` allowed for `anon` + `authenticated` (the landing page is public, so content must be anon-readable — it holds no secrets). `INSERT/UPDATE/DELETE` restricted to admins via the existing `is_portal_admin()` helper. Policies reference only `auth.uid()` / role — **never subquery `site_content` itself** (per §16 rule #13).
- **Why a table, not `app_settings` columns:** `saveSettings` is a monolithic explicit-column upsert that has broken twice when a column lagged a tenant. A dedicated table with a targeted service sidesteps that entirely, gives clean public-read/admin-write RLS, and lets us add pages later with zero migrations.
- **Why JSONB:** after this one migration, all future copy/section/field changes are JSONB edits — never another schema change.

Rows created on both tenants' DBs for GANSID: `(gansid,'landing')`, `(gansid,'portal')`. (Table exists on both tenants for parity even though only GANSID writes it.)

### 3.2 Content model → defaults → DB-override merge

`components/Portal/Landing/content.tsx` becomes the **typed default content** (keep the file; it is the fallback). A new provider merges DB overrides over defaults:

- New `services/siteContentService.ts`:
  - `getSiteContent(site, page): Promise<Partial<...>>`
  - `saveSiteContent(site, page, content): Promise<boolean>` (targeted upsert with rowcount check per §16 rule #4)
  - mappers for the typed content shapes
- New `components/Portal/content/ContentProvider.tsx` (React context): fetches `site_content` for the current site, deep-merges over the `content.tsx` defaults, exposes `useLandingContent()` / `usePortalContent()`. **Missing fields always fall back to defaults → a partial edit can never break the page.**
- Refactor landing components (`HeroSection`, `InfoTabs`, `FeesSection`, `RegistrationOverview`) and portal components (`AnnouncementsFeed`, `QuickLinks`) to read from the provider instead of importing `content.tsx` directly.

### 3.3 New content types (in `types.ts`)

```ts
interface LandingContent {
  hero: { eyebrow; badge; location; dates; venue; introHtml; ctaLabel; imageUrl? };
  registrationProcess: { id; number; title; bodyHtml }[];
  importantNoticeHtml: string;
  groupNoteHtml: string;
  includes: string[];
  notIncluded: string[];
  faqs: { id; question; answerHtml }[];
  supportEmail: string;
  fees: FeesContent;                 // the CMS-authored fees table (existing FEES shape)
  pricingPromo: PricingPromoConfig;  // early-bird config (§6)
}

interface PortalContent {
  intro?: { heading?; subheadingHtml? };
  sidebarLinks: SidebarLink[];
}
interface SidebarLink { id; label; description?; icon?; mode: 'link'|'iframe'|'soon'; href? }
```

`*Html` fields hold sanitized rich-text HTML; short fields are plain strings.

### 3.4 Admin CMS shell

- New route **`/admin/content`** in `App.tsx` `AdminLayout`, sidebar entry "Content", gated to `CURRENT_SITE.portalEnabled` + a new `content` permission key in `utils/adminPermissions.ts` (super-admin always allowed).
- `components/ContentCms/ContentCms.tsx`: sub-tabs **Landing Page**, **Portal & Announcements**, **Pricing & Fees**. Top bar: **Publish**, **Discard changes**, **Preview** (opens the iframe modal). Editor is full-width (preview is a modal, not a side rail).
- Per-section **Reset to default** (writes the `content.tsx` default back into the draft).

### 3.5 Live preview — iframe modal (~90% viewport)

- Shared `components/Portal/ui/IframeViewer.tsx` — a modal at ~90vw × 90vh, portalled to `document.body` (per §16 rule #7), closed via **X / Esc / click-outside**. Sandboxed iframe. Detects a blocked/failed frame load and shows an "Open in new tab ↗" fallback card.
- **Preview flow:** the CMS "Preview" opens `IframeViewer` pointed at the real route in preview mode (`/#/?cmsPreview=1` for landing, `/#/portal?cmsPreview=1` for portal). The route, when `cmsPreview` is set, mounts the `ContentProvider` in "draft mode" and listens for a `postMessage` carrying the current draft content; the CMS posts the draft on open and on each edit. So preview renders the **exact production components** with unsaved edits — never an approximation.
- The same `IframeViewer` is reused at runtime for announcement CTAs (iframe mode) and the agenda sidebar link.

### 3.6 Rich text + sanitization

- Reuse `components/RichTextEditor.tsx` (contentEditable) with a **restricted toolbar** for landing/portal prose: bold / italic / underline / link / bullet list (no font-size/color that would fight GANSID typography). Add an optional `toolbar` prop to scope buttons.
- Rich HTML rendered on public pages via `dangerouslySetInnerHTML` **after sanitizing** with DOMPurify (small, well-audited dep). Admin-authored content is low XSS risk, but the landing is public and content is stored in an anon-readable table, so sanitize as defense-in-depth.

### 3.7 Images

- Reuse existing Supabase Storage helpers (`uploadAnnouncementImage` → `portal-assets`; `uploadBrandingAsset` → `sponsor-logos`). Add an `uploadContentImage` wrapper if a new prefix is wanted; otherwise reuse `portal-assets`.
- Landing is image-light by design; the only landing image control is an **optional** hero image (off by default). Announcement images + sidebar icons are the main image surfaces.

## 4. Feature: Landing Page CMS

Editor sections (each a collapsible card): **Hero**, **Registration Process** (add/remove/reorder steps), **Important Notice**, **Group Registration**, **What's Included / Not Included** (two string lists), **FAQs** (add/remove/reorder), **Support email**. (Fees is its own sub-tab, §6.)

Field types per §Section-2 table: short = plain input; prose (intro, notice, group note, step body, FAQ answer) = restricted rich text; lists = add/remove/drag-reorder.

**Drift fix:** `InfoTabs.tsx` currently renders hardcoded "Not Included" copy instead of the array; rewire it to render the CMS `notIncluded` list so edits actually show.

## 5. Feature: Portal & Announcements CMS

### 5.1 Announcement model upgrade

Extend the `announcements` table with **additive typed columns** (dedicated table, clean per-field service — safe, unlike the `app_settings` monolith):

| Column | Type | Notes |
|---|---|---|
| `body` | text | now holds sanitized rich-text HTML |
| `cta_label` | text null | |
| `cta_url` | text null | |
| `cta_mode` | text | `'none'` \| `'link'` \| `'iframe'` (default `'none'`) |
| `accent_color` | text null | null → GANSID default |
| `style` | text | `'card'` \| `'banner'` (default `'card'`) — *optional feature, may cut* |
| `starts_at` | timestamptz null | *optional publish window, may cut* |
| `ends_at` | timestamptz null | *optional publish window, may cut* |

`announcementService` mapper + `listActiveAnnouncements` updated (date-window filter when scheduling is kept). `Announcement` type extended.

### 5.2 Editor

The bare `Settings/AnnouncementsTab.tsx` is retired; announcement management moves into the CMS "Portal & Announcements" sub-tab: title + rich body + image + CTA (label/url + link/iframe toggle) + accent color picker (default GANSID) + active toggle (+ optional style/schedule). Preview via the iframe modal. (Verify at implementation that SCAGO surfaces announcements nowhere; if it does, leave a minimal Settings editor for it.)

### 5.3 Feed rendering

`AnnouncementsFeed.tsx` renders the CTA button (accent color) and, in iframe mode, opens the shared `IframeViewer`. Link mode: external → new tab (`rel="noopener"`), internal → route.

### 5.4 Sidebar links

`QuickLinks.tsx` renders from `portalContent.sidebarLinks` (fallback to current hardcoded defaults). Editor manages the list (add/remove/reorder; label, description, icon, mode, href). Agenda = `mode: 'iframe'` → opens `IframeViewer`. Materials/website = `mode: 'link'`. `mode: 'soon'` → "Coming soon" chip.

## 6. Feature: Early-bird pricing pill

### 6.1 Config (`PricingPromoConfig`, in landing content, edited in "Pricing & Fees")

```ts
interface PricingPromoConfig {
  enabled: boolean;
  label: string;               // "Early Bird"
  colorPreset: 'gansid-red'|'gansid-blue'|'save-green'|'amber'|'custom';
  customBg?: string; customText?: string;
  promoPeriodId: string;       // period whose price is the emphasized "new"
  comparePeriodId: string;     // period whose price is the struck-through "old"
  categories: 'all' | string[];// which categories/rows show the pill
  endDate?: string;            // optional urgency + auto-expire
  showCountdown?: boolean;     // optional
}
```

### 6.2 Shared render

- Pure helpers in `utils/pricingPromo.ts`: `isPromoActive(config, now)`, `resolvePromoPrices({ oldPrice, newPrice })`, formatting — **unit tested** (§16 rule #14).
- Shared component `components/Pricing/PromoPrice.tsx` (badge + strikethrough old + emphasized new + optional "ends {date}" caption). Badge respects `colorPreset`/custom; won't clash with the table's emerald/sky/amber.
- **Landing Fees table** (`FeesSection.tsx`): for targeted rows, pass the CMS-typed `comparePeriodId`/`promoPeriodId` cell values to `PromoPrice`.
- **Checkout** (`LivePriceCategory.tsx` + `RunningTotal.tsx`): read the same `pricingPromo` config (from landing content, public-readable); derive old/new from the **engine** bracket prices (`prices[tier][compareBracketId]` vs the active bracket). A light mapping resolves the CMS period id → engine bracket id (by matching bracket name/order; the config's period picker offers the engine's brackets when a template is linked). If no confident mapping, the checkout pill is simply not shown — the landing pill still works.

### 6.3 Data integrity

The pill never changes charged price. On landing, old/new are CMS cells. At checkout, "new" is always the engine's real active-bracket price, so the displayed pill and the captured amount agree by construction.

## 7. Migrations & deploy (per §15/§16)

1. `YYYYMMDDHHMMSS_add_site_content.sql` — table + RLS.
2. `YYYYMMDDHHMMSS_extend_announcements_cms.sql` — additive columns.
- `npm run lint:migrations` before apply. Apply **SCAGO via MCP**, **GANSID via CLI** (§16 rule #1). Then `npm run smoke:db` + `npm run check:migrations` (add any app-read columns to `REQUIRED_APP_COLUMNS`).
- **No edge-function deploys.** Frontend ships via Netlify on merge — so both migrations must be applied to both tenants **before** merge (§18 "frontend column referenced but not migrated").
- `npx tsc --noEmit`, `npm test`, `npm run build` all green before merge.

## 8. Testing

- Unit: `pricingPromo` helpers; `siteContent` content-merge (defaults fill gaps); announcement mapper; sidebar-link normalization.
- Manual (dev server + iframe preview): edit each landing section → preview reflects it; publish → public page updates; announcement with link CTA and with iframe CTA; agenda sidebar link opens viewer; blocked-frame fallback; early-bird pill on landing + checkout; reset-to-default; SCAGO admin unaffected (no Content tab).

## 9. Security

- `site_content` anon-readable (public content, no secrets); admin-write via `is_portal_admin()`; no self-referential RLS.
- Sanitize all admin rich-text HTML (DOMPurify) before public render.
- `IframeViewer` sandboxes frames; only admin-provided URLs; framing-blocked fallback.
- All writes rowcount-checked (§16 rule #4).

## 10. Key files

**New:** `services/siteContentService.ts`, `components/Portal/content/ContentProvider.tsx`, `components/ContentCms/*` (shell + Landing/Portal/Pricing editors + section cards), `components/Portal/ui/IframeViewer.tsx`, `components/Pricing/PromoPrice.tsx`, `utils/pricingPromo.ts`, two migrations, tests.

**Modified:** `types.ts`, `App.tsx` (route), `utils/adminPermissions.ts`, `components/Portal/Landing/{content.tsx→defaults, HeroSection, InfoTabs, FeesSection, RegistrationOverview}.tsx`, `components/Portal/Dashboard/{AnnouncementsFeed, QuickLinks}.tsx`, `services/announcementService.ts`, `components/Pricing/{LivePriceCategory, RunningTotal}.tsx`, `components/RichTextEditor.tsx` (toolbar prop), CLAUDE.md.

**Retired:** `components/Settings/AnnouncementsTab.tsx` (moves into CMS; keep a redirect/minimal if SCAGO needs it).
