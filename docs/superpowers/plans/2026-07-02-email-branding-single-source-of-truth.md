# Email Branding — Single Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global Email Templates the structural single source of truth for all email copy + branding — every send path renders through one shared shell with the branded header image, no raw `{{…}}` can reach an inbox, and a per-form toggle can override.

**Architecture:** One pure shared module (`supabase/functions/_shared/emailShell.ts`) owns rendering + placeholder scrub; a second pure shared module (`_shared/emailTemplates.ts`) owns override→global→default precedence. The edge `generateEmailTemplate` becomes a thin adapter delegating to the shared shell (so all 14 edge send-sites gain the image + lose the double-greeting with ~1 line each), and each mode's hand-rolled `.replace()` chain becomes `applyPlaceholders(str, vars)` (scrub + easy token gap-fills). The client `utils/emailShell.ts` re-exports the shared module (zero call-site churn). Part 2 adds `form.settings.emailOverrides` (additive jsonb — no migration) + a FormBuilder UI for the 5 core registrant templates.

**Tech Stack:** React 18 + TS + Vite (client), Deno + nodemailer (edge `send-ticket-email`), Vitest (pure-function tests). Spec: `docs/superpowers/specs/2026-07-02-email-branding-single-source-of-truth-design.md`.

**Decisions locked:** header image = `app_settings.email_header_logo`; per-form override default OFF (global is source of truth); unify BOTH tenants, deploy GANSID-first then SCAGO; override UI scoped to `ticket`, `table-purchaser`, `guest`, `guest-claim`, `guest-confirmed`.

**Deploy discipline (CLAUDE.md §15/§16):** edge deploys are CLI `--use-api` only, NEVER MCP; deploy both tenants; GANSID-first with a real-inbox check before SCAGO. `npx tsc --noEmit` + `npm test` + `npm run build` must be green before any deploy. Cold audit after implementation.

---

## File Structure

**Create:**
- `supabase/functions/_shared/emailShell.ts` — canonical pure renderer: `renderEmailShell`, `EMAIL_PALETTES`, `escapeHtml`, `mergePlaceholders`, `plainTextToHtml`, `applyPlaceholders` (NEW send-time scrub), local `SiteKey` type. No imports outside this file.
- `supabase/functions/_shared/emailTemplates.ts` — `EmailTemplateKey`, `CORE_OVERRIDE_TEMPLATE_KEYS`, `resolveEmailTemplate` (naming-agnostic precedence). No imports outside `_shared`.
- `tests/emailShell.test.ts` — unit tests for `applyPlaceholders`.
- `tests/emailTemplates.test.ts` — unit tests for `resolveEmailTemplate`.
- `components/FormBuilder/EmailOverridesSection.tsx` — Part 2 per-form override UI.

**Modify:**
- `utils/emailShell.ts` — becomes a re-export of `../supabase/functions/_shared/emailShell` (keeps public API identical). Keep the client's `SiteKey` type import path working (see Task 1).
- `supabase/functions/send-ticket-email/index.ts` — import shared shell/templates; rewrite `generateEmailTemplate` to delegate to `renderEmailShell` + accept `headerImageUrl`/`footerText` + drop injected greeting; per-mode: widen `forms` select to `title, settings`, read `emailOverrides`, convert `.replace()` chains to `applyPlaceholders(vars)`, pass `headerImageUrl`/`footerText`, fill token gaps; `ticket` fallthrough loads `email_header_logo`/`email_footer_text`.
- `utils/resendTicketEmail.ts` — route substitution through `applyPlaceholders`; relax the stale `!settings.smtpPass` gate (env-first SMTP; GANSID `smtp_pass` is cleared).
- `components/PublicRegistration.tsx` — checkout purchaser email uses `applyPlaceholders` (scrub) so no leaked token.
- `types.ts` — add `emailOverrides?` to `FormSettings.settings` (Part 2).
- `components/FormBuilder/` Settings tab host — mount `EmailOverridesSection` (Part 2).

**Note on testability:** `send-ticket-email/index.ts` is `// @ts-nocheck` Deno and is NOT covered by repo `tsc`/Vitest. Its correctness is verified by deploy smoke tests + real-inbox checks. All *pure* logic it relies on (`applyPlaceholders`, `resolveEmailTemplate`) lives in `_shared/` and IS unit-tested (CLAUDE.md §16 rule 14).

---

# PART 1 — Consistency + bug fixes (no UI, no migration)

## Task 1: Canonical shared shell module + placeholder scrub

**Files:**
- Create: `supabase/functions/_shared/emailShell.ts`
- Create: `tests/emailShell.test.ts`
- Modify: `utils/emailShell.ts`

- [ ] **Step 1: Write failing tests for `applyPlaceholders`**

Create `tests/emailShell.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyPlaceholders, renderEmailShell } from '../supabase/functions/_shared/emailShell';

describe('applyPlaceholders', () => {
  it('substitutes known tokens', () => {
    expect(applyPlaceholders('Hello {{name}}, event {{event}}', { name: 'Dapo', event: 'Congress' }))
      .toBe('Hello Dapo, event Congress');
  });

  it('scrubs unresolved tokens to empty string (no raw {{…}} ever ships)', () => {
    expect(applyPlaceholders('Hi {{name}} {{first_name}} {{unknown}}', { name: 'Dapo' }))
      .toBe('Hi Dapo  ');
  });

  it('treats null/undefined var values as empty', () => {
    expect(applyPlaceholders('A{{x}}B', { x: undefined })).toBe('AB');
    expect(applyPlaceholders('A{{x}}B', { x: null as any })).toBe('AB');
  });

  it('replaces every occurrence of a repeated token', () => {
    expect(applyPlaceholders('{{n}}-{{n}}', { n: '7' })).toBe('7-7');
  });

  it('leaves text with no tokens untouched', () => {
    expect(applyPlaceholders('plain text', { a: 'b' })).toBe('plain text');
  });
});

describe('renderEmailShell (shared)', () => {
  it('renders the header image when headerImageUrl is provided', () => {
    const html = renderEmailShell({ site: 'gansid', content: '<p>hi</p>', headerImageUrl: 'https://x/y.png' });
    expect(html).toContain('src="https://x/y.png"');
    expect(html).not.toContain('header-brand-title'); // image replaces the wordmark
  });

  it('falls back to the wordmark when no image', () => {
    const html = renderEmailShell({ site: 'scago', content: '<p>hi</p>' });
    expect(html).toContain('header-brand-title');
    expect(html).toContain('SCAGO');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- emailShell`
