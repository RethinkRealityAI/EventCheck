# Email branding — single source of truth (design)

**Date:** 2026-07-02
**Tenants:** GANSID (`gticuvgclbvhwvpzkuez`) + SCAGO (`iigbgbgakevcgilucvbs`)
**Status:** Approved (Approach A). Ready for implementation plan.

## Problem

Ticket/confirmation emails do not match the branded preview shown in **Settings → Email Templates**, and a received ticket-confirmation email showed a literal `{{name}}` placeholder. Root causes, confirmed by a full send-path audit:

1. **Two renderers that drifted.** The client `utils/emailShell.ts` `renderEmailShell()` supports a header **image** and the correct Congress gradient, but is used by only 3 paths (campaigns, admin custom-send, the Email Templates preview). The edge `supabase/functions/send-ticket-email/index.ts` `generateEmailTemplate()` has its **own duplicated palette**, a **text-only** header, and **no image support** — and it renders **15** paths, including every ticket/confirmation email. So the inbox never matches the preview.
2. **Fragmented substitution.** Each of the 15 edge modes hand-writes its own `{{token}}` replace list. Several omit tokens the Email Templates UI advertises to admins (e.g. `{{purchaser}}` in guest-confirmed, `{{free_category_name}}` in BOGO, `{{first_name}}`). Any advertised token a mode forgot arrives as literal `{{…}}`. There is no safety net stripping unresolved placeholders.
3. **No per-form override.** `form.settings` has visual/success overrides but **zero** email subject/body fields. All templates are global `app_settings` only.

## Goals

- Make the Email Templates (global `app_settings`) the **structural** single source of truth for all email copy and branding.
- The branded **header image** (`app_settings.email_header_logo`, already a hosted https URL on GANSID) renders on **every** send path.
- A **per-form override** toggle (default OFF) lets a form diverge; when OFF, the form uses global templates.
- A raw `{{…}}` placeholder can **never** reach an inbox again.
- Consistency is guaranteed by shared code, not by discipline.

## Non-goals

- Not moving the client-only checkout purchaser email server-side (that §18 reliability item stays deferred). This work only routes that existing client send through the shared renderer so it gets the banner.
- Not adding new email *types*. Not touching SMTP/Resend provisioning.
- Not adding per-form overrides for BOGO/staff/sponsor templates in the UI (resolver still supports them; they inherit global).

## Decisions (settled with the user)