Expected: FAIL — `Cannot find module '../supabase/functions/_shared/emailShell'`.

- [ ] **Step 3: Create the canonical shared module**

Create `supabase/functions/_shared/emailShell.ts` by copying the ENTIRE current body of `utils/emailShell.ts` (the `EmailPalette`/`EMAIL_PALETTES`/`EmailShellOptions`/`escapeHtml`/`renderEmailShell`/`mergePlaceholders`/`plainTextToHtml` definitions verbatim), with exactly two changes:

1. Replace the top type import `import type { SiteKey } from '../config/sites';` with a self-contained local type (Deno can't reach `config/sites` from `_shared/`):

```ts
// Self-contained so both the Deno edge runtime and the Vite client can import
// this file. Structurally identical to config/sites.ts SiteKey.
export type SiteKey = 'gansid' | 'scago';
```

2. Append the new send-time scrub function at the end:

```ts
/**
 * Send-time placeholder resolution. Unlike `mergePlaceholders` (which leaves
 * unknown tokens intact for admin discovery in the PREVIEW), this replaces
 * known tokens AND strips any remaining `{{…}}` to empty — so a raw
 * placeholder can never reach a recipient's inbox.
 */
export function applyPlaceholders(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  const resolved = mergePlaceholders(template, vars);
  // Scrub any leftover {{token}} (letters, digits, _, -, .) to empty.
  return resolved.replace(/\{\{\s*[\w.-]+\s*\}\}/g, '');
}
```

- [ ] **Step 4: Replace `utils/emailShell.ts` with a re-export**

Overwrite `utils/emailShell.ts` entirely with:

```ts
// Canonical email shell lives in supabase/functions/_shared/emailShell.ts so the
// Deno edge function (send-ticket-email) and the Vite client render byte-identical
// emails from ONE source. This re-export keeps the historical import path
// (`utils/emailShell`) working for all existing client call sites.
export * from '../supabase/functions/_shared/emailShell';
```

- [ ] **Step 5: Run the tsc + build acceptance gate (the cross-boundary import must hold)**

Run: `npx tsc --noEmit && npm run build`
Expected: both green. (Probed 2026-07-02, BOTH gates: a client re-export from `supabase/functions/_shared/*` typechecks despite the tsconfig `exclude` (imports override exclude), AND `npm run build` bundles it cleanly when routed through the real `utils/emailShell.ts` import graph — verified with a temporary probe export, built in ~31s.)
If tsc unexpectedly errors on the excluded path: FALLBACK — keep the full renderer in `utils/emailShell.ts` (canonical) and make `_shared/emailShell.ts` a byte-identical copy guarded by a new `tests/emailShellParity.test.ts` that reads both files and asserts the shared region is identical. Do NOT proceed until one of the two strategies is green.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- emailShell`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/emailShell.ts utils/emailShell.ts tests/emailShell.test.ts
git commit -m "feat(email): canonical shared email shell + send-time placeholder scrub"
```

---

## Task 2: Shared template resolver (override → global → default)

**Files:**
- Create: `supabase/functions/_shared/emailTemplates.ts`
- Create: `tests/emailTemplates.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/emailTemplates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveEmailTemplate, CORE_OVERRIDE_TEMPLATE_KEYS } from '../supabase/functions/_shared/emailTemplates';

const base = {
  defaultSubject: 'DEF SUB', defaultBody: 'DEF BODY',
  globalHeaderImageUrl: 'https://global/logo.png', globalFooterText: 'global footer',
};

describe('resolveEmailTemplate', () => {
  it('uses global app_settings when no form override', () => {
    const r = resolveEmailTemplate({ ...base, globalSubject: 'G SUB', globalBody: 'G BODY' });
    expect(r).toEqual({ subject: 'G SUB', body: 'G BODY', headerImageUrl: 'https://global/logo.png', footerText: 'global footer' });
  });

  it('falls back to default when global is empty', () => {
    const r = resolveEmailTemplate({ ...base, globalSubject: '', globalBody: undefined });
    expect(r.subject).toBe('DEF SUB');
    expect(r.body).toBe('DEF BODY');
  });

  it('per-form override wins per-field; unset fields inherit global', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G SUB', globalBody: 'G BODY',
      formOverride: { body: 'FORM BODY' }, // subject unset → inherits global
    });
    expect(r.subject).toBe('G SUB');
    expect(r.body).toBe('FORM BODY');
  });

  it('per-form header image overrides the global logo', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      formHeaderImageUrl: 'https://form/banner.png',
    });
    expect(r.headerImageUrl).toBe('https://form/banner.png');
  });

  it('ignores data: URI header images (Gmail/Outlook strip them) and falls through', () => {
    // SCAGO's live email_header_logo is a base64 data: SVG — must NOT ship in sends.
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      globalHeaderImageUrl: 'data:image/svg+xml;base64,AAAA',
    });
    expect(r.headerImageUrl).toBeUndefined();
    const r2 = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      formHeaderImageUrl: 'data:image/png;base64,BBBB', // bad form value falls through to global https
    });
    expect(r2.headerImageUrl).toBe('https://global/logo.png');
  });

  it('empty-string form override fields are ignored (treated as unset)', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G SUB', globalBody: 'G BODY',
      formOverride: { subject: '', body: '   ' },
    });
    expect(r.subject).toBe('G SUB');
    expect(r.body).toBe('G BODY');
  });

  it('exposes the 5 core override keys', () => {
    expect(CORE_OVERRIDE_TEMPLATE_KEYS).toEqual(['ticket', 'table-purchaser', 'guest', 'guest-claim', 'guest-confirmed']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- emailTemplates`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `supabase/functions/_shared/emailTemplates.ts`:

```ts
// Naming-agnostic email template resolution shared by the Deno edge function and
// the Vite client. Callers extract their own global strings (the edge reads
// snake_case app_settings columns; the client reads camelCase AppSettings), so
// this module never depends on either field-naming world. It owns ONLY the
// precedence rule: per-form override → global → hardcoded default.

export type EmailTemplateKey =
  | 'ticket' | 'table-purchaser' | 'guest' | 'guest-claim' | 'guest-confirmed'
  | 'guest-completion-notify' | 'staff-invite' | 'staff-confirmed'
  | 'exhibitor-staff-completion-notify'
  | 'bogo-ticket' | 'bogo-claim-link' | 'bogo-ticket-updated' | 'bogo-ticket-withdrawn'
  | 'group-invite' | 'contact-invite';

/** Templates exposed for per-form override in the FormBuilder UI (spec decision). */
export const CORE_OVERRIDE_TEMPLATE_KEYS = [
  'ticket', 'table-purchaser', 'guest', 'guest-claim', 'guest-confirmed',
] as const;

export interface FormTemplateOverride {
  subject?: string;
  body?: string;
}

export interface ResolveEmailTemplateInput {
  /** Per-form override for THIS template (already gated on emailOverrides.enabled). */
  formOverride?: FormTemplateOverride;
  globalSubject?: string | null;
  globalBody?: string | null;
  defaultSubject: string;
  defaultBody: string;
  formHeaderImageUrl?: string | null;
  globalHeaderImageUrl?: string | null;
  globalFooterText?: string | null;
}

export interface ResolvedEmailTemplate {
  subject: string;
  body: string;
  headerImageUrl: string | undefined;
  footerText: string | undefined;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

/**
 * Only http(s) image URLs are usable in real emails. Gmail and Outlook strip
 * `data:` URIs from <img src> (SCAGO's live email_header_logo is a base64
 * data: SVG — it renders in the admin preview iframe but would arrive broken
 * in an inbox), so data:/blob:/anything-else falls through to the next source.
 */
function usableImageUrl(v: string | null | undefined): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : undefined;
}

export function resolveEmailTemplate(input: ResolveEmailTemplateInput): ResolvedEmailTemplate {
  const subject = firstNonEmpty(input.formOverride?.subject, input.globalSubject, input.defaultSubject) ?? input.defaultSubject;
  const body = firstNonEmpty(input.formOverride?.body, input.globalBody, input.defaultBody) ?? input.defaultBody;
  const headerImageUrl = usableImageUrl(input.formHeaderImageUrl) ?? usableImageUrl(input.globalHeaderImageUrl);
  const footerText = firstNonEmpty(input.globalFooterText);
  return { subject, body, headerImageUrl, footerText };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- emailTemplates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/emailTemplates.ts tests/emailTemplates.test.ts
git commit -m "feat(email): shared override→global→default template resolver"
```

---

## Task 3: Edge `generateEmailTemplate` → thin adapter over the shared shell

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts:5` (add shared imports)
- Modify: `supabase/functions/send-ticket-email/index.ts:29-96` (replace `generateEmailTemplate` body)

**Why:** delegating to `renderEmailShell` makes all 14 edge send-sites render the shared shell; adding `headerImageUrl`/`footerText` params lets each site pass the banner; dropping the injected greeting makes the inbox match the admin preview (the preview renders the body only — the edge previously prepended its own `Hi {name},` on top of the template's own `Hello {{name}},`, causing a double greeting + a look the preview never showed).

- [ ] **Step 1: Add shared imports** near the existing imports at the top (after line 7, `import nodemailer`):

```ts
import { renderEmailShell, applyPlaceholders, type SiteKey } from '../_shared/emailShell.ts';
import { resolveEmailTemplate } from '../_shared/emailTemplates.ts';
```

(Deno requires the explicit `.ts` extension — see CLAUDE.md §18. Even though the file is `// @ts-nocheck`, keep the extension so the `--use-api` bundler resolves it.)

- [ ] **Step 2: Replace the whole `generateEmailTemplate` function** (current lines 29–96) with a thin adapter that preserves the call signature and adds optional branding:

```ts
/**
 * Adapter kept for call-site compatibility. Delegates to the ONE shared shell
 * (utils/emailShell.ts ⇄ _shared/emailShell.ts) so admin previews and real
 * sends are byte-identical. Notes:
 *  - The template body owns its own greeting ("Hello {{name}},"); we no longer
 *    inject a separate greeting line (that caused a double greeting and a look
 *    the preview never showed). `greeting` is accepted but ignored.
 *  - `headerImageUrl` renders the branded banner; omit → wordmark fallback.
 */
function generateEmailTemplate(data: {
    title: string;
    greeting?: string;
    content: string;
    attachmentNote?: string;
    fromName?: string;
    headerImageUrl?: string;
    footerText?: string;
}) {
    // Site detection: the project ref in SUPABASE_URL is deterministic per tenant
    // (gticuvgclbvhwvpzkuez = GANSID, iigbgbgakevcgilucvbs = SCAGO). The old
    // /gansid/i-on-fromName heuristic stays only as a last-resort fallback — an
    // admin renaming email_from_name to e.g. "Congress 2026" must NOT flip the
    // palette to SCAGO red on GANSID.
    const projectUrl = Deno.env.get('SUPABASE_URL') || '';
    const site: SiteKey = projectUrl.includes('gticuvgclbvhwvpzkuez') ? 'gansid'
        : projectUrl.includes('iigbgbgakevcgilucvbs') ? 'scago'
        : (/gansid/i.test((data.fromName && data.fromName.trim()) || 'SCAGO') ? 'gansid' : 'scago');
    const attachHtml = data.attachmentNote
        ? `<div style="margin-top:24px;background:rgba(0,0,0,0.03);border-radius:10px;padding:14px 18px;font-size:14px;color:#4b5563;">📎 ${data.attachmentNote}</div>`
        : '';
    return renderEmailShell({
        site,
        content: data.content + attachHtml,
        headerImageUrl: data.headerImageUrl && data.headerImageUrl.trim() ? data.headerImageUrl : undefined,
        footerText: data.footerText && data.footerText.trim() ? data.footerText : undefined,
    });
}
```

- [ ] **Step 3: Deploy to GANSID only + smoke test** (edge isn't covered by repo tsc/Vitest; verify by deploy)

Run:
```bash
npx --yes supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
curl -s -X POST "https://gticuvgclbvhwvpzkuez.supabase.co/functions/v1/send-ticket-email" -H "Content-Type: application/json" -d '{"mode":"registration-confirmed"}'
```
Expected: deploy succeeds; curl returns a JSON error like `{"error":"Primary not found"}` or a 4xx — proving the real function loaded (NOT a bundler/import failure). A bundling error (`Failed to bundle … timed out`) means the `.ts` import path or a remote import broke — fix before continuing.

> Do NOT commit-and-deploy SCAGO yet. GANSID is the canary until Task 8's inbox check.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "refactor(email): generateEmailTemplate delegates to shared shell + header image support"
```

---

## Task 4: `registration-confirmed` mode — resolver + scrub + image (the reported bug)

**Files:** Modify `supabase/functions/send-ticket-email/index.ts:241-311`

This is the exact path behind the user-reported ticket-confirmation email (image missing + literal `{{…}}`). It is the worked example; Tasks 5–7 apply the identical pattern to the remaining modes per the checklist.

- [ ] **Step 1: Widen the form lookup** (line ~253) from `.select('title')` to include settings:

```ts
const { data: form } = await supabase
    .from('forms').select('title, settings').eq('id', primary.form_id).maybeSingle();
const eventName = form?.title || 'the event';
const formEmailOverrides = (form as any)?.settings?.emailOverrides;
```

- [ ] **Step 2: Replace the template-selection + `replace` + `generateEmailTemplate` block** (current lines ~270–302) with resolver + scrub + branded render:

```ts
// Which template key? Table/group purchaser gets the table variant.
const key = isTableOrGroup ? 'table-purchaser' : 'ticket';
const overrideOn = formEmailOverrides?.enabled === true;
const formOverride = overrideOn ? formEmailOverrides?.templates?.[key] : undefined;

const tpl = resolveEmailTemplate({
    formOverride,
    globalSubject: isTableOrGroup ? s.email_table_purchaser_subject : s.email_subject,
    globalBody: isTableOrGroup ? s.email_table_purchaser_body : s.email_body_template,
    defaultSubject: 'Your registration for {{event}} is confirmed',
    defaultBody: '<p>Hello {{name}},</p><p>Thank you for registering for <strong>{{event}}</strong>. Your registration is confirmed.</p>',
    formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
    globalHeaderImageUrl: s.email_header_logo,
    globalFooterText: s.email_footer_text,
});

const downloadUrl = body.downloadUrl || '';
const downloadBlock = downloadUrl
    ? `<div style="margin-top:20px;padding:16px 18px;background:#f0f7ff;border-left:3px solid #1E4A8C;border-radius:6px;">
         <p style="margin:0 0 10px;font-weight:600;">Your tickets</p>
         <p style="margin:0 0 12px;font-size:14px;color:#475569;">Download your ticket(s) — including any guests — using the button below. Keep this email; the link stays valid through the event.</p>
         <p style="text-align:center;margin:8px 0;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Download your tickets</a></p>
       </div>`
    : '';

const vars = {
    event: eventName,
    name: primary.name || '',
    id: primary.id || '',
    invoiceId: primary.invoice_id || '',
    amount: primary.payment_amount || '',
    download_url: downloadUrl,
};
const subject = applyPlaceholders(tpl.subject, vars);
const contentHtml = applyPlaceholders(tpl.body, vars) + downloadBlock;
const html = generateEmailTemplate({
    title: eventName,
    content: contentHtml,
    fromName: smtpConfig?.fromName,
    headerImageUrl: tpl.headerImageUrl,
    footerText: tpl.footerText,
});
```

(Delete the old `const replace = …`, `const rawSubject/rawBody = …`, and the old `generateEmailTemplate({ …, greeting: … })` — they are fully replaced above.)

- [ ] **Step 2b: Confirm `guestCount` reflects table/group.** The `isTableOrGroup` variable already exists in this block (from the `count` query at lines ~258-261) — keep it. `key`/`vars` reference it after it is defined.

- [ ] **Step 3: Deploy to GANSID + send a real confirmation to yourself**

Run:
```bash
npx --yes supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
```
Then trigger a real `registration-confirmed` (e.g. issue a ticket to a contact via the Contacts → Send ticket flow to `datadaps@gmail.com`, or re-run verify-payment for a test reg). 
Expected in the inbox: the GANSID Congress **banner image** header, the body greeting once (no double "Hi/Hello"), and **no** literal `{{…}}` anywhere.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "fix(email): registration-confirmed uses resolver+scrub+banner (fixes missing image + {{name}} leak)"
```

---

## Task 5: Remaining event modes — group-invite, guest-claim-completed, staff modes

**Files:** Modify `supabase/functions/send-ticket-email/index.ts` (modes at lines 172, 317, 442, 552, 621, 699)

Apply the SAME four moves from Task 4 to each mode below. For each: (a) widen its `forms` `.select('title')` → `.select('title, settings')` and read `formEmailOverrides`; (b) build a `vars` object from the mode's existing `.replace()` map; (c) `subject = applyPlaceholders(tplSubject, vars)`, `content = applyPlaceholders(tplBody, vars) + extraBlocks`; (d) pass `headerImageUrl: s.email_header_logo` (+ per-form override if `enabled`) and `footerText: s.email_footer_text` into `generateEmailTemplate`, and DELETE the `greeting:` argument.

Per-mode specifics (line numbers are current pre-edit anchors; the executor re-locates after earlier edits shift them):

| Mode (line) | Template key | app_settings subject / body columns | `vars` keys (from existing replace map) | Token gaps to ADD |
|---|---|---|---|---|
| `group-invite` (172) | `group-invite` | `email_guest_claim_subject` / `email_guest_claim_body` | name, purchaser, event, complete_url, signup_url | — |
| `guest-claim-completed` guest send (317→364) | `guest-confirmed` | `email_guest_confirmed_subject` / `email_guest_confirmed_body` | name, event, registration_id, qr_image_url | **add `purchaser`** (fetch primary name; default body references it) |
| `guest-claim-completed` notify send (→395) | `guest-completion-notify` | `email_guest_completion_notify_subject` / `email_guest_completion_notify_body` | name, purchaser, event | — |
| `staff-invite` (442) | `staff-invite` | `email_staff_invite_subject` / `email_staff_invite_body` | name, purchaser, org_name, category, event, complete_url, signup_url | — |
| `staff-claim-completed` (552) | `staff-confirmed` | `email_staff_confirmed_subject` / `email_staff_confirmed_body` | name, org_name, event | — |
| `exhibitor-staff-invite` (621) | `staff-invite` | `email_staff_invite_subject` / `email_staff_invite_body` | name, purchaser, org_name, category, event, complete_url, signup_url | — |
| `exhibitor-staff-claim-completed` (699) | `exhibitor-staff-completion-notify` | `email_exhibitor_staff_completion_notify_subject` / `email_exhibitor_staff_completion_notify_body` | name, org_name, event | — |

For each mode keep its existing default subject/body strings as `defaultSubject`/`defaultBody` in the `resolveEmailTemplate` call (don't invent new copy). Modes whose form is not fetched via a `forms` select (some staff modes read `eventName` from the request body) simply pass `formOverride: undefined` and `globalHeaderImageUrl: s.email_header_logo` — no per-form override for those in Part 1.

- [ ] **Step 1:** Edit `group-invite` (line 172) per the pattern + table row.
- [ ] **Step 2:** Edit both sends inside `guest-claim-completed` (lines 317/364 + 395) per the pattern, with TWO mode-specific fixes (this is the CONFIRMED live literal-braces bug — GANSID's live `email_guest_confirmed_body` contains `<strong>{{purchaser}}</strong> has registered you…` and the guest send's replace map has no `purchaser`, so inline group guests receive literal `{{purchaser}}` where a person's name should be):
  - **Hoist the primary fetch.** Today the primary row is fetched at lines ~377-382 (AFTER the guest send at ~345-374). Move that fetch ABOVE the guest send so both sends can use it:

```ts
// Fetch the purchaser up-front — the guest confirmation template references
// {{purchaser}} (live GANSID template does), and the notify send needs it too.
let primary: { name: string | null; email: string | null } | null = null;
if (attendee.primary_attendee_id) {
    const { data } = await supabase
        .from('attendees')
        .select('name, email')
        .eq('id', attendee.primary_attendee_id)
        .maybeSingle();
    primary = data;
}
```
  Then the notify block (step 2 of the mode) reuses `primary` instead of re-fetching, and the guest send's `vars` gains `purchaser: primary?.name || 'The purchaser'`.
  - **Fold a greeting into the guest-send default body** (the current L354 default has none — it relied on the injected greeting we're removing). New `defaultBody` for the `resolveEmailTemplate` call: prepend `<p>Hi {{name}},</p>` to the existing default string (keep the QR block etc. unchanged).
- [ ] **Step 3:** Edit `staff-invite` (442), `staff-claim-completed` (552), `exhibitor-staff-invite` (621), `exhibitor-staff-claim-completed` (699) per the pattern.
- [ ] **Step 4: Deploy to GANSID + smoke**

Run:
```bash
npx --yes supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
curl -s -X POST "https://gticuvgclbvhwvpzkuez.supabase.co/functions/v1/send-ticket-email" -H "Content-Type: application/json" -d '{"mode":"group-invite"}'
```
Expected: deploy succeeds; curl returns a clean JSON 4xx (missing fields), not a bundling error.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "fix(email): event/staff modes route through resolver+scrub+banner"
```

---

## Task 6: BOGO modes — resolver + scrub + image + `free_category_name`

**Files:** Modify `supabase/functions/send-ticket-email/index.ts` (modes at lines 837, 896, 948, 1000)

Apply the same pattern. All four BOGO modes fetch or can reach the free/source row; widen any `forms` `.select('title')` (line ~823) to `title, settings`.

| Mode (line) | Template key | app_settings columns | `vars` keys | Token gaps to ADD |
|---|---|---|---|---|
| `bogo-ticket` (837) | `bogo-ticket` | `email_bogo_ticket_subject` / `email_bogo_ticket_body` | name, purchaser, event, qr_image_url, registration_id, signup_url, admin_contact | **add `free_category_name`** |
| `bogo-claim-link` (896) | `bogo-claim-link` | `email_bogo_claim_link_subject` / `email_bogo_claim_link_body` | payer_name, event, claim_url, portal_tickets_url, admin_contact | — |
| `bogo-ticket-updated` (948) | `bogo-ticket-updated` | `email_bogo_ticket_updated_subject` / `email_bogo_ticket_updated_body` | name, purchaser, event, qr_image_url, admin_contact | — |
| `bogo-ticket-withdrawn` (1000) | `bogo-ticket-withdrawn` | `email_bogo_ticket_withdrawn_subject` / `email_bogo_ticket_withdrawn_body` | name, purchaser, event, admin_contact | — |

- [ ] **Step 1: `free_category_name` lookup for `bogo-ticket`.** The free row carries `pricing_category_id` + `pricing_template_id`. IMPORTANT: the category list is NOT in `form.settings` — `form.settings.pricingTemplate` is runtime-attached by the client's `getFormById` and never persisted (types.ts:300). In the edge you must fetch the `pricing_templates` TABLE (its `categories` column is jsonb; each category is `{ id, name, prices, … }` — the display field is **`name`**, not `label`). Add near the top of the `bogo-ticket` block, after `free` and `form` are fetched:

```ts
// Human label for the free guest's pricing category (advertised as {{free_category_name}}).
// categories live in the pricing_templates TABLE (jsonb), keyed by `name`.
let freeCategoryName = '';
try {
    const catId = (free as any).pricing_category_id;
    const tplId = (free as any).pricing_template_id || (form as any)?.settings?.pricingTemplateId;
    if (catId && tplId) {
        const { data: pt } = await supabase
            .from('pricing_templates').select('categories').eq('id', tplId).maybeSingle();
        const cats = Array.isArray((pt as any)?.categories) ? (pt as any).categories : [];
        freeCategoryName = (cats.find((c: any) => c.id === catId)?.name) || '';
    }
} catch { freeCategoryName = ''; }
```
Then include `free_category_name: freeCategoryName` in `vars`. (If the category name isn't reachable, the scrub blanks it — never a raw `{{free_category_name}}`.)

- [ ] **Step 2:** Edit all four BOGO modes per the pattern + table.
- [ ] **Step 3: Deploy to GANSID + smoke**

Run:
```bash
npx --yes supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
curl -s -X POST "https://gticuvgclbvhwvpzkuez.supabase.co/functions/v1/send-ticket-email" -H "Content-Type: application/json" -d '{"mode":"bogo-ticket"}'
```
Expected: deploy succeeds; clean JSON 4xx.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "fix(email): BOGO modes route through resolver+scrub+banner; render free_category_name"
```

---

## Task 7: `ticket` fallthrough mode (checkout + admin resend PDFs) — banner + no double greeting

**Files:** Modify `supabase/functions/send-ticket-email/index.ts:1085-1105`

This mode wraps client-pre-rendered `message` (the checkout consolidated email + AttendeeModal "Resend"). It doesn't currently load `app_settings`, so it has no banner. Add a lightweight settings fetch for branding only.

- [ ] **Step 1: Fetch branding columns** just before `const html = generateEmailTemplate(` at line ~1099. A Supabase client is already created earlier in the handler; reuse it (or create one from env as other modes do):

```ts
// Branding for the shared shell (global only on this path; per-form header
// override applies to the P4 registration-confirmed path, not the PDF path).
let ticketHeaderImage: string | undefined;
let ticketFooterText: string | undefined;
try {
    const sbUrl = Deno.env.get('SUPABASE_URL')!;
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(sbUrl, sbKey);
    const { data: appS } = await sb.from('app_settings').select('email_header_logo, email_footer_text').eq('id', 1).maybeSingle();
    ticketHeaderImage = (appS as any)?.email_header_logo || undefined;
    ticketFooterText = (appS as any)?.email_footer_text || undefined;
} catch { /* branding is best-effort; fall back to wordmark */ }
```

- [ ] **Step 2: Update the `generateEmailTemplate` call** at line ~1099 to drop `greeting` and pass branding:

```ts
const html = generateEmailTemplate({
    title: bannerTitle,
    content: messageHtml,
    attachmentNote: hasAttachments ? 'Attachment included — please review the PDF.' : undefined,
    fromName,
    headerImageUrl: ticketHeaderImage,
    footerText: ticketFooterText,
});
```

- [ ] **Step 3: Deploy to GANSID + real resend test.** Deploy, then open any GANSID attendee in the dashboard → "Resend Ticket Email". Expected inbox: banner header + attached PDF(s) + no double greeting + no raw `{{…}}`.

```bash
npx --yes supabase functions deploy send-ticket-email --project-ref gticuvgclbvhwvpzkuez --use-api
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "fix(email): ticket/resend path renders branded banner"
```

---

## Task 8: Client paths — resend scrub + stale SMTP gate + checkout scrub

**Files:**
- Modify: `utils/resendTicketEmail.ts:46-49, 103-108`
- Modify: `components/PublicRegistration.tsx` (checkout purchaser email compose)

- [ ] **Step 1: Relax the stale SMTP gate in `resendTicketEmail.ts`** (lines 46–49). Env-first SMTP means the client can't see the real creds; GANSID's `smtp_pass` is intentionally cleared. Change:

```ts
  const settings = await getSettings();
  // Env-first SMTP (Resend on GANSID) means the client cannot see the real
  // credentials; smtp_pass is intentionally cleared on GANSID. Only block when
  // NOTHING is configured on either side (smtp_user present keeps the gate green).
  if (!settings.smtpUser && !settings.smtpPass) {
    throw new Error('SMTP is not configured. Set it up in Settings before resending tickets.');
  }
```

- [ ] **Step 2: Route resend substitution through the scrub** (lines 103–108). Replace the chained `render` with `applyPlaceholders` so no advertised-but-unmapped token leaks:

```ts
import { applyPlaceholders } from './emailShell';
// …
  const render = (str: string) => applyPlaceholders(str, {
    event: fresh.formTitle || form?.title || '',
    name: primaryDisplayName,
    id: fresh.id || '',
    invoiceId: fresh.invoiceId || '',
    amount: fresh.paymentAmount || '',
  });
```

(Add the `applyPlaceholders` import at the top with the other `./` imports.)

- [ ] **Step 3: Route `PublicRegistration.tsx` per-guest sends through the scrub.** (Audited 2026-07-02: the PURCHASER confirmation is server-side since P4 — `verify-payment` sends it via `registration-confirmed`; there is NO client purchaser compose to change.) Two per-guest sends remain client-side and currently use complete-but-hand-rolled `.replace()` chains:
  - ~L1732-1738 — guest-confirmed compose from `settings.emailGuestConfirmedSubject/Body` (vars: event, purchaser, name, signup_url)
  - ~L1769-1776 — named-guest compose from `settings.emailGuestSubject/Body` (vars: event, purchaser, name)

  Replace each chain with `applyPlaceholders(template, vars)` (import from `../utils/emailShell`), keeping the exact same var values. Behavior today is identical; the win is the scrub — a future admin edit adding an unmapped token can no longer leak.

- [ ] **Step 3b: ManualTicketTool — substitute admin free-text before sending (CONFIRMED leak source #2).** `components/ManualTicketTool.tsx` sends `customSubject`/`customMessage` raw to `sendTicketEmail` at BOTH send sites (~L404-410 new-ticket, ~L457-468 resend). An admin pasting template copy containing `{{name}}` ships literal braces. At each site, wrap both fields:

```ts
import { applyPlaceholders } from '../utils/emailShell';
// New-ticket site (~404):
const vars = {
  name: primary.name || '',
  event: selectedForm?.title || 'the event',
  id: primary.id || '',
  amount: primary.paymentAmount || '',
};
await sendTicketEmail(settings, {
  to: formData.email,
  subject: applyPlaceholders(customSubject, vars),
  name: primary.name,
  title: selectedForm?.title || undefined,
  message: applyPlaceholders(customMessage, vars),
  attachments,
});
// Resend site (~457): same wrap with vars from selectedAttendee + its form title.
```
(The hardcoded defaults contain no tokens, so default sends are byte-identical; only pasted-template sends change — from broken to correct.)

- [ ] **Step 3c: EmailTemplatesTab preview/test-send footer parity.** The preview passes `headerImageUrl: settings.emailHeaderLogo` but confirm it ALSO passes `footerText: settings.emailFooterText` to `renderEmailShell` (and the test send likewise) — the resolver now feeds `email_footer_text` into every real send, so the preview must show the same footer. Add the option if missing (one line at the `renderEmailShell` call, ~L358/418).

- [ ] **Step 4: Verify client gates**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add utils/resendTicketEmail.ts components/PublicRegistration.tsx
git commit -m "fix(email): client resend/checkout use shared scrub; relax stale SMTP gate for env-first Resend"
```

---

## Task 9: Preview parity + cold audit + SCAGO rollout

- [ ] **Step 1: Verify preview == inbox for GANSID.** In the dev server, open Settings → Email Templates; the preview already calls `renderEmailShell({ headerImageUrl: settings.emailHeaderLogo })`. Confirm the live GANSID inbox emails from Tasks 4–7 now visually match that preview (same banner, footer, single greeting).

- [ ] **Step 2: Cold-context audit** (CLAUDE.md §16 rule 6). Dispatch a fresh subagent to audit the full diff for: any remaining `generateEmailTemplate({ …, greeting })` call still injecting a greeting; any mode still using a raw `.replace()` chain instead of `applyPlaceholders`; any `forms` select that needed widening but was missed; the cross-boundary import health; and that no non-email behavior changed. Fix findings.

- [ ] **Step 2b (optional data fix, recommended): give the `guest` template a greeting.** Live `email_guest_body` on BOTH tenants starts `Great news! {{purchaser}} has registered you…` with no greeting — it relied on the injected greeting we removed, so guest emails would now start abruptly (preview shows the same, so it's consistent, but slightly impersonal). One-line data fix per tenant (GANSID via CLI `db query`, SCAGO via MCP `execute_sql` — §16 rule 1):

```sql
UPDATE app_settings SET email_guest_body = '<p>Hi {{name}},</p><p>' || email_guest_body || '</p>'
WHERE id = 1 AND email_guest_body IS NOT NULL AND email_guest_body NOT ILIKE '%{{name}}%';
```
(Verify with a SELECT after; the guard clause makes it idempotent and skips templates an admin already personalized.)

- [ ] **Step 3: Deploy SCAGO + inbox check.** Only after GANSID is confirmed good:

```bash
npx --yes supabase functions deploy send-ticket-email --project-ref iigbgbgakevcgilucvbs --use-api
curl -s -X POST "https://iigbgbgakevcgilucvbs.supabase.co/functions/v1/send-ticket-email" -H "Content-Type: application/json" -d '{"mode":"registration-confirmed"}'
```
Then send one real SCAGO ticket/resend and confirm it renders the SCAGO shell. NOTE (verified live): SCAGO's `email_header_logo` is a base64 `data:` SVG — the resolver's `usableImageUrl` intentionally drops it, so SCAGO emails render the SCAGO-red **wordmark** header. That is correct behavior (Gmail would have shown a broken image otherwise); if SCAGO wants a banner later, upload a hosted PNG in Settings like GANSID's (`…/sponsor-logos/branding/email-header-logo-….png`). Expected: clean JSON 4xx from curl; SCAGO email uses SCAGO red palette, no regressions.

- [ ] **Step 4: Post-deploy DB smoke** (CLAUDE.md §15). No migration ran, but confirm nothing else broke:

```bash
npm run smoke:db
```
Expected: green on both tenants.

- [ ] **Step 5: Commit any audit fixes**

```bash
git add -A
git commit -m "chore(email): cold-audit fixes + SCAGO rollout of unified branded email"
```

---

# PART 2 — Per-form override toggle

## Task 10: `emailOverrides` type

**Files:** Modify `types.ts:294-298`

- [ ] **Step 1: Add the field** to `FormSettings.settings`, right after `bogoNoteToBuyer?: string;` (line ~297) and before the closing `};`:

```ts
    /** Per-form email template overrides. Default OFF → the form uses the
     *  global Email Templates (app_settings). When `enabled` is true, any
     *  per-template subject/body set here wins; unset fields inherit global.
     *  Lives in the forms.settings jsonb — additive, no migration. */
    emailOverrides?: {
      enabled?: boolean;
      headerImageUrl?: string;
      templates?: Partial<Record<
        'ticket' | 'table-purchaser' | 'guest' | 'guest-claim' | 'guest-confirmed',
        { subject?: string; body?: string }
      >>;
    };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: green. (The edge already reads this shape via `(form as any).settings.emailOverrides` — no edge change needed; the resolver honors it from Part 1.)

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(email): FormSettings.emailOverrides type (additive, no migration)"
```

---

## Task 11: FormBuilder "Email Customization" section

**Files:**
- Create: `components/FormBuilder/EmailOverridesSection.tsx`
- Modify: the FormBuilder Settings tab host component that renders per-form overrides (co-located with the existing PDF/success-page override UI — locate by searching FormBuilder for `pdfSettings` or `successTitle`).

- [ ] **Step 1: Build the section component.** A collapsible card:
  - Master toggle bound to `form.settings.emailOverrides.enabled`.
  - When ON: an optional "Header image URL" input bound to `emailOverrides.headerImageUrl` (placeholder: "Leave blank to use the global Email Templates banner"), and for each of the 5 `CORE_OVERRIDE_TEMPLATE_KEYS` a subject input + a body editor (reuse `RichTextEditor` from `components/RichTextEditor`, as EmailTemplatesTab does), each bound to `emailOverrides.templates[key].{subject,body}`. Show placeholder chips from a client `CORE_OVERRIDE_TEMPLATES` label/placeholder map (define inline in this component: `ticket`→['name','event','id','invoiceId','amount'], `table-purchaser`→ same, `guest`→['name','purchaser','event'], `guest-claim`→['name','purchaser','event','complete_url','signup_url'], `guest-confirmed`→['name','purchaser','event','registration_id','qr_image_url']). An empty field shows an "inheriting global" hint.
  - When OFF: collapsed body with the note "This form uses the global Email Templates. Turn on to customize."
  - Immutable-update the nested `settings.emailOverrides` object (spread, never mutate) and call the same `onChange`/`updateForm` the sibling PDF section uses.
  - Modal/portal note (CLAUDE.md §16 rule 7): this renders inline inside the Settings tab (not a fixed-position modal), so no `createPortal` needed — but if it opens any sub-modal, portal it to `document.body`.

- [ ] **Step 2: Mount it** in the Settings tab host, directly below the existing PDF-ticket override section.

- [ ] **Step 3: Verify in the browser** (`npm run dev`): toggle ON for a test form, set a distinctive ticket subject/body + a header image URL, save. Then trigger that form's `registration-confirmed` (issue a ticket) and confirm the override subject/body + header render. Toggle OFF, re-issue, confirm it reverts to global.

- [ ] **Step 4: Gates + commit**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: green.

```bash
git add components/FormBuilder/EmailOverridesSection.tsx components/FormBuilder/*
git commit -m "feat(email): per-form Email Customization override UI (5 core templates)"
```

---

## Task 12: Docs + CLAUDE.md (CLAUDE.md §16 rule 11)

- [ ] **Step 1:** Bump the `Last refreshed` date at the top of CLAUDE.md; add a §19 entry (newest-first) summarizing the unified email shell + per-form overrides + the two bug fixes, linking `supabase/functions/_shared/emailShell.ts`, `_shared/emailTemplates.ts`, `send-ticket-email/index.ts`.
- [ ] **Step 2:** Update §14 (Email system) to state that all sends render through the ONE shared `renderEmailShell` (client `utils/emailShell.ts` re-exports `_shared/emailShell.ts`), that `applyPlaceholders` scrubs unresolved tokens at send time, and that `form.settings.emailOverrides` overrides global templates per-form. Add a §18 gotcha: "email copy/branding is global by default; per-form override lives in `forms.settings.emailOverrides` (additive jsonb, no migration) — the edge reads it via the shared resolver."
- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(email): document unified email shell + per-form overrides"
```

---

## Self-review notes (for the executor)

- **Spec coverage:** shared renderer (Task 1) ✓; image on every path (Tasks 3–7) ✓; placeholder scrub (Task 1 + applied Tasks 4–8) ✓; override→global→default resolver (Task 2, wired Tasks 4–6) ✓; per-form data model (Task 10) + UI (Task 11) ✓; both bugs (Task 4 for the reported path, structurally everywhere) ✓; SCAGO GANSID-first rollout (Task 9) ✓; no migration ✓; tests before deploy ✓ (Tasks 1–2); cold audit (Task 9) ✓.
- **Type consistency:** `applyPlaceholders`, `resolveEmailTemplate`, `renderEmailShell`, `SiteKey`, `EmailTemplateKey`, `CORE_OVERRIDE_TEMPLATE_KEYS` are the exact names defined in Tasks 1–2 and reused verbatim thereafter.
- **Naming worlds:** the edge passes snake_case `s.email_*` columns as `globalSubject/globalBody`; the client passes camelCase `settings.email*`. The resolver is naming-agnostic by design (callers extract their own strings) — do not add field-name maps to `_shared/`.
- **Risk backstops:** Task 1 Step 5 gates the cross-boundary import (both tsc AND build already probed green 2026-07-02; fallback = twin+parity test); every edge task deploys GANSID-only until Task 9; edge deploys are CLI `--use-api` (never MCP); no DB migration so no dual-tenant schema risk.

## Pre-implementation audit findings (2026-07-02, verified against live data + code)

1. **Smoking gun for the reported literal-braces bug:** GANSID's live `email_guest_confirmed_body` = `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered yo…` but the `guest-claim-completed` guest-send replace map (index.ts:356-360) has NO `purchaser` token → inline group guests receive literal `{{purchaser}}` where a person's name belongs. Fixed by Task 5 Step 2 (hoisted primary fetch + var). The scrub (Task 1) guarantees the class is dead everywhere else.
2. **SCAGO's `email_header_logo` is a base64 `data:` SVG** — Gmail/Outlook strip `data:` images. Resolver's `usableImageUrl` (Task 2) only accepts http(s), so SCAGO falls back to the wordmark header instead of shipping a broken image. GANSID's logo is a hosted PNG (verified) → renders everywhere.
3. **Greeting audit (live, both tenants):** every populated template body already opens with its own greeting (`Hi {{name}},` etc.) EXCEPT `email_guest_body` ("Great news! …" — optional data fix in Task 9 Step 2b) — so removing the injected greeting fixes the current double-greeting without orphaning any template. Two hardcoded defaults lacked greetings and are patched in-plan: `registration-confirmed` (Task 4 default) and the `guest-claim-completed` guest send (Task 5 Step 2).
4. **Site-detection hardening:** palette selection previously keyed off `/gansid/i` on `email_from_name` (GANSID live value "GANSID Congress 2026" works, but a rename would flip GANSID emails to SCAGO red). Task 3 now derives the site from the SUPABASE_URL project ref (deterministic per tenant), fromName as last-resort fallback.
5. **`free_category_name` source corrected:** categories live in the `pricing_templates` TABLE (jsonb `categories`, display field `name` — NOT `label`, and NOT `form.settings.pricingTemplate`, which is runtime-attached client-side only). Task 6 Step 1 rewritten.
6. **Every edge mode fetches `app_settings`** (verified: 10 fetch sites + fallthrough addition in Task 7) — branding columns are reachable in all modes without request-contract changes.
7. **Second confirmed leak source — ManualTicketTool** sends admin free-text `customSubject`/`customMessage` with NO substitution (L404-410, L457-468); pasting template copy ships literal `{{name}}`. Fixed in Task 8 Step 3b. All other client composes were audited SAFE (complete maps or `mergePlaceholders` with full vars): PublicRegistration per-guest sends, resendTicketEmail, BulkImportModal, SendUserEmailModal, sponsor SendInvitationModal (`mergeTemplate` already blanks unknowns), FormPreview/Settings diagnostics (no tokens).
8. **PublicRegistration has no client purchaser compose anymore** (P4 moved it server-side) — plan Task 8 Step 3 rescoped to the two per-guest sends only.
9. **No existing tests import `utils/emailShell`** — the re-export cannot break the current suite. `raw-html` + `contact-register-invite` edge modes verified to send caller HTML as-is (their banner comes from the client shell; correctly left untouched).