- **Header image source:** `app_settings.email_header_logo` (the column the preview already uses). Per-form `emailOverrides.headerImageUrl` may override it.
- **Override model:** default OFF → global templates are the source of truth; a per-form master toggle enables divergence, resolved per-field (unset fields inherit global).
- **SCAGO rollout:** unify **both** tenants onto the shared shell. Deploy GANSID first, verify a real inbox, then SCAGO. (SCAGO's ticket emails will change from today's text-header to the shared shell — which matches SCAGO's own campaign emails already using this shell.)
- **Override UI scope:** core registrant templates only — `ticket`, `table-purchaser`, `guest`, `guest-claim`, `guest-confirmed`.

## Architecture

### 1. Canonical render module

One pure module owns rendering + substitution:

- `renderEmailShell(opts)` — the current client renderer, unchanged in behavior. Already pure, already per-site via `EMAIL_PALETTES.gansid` / `.scago`, already accepts `headerImageUrl`. Becomes the **only** renderer.
- `applyPlaceholders(str, vars: Record<string,string>)` — replaces every `{{token}}` present in `vars`, then **scrubs any remaining `{{…}}` to empty string**. This structurally eliminates the literal-placeholder bug class regardless of which mode's var map is incomplete.
- `EMAIL_TEMPLATE_REGISTRY` — `key → { subjectField, bodyField, placeholders, default }`. The **resolver and the Email Templates admin tab both read this one list**, so the UI's advertised placeholders can never again disagree with what is actually substituted. Replaces the ad-hoc `TEMPLATES` array currently inlined in `EmailTemplatesTab.tsx`.

**Cross-boundary sharing (the tsconfig constraint).** `tsconfig.json` excludes `supabase/functions/**/*`, and no client (non-test) code currently imports from `_shared/`. Strategy, in order of preference:

- **Preferred:** one canonical file in `supabase/functions/_shared/emailShell.ts` (pure — no `Deno.*`, no remote imports). The edge imports it directly; `utils/emailShell.ts` re-exports it so the ~3 existing client import sites are unchanged. **Acceptance gate:** `npx tsc --noEmit` and `npm run build` must stay green with this re-export as the *first* implementation step.
- **Fallback if the exclude boundary trips tsc:** keep `utils/emailShell.ts` canonical + a byte-identical `supabase/functions/_shared/emailShell.ts` twin, guarded by `tests/emailShellParity.test.ts` that fails on any drift (same "keep-in-sync" convention the repo already uses for duplicated CORS headers). Functionally single-source; two physical files.

Either way, drift is impossible.

### 2. Resolver — precedence in one place

`resolveEmailTemplate(key, { form, appSettings }) → { subject, body, headerImageUrl, footerText }`. Pure, total (always returns something), unit-tested. Per-field precedence:

1. Per-form override **if** `form.settings.emailOverrides.enabled === true` **and** the field is set →
2. Global `app_settings[subjectField / bodyField]` →
3. Hardcoded `default` from the registry.

Header image: `emailOverrides.headerImageUrl || appSettings.email_header_logo || (none → renderer's wordmark fallback)`. Footer text: `appSettings.email_footer_text`.

A malformed `form.settings` is treated as no-override. Every send path (edge + client) calls this one helper.

> Note: `registration-confirmed` (P4) is not its own template — it reuses `ticket` (or `table-purchaser` when linked guests exist). So a per-form override of `ticket` automatically flows to the P4 confirmation email.

### 3. Data model — additive, no migration

```ts
// FormSettings (types.ts) — inside the existing forms.settings jsonb. NO schema change.
emailOverrides?: {
  enabled?: boolean;                 // default false → global templates win
  headerImageUrl?: string;           // optional per-form banner
  templates?: Partial<Record<EmailTemplateKey, { subject?: string; body?: string }>>;
};
```

Lives in the existing jsonb column → **zero migration, nothing to apply to two tenants, no schema risk.** Every existing form has this unset → all keep using global templates exactly as today. `EmailTemplateKey` is derived from `EMAIL_TEMPLATE_REGISTRY` keys.

### 4. Edge changes (`send-ticket-email`, 15 modes)

- Rewrite `generateEmailTemplate` to **delegate** to the shared `renderEmailShell` (keep its call signature; add `headerImageUrl` / `footerText` / `site`).
- Each mode already fetches `app_settings` (for SMTP). Widen the modes' `forms` lookups from `select('title')` → `select('title, settings')`, then compute `resolveEmailTemplate(key, { form, appSettings })` for subject/body/brand and pass the brand fields into the renderer. No request-body re-plumbing of callers.
- Route every mode's subject+body through the shared `applyPlaceholders` (scrub included).
- Fill the genuinely-missing tokens so they render **real** values rather than scrubbing to blank: `{{purchaser}}` in guest-confirmed; `{{free_category_name}}` in BOGO-ticket (look up the free row's pricing category name). Audit each mode's var map against its registry `placeholders` and close every gap.

### 5. Client changes

- `utils/emailShell.ts` → re-export from canonical (zero call-site churn).
- Route through `resolveEmailTemplate` + shared render: `utils/resendTicketEmail.ts`, the checkout purchaser send in `PublicRegistration.tsx` (§18 client-only email — gets the banner; honors per-form override on resend), `BulkImportModal.tsx`, and the `EmailTemplatesTab.tsx` preview. **Preview now equals inbox.**
- `EmailTemplatesTab.tsx` reads its template list from `EMAIL_TEMPLATE_REGISTRY` instead of the inlined `TEMPLATES` array.

### 6. FormBuilder UI (Part 2)

New collapsible **"Email Customization"** section in the FormBuilder **Settings** tab (beside the existing PDF-ticket / success-page overrides):

- Master toggle: "Use custom email templates for this form" → sets `emailOverrides.enabled`.
- When ON: optional per-form header image URL + subject/body editors for the 5 core registrant templates, each with an "inherit global" empty state and the registry's placeholder chips. Reuse the existing EmailTemplatesTab editor primitives where practical.
- When OFF: collapsed with an "inheriting global Email Templates" note.

## The two bugs — precise fixes

- **Header image missing:** `generateEmailTemplate` delegates to `renderEmailShell` with `headerImageUrl` resolved from the registry/resolver → all 15 edge paths render the banner; the 3 client paths already do.
- **Literal `{{name}}`:** `applyPlaceholders` scrub guarantees no raw `{{…}}` ships; plus the per-mode var-map audit fills the real gaps. (The specific token the user saw will be identified and covered during implementation by comparing the live template against the sending mode's map; the scrub makes the fix robust even if a token is missed.)

## Backward-compatibility / safety

- **No DB migration** (override is additive jsonb).
- Override disabled + empty logo (SCAGO today) → renderer's wordmark fallback → SCAGO keeps its own palette. The one behavioral change is SCAGO's edge emails moving to the shared shell — accepted per the SCAGO-rollout decision, verified GANSID-first.
- **Rollout is per-tenant** (§15): GANSID edge deploy → real-send inbox check (banner + clean name) → SCAGO. CLI `--use-api`, smoke-tested, both tenants (§16 rule 2).
- **Tests before deploy** (§16 rule 14): `applyPlaceholders`, `resolveEmailTemplate`, registry integrity, parity test if the twin fallback is used.
- **Cold audit** after implementation (§16 rule 6).
- Shared module stays pure so Vite bundles it and the edge (Deno) imports it.

## Testing

- Unit (vitest): `applyPlaceholders` (substitute + scrub + unknown-token → empty), `resolveEmailTemplate` (all three precedence tiers, header-image precedence, malformed settings), registry integrity (every key has valid subject/body fields + defaults), optional parity.
- Manual: dev preview parity (preview == rendered), real GANSID sends for `ticket`, `registration-confirmed`, `contact-issue-ticket`, one BOGO mode; toggle a per-form override and confirm it wins, toggle off and confirm global.
- Gates: `npx tsc --noEmit`, `npm test`, `npm run build` all green before any deploy.

## Rollout sequence

- **Part 1 — consistency + bug fixes** (no UI, no migration): canonical module + resolver + registry; `generateEmailTemplate` delegates; image on all paths; `applyPlaceholders` scrub; close var-map gaps; client paths routed through resolver. Verify → deploy GANSID → inbox check → SCAGO.
- **Part 2 — per-form override:** `types.ts` `emailOverrides`; resolver already honors it; FormBuilder "Email Customization" UI for the 5 core templates. Verify override on/off.

## Open risks

- Cross-boundary import may trip tsc → fallback twin+parity test (named above).
- BOGO `{{free_category_name}}` needs a pricing-category name lookup in the edge — confirm the category id is on the free row or reachable via the source row.
- SCAGO visual change to edge emails — mitigated by GANSID-first rollout and a SCAGO inbox check before its deploy.
