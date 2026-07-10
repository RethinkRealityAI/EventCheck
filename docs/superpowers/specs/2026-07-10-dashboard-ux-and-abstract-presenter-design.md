# Dashboard UX fixes + Abstract Presenter pricing category — design

Date: 2026-07-10

## 1. Unified page-size control

**Problem.** The `itemsPerPage` dropdown ([AttendeeList.tsx](../../../components/AttendeeList.tsx)) already shares one piece of state across Live/Test/Donated/Tables/Sponsor Tickets/Groups/Speakers, defaults to 20, and lives inside a toolbar row that's hidden on the Signups/Contacts tabs. Three tabs bypass it entirely:
- **Exhibitors** ([ExhibitorsTab.tsx](../../../components/Exhibitor/ExhibitorsTab.tsx)) renders every row, no pagination.
- **Signups** ([SignupsTab.tsx](../../../components/Signups/SignupsTab.tsx)) has its own fixed `pageSize` (15 desktop / 10 mobile).
- **Contacts** ([ImportedContactsTab.tsx](../../../components/Contacts/ImportedContactsTab.tsx)) hard-caps at `slice(0, 500)`, no control at all.

**Design.**
- Change the default `itemsPerPage` from 20 to 50 (whitelist stays `[10, 20, 25, 50, 100]`; localStorage key unchanged).
- Move the `<select>` out of the per-tab-conditional toolbar row into an always-rendered overhead position next to the tab switcher, so it never disappears regardless of `activeTab`.
- Thread `itemsPerPage` (and page nav) as props into `ExhibitorsTab`, `SignupsTab`, `ImportedContactsTab`:
  - `ExhibitorsTab` gains real pagination driven by the shared value (currently has none).
  - `SignupsTab` drops its internal fixed 15/10 `pageSize` state in favor of the prop.
  - `ImportedContactsTab` drops the hard `slice(0, 500)` cap in favor of real pagination driven by the prop.
- Each tab keeps its own `currentPage` (resetting to 1 on tab/search/filter change, as today) — only the *size* is shared.

## 2. Country column

**Problem.** There's no dedicated "Country" column today. What looked like one is the generic per-form dynamic answer column (`dynamicColumns` in AttendeeList.tsx, only available when one specific form is selected): it prints `String(val)` for a form's `country`-type field, showing the raw ISO code (`IN`) instead of the full name.

**Design.** Promote this to a real standalone standard column rather than patching the per-form dynamic column, because BOGO free-guest rows (see §4) don't belong to any form field and need to surface a country too, and the per-form dynamic column doesn't exist at all in the "All Forms" view.

- New pure helper `utils/resolveAttendeeCountry.ts`:
  ```ts
  export function resolveAttendeeCountryCode(
    attendee: Pick<Attendee, 'answers'>,
    form: Form | undefined,
  ): string | null {
    const guestCountry = attendee.answers?.['_guest_country'];
    if (typeof guestCountry === 'string' && guestCountry) return guestCountry;
    if (!form) return null;
    const countryField = form.fields.find(f => f.type === 'country');
    if (!countryField) return null;
    const val = attendee.answers?.[countryField.id];
    return typeof val === 'string' && val ? val : null;
  }
  ```
- Add `{ key: 'country', label: 'Country', group: 'standard' }` to `STANDARD_COLUMNS`. Cell renders `getCountryName(code)` (already imported/used elsewhere) or a muted dash when null.
- `matchesSearch` gains a match against the resolved country's full name, alongside the existing ticketType/category/etc. matches.

## 3. Abstract Presenter pricing category (GANSID)

Confirmed live data (queried 2026-07-10):
- Pricing template `c569ab4f-883b-42e9-8892-4405fa67217e` (GANSID project `gticuvgclbvhwvpzkuez`), tiers `tier1`/`tier2`, brackets `early_bird`/`regular`/`onsite`. Categories array order: `physician, trainee, student, nurse, industry, patient_org, patient, speaker`.
- Landing page fees table is CMS-driven: a live `site_content` row (`site='gansid', page='landing'`, last edited 2026-07-06) overrides the `landingDefaults.ts` fallback. Both must be edited.

**Design.**
- Insert a new category into the `pricing_templates.categories` array, positioned between `trainee` and `student`:
  ```json
  {
    "id": "abstract_presenter",
    "name": "Abstract Presenters",
    "prices": {
      "tier1": { "early_bird": 10000, "regular": 10000, "onsite": 15000 },
      "tier2": { "early_bird": 15000, "regular": 15000, "onsite": 20000 }
    },
    "requiresPromoCode": null
  }
  ```
  (cents; Early Bird mirrors Regular — the Early Bird bracket already lapsed 2026-06-30, so the value is inert, only present for schema/admin-editor consistency.) Applied via direct SQL `UPDATE` on live data through the GANSID CLI (`db query --linked`), same precedent as the 2026-05-29 Speaker-category patch — not a schema migration.
- Insert a matching row into the Tier 1 and Tier 2 `fees.tiers[].rows` arrays, right after "Medical Trainees (Residents, Fellows)", in **both**:
  - the live `site_content` row (`UPDATE ... jsonb` on GANSID), and
  - `components/Portal/content/landingDefaults.ts` (`LANDING_DEFAULTS.fees`) so the code fallback stays in sync.
  - Tier 1 row: `{ category: 'Abstract Presenters', early: '—', regular: 100, onsite: 150 }`
  - Tier 2 row: `{ category: 'Abstract Presenters', early: '—', regular: 150, onsite: 200 }`
- Small isolated rendering change in `FeesSection.tsx`'s `cellPrice()`: if `row[period.id]` is a plain string, render it verbatim (muted) instead of running it through `feesCellPrice`/`formatUsd`. No changes to the shared `feesCells.ts` numeric model — every existing row's cells stay numbers or the strikeout object.
- No registration-form code change needed: `LivePriceCategory.tsx` renders `template.categories` directly in array order, so the new category automatically appears on the live checkout form, right after Medical Trainees, priced at whatever bracket is currently active (Regular, as of today).
- Not touched: `GANSID Docs/Registration page details.md` (a static planning doc, not live content).

## 4. BOGO free-guest country (documentation only)

**Problem.** The at-checkout "Bring a guest free" inline slot (PublicRegistration.tsx) collects name/email/category only. The user wants a country question added, purely for record-keeping — it must never affect BOGO eligibility, price ceiling, or any other computation.

**Design.**
- `BogoSlot` (local type in PublicRegistration.tsx) and `BogoCheckoutSlot` ([utils/bogoCheckout.ts](../../../utils/bogoCheckout.ts)) gain `guestCountry: string`. **Optional** — `isCompleteInlineBogoSlot` is unchanged (does not require it), so an empty country never blocks a slot from submitting.
- `BogoClaim` ([types.ts](../../../types.ts)) gains `guestCountry?: string | null`. `buildBogoClaimsForCheckout` includes `guestCountry: s.guestCountry?.trim() || null` on inline claims.
- UI: in the inline slot card, add the existing `CountryField` component (searchable dropdown, same one used on the main form) below the category `<select>`.
- Server (`supabase/functions/verify-payment/index.ts`):
  - `sanitizeBogoClaimsForCapture`: passes through `guestCountry` (trimmed string or null) — no validation beyond type/trim, since it's non-critical metadata and must never cause a claim to be dropped.
  - `processBogoClaims`: passes `guestCountry: claim.guestCountry` into `buildBogoRow(...)`.
- `supabase/functions/_shared/bogoRowBuilder.ts`: `BuildBogoRowArgs` gains `guestCountry?: string | null`. The built row gains `answers: isInline && guestCountry ? { _guest_country: guestCountry } : null` (synthetic key, same convention as existing `_guest_name`/`_purchaser_filled` internal answer keys).
- **Out of scope**: the portal's post-purchase "send a free guest" form (My Tickets, via `bogo-send`) is not getting this question — those rows simply won't have a country on file. `bogo-send`'s call into `buildBogoRow` is unaffected (no `guestCountry` passed → `answers: null`, same as today).
- **AttendeeModal**: the existing "🎁 BOGO Free Ticket" panel (shown when viewing the free guest's own record) gains a "Guest Country" line resolving `answers._guest_country` through `getCountryName`. `_guest_country` is added to `HIDDEN_ANSWER_KEYS` so it doesn't *also* render as a raw, ugly-labeled card in the generic Responses list — same precedent as `_purchaser_filled`.
- **Dashboard**: covered by §2's `resolveAttendeeCountryCode`, which already checks `_guest_country` first.

**Deploy note:** `verify-payment` changes require a CLI redeploy to GANSID (`--use-api`) after merge, per standing edge-function deploy rules. `bogo-send` is untouched, no redeploy needed for it.

## Out of scope / explicitly deferred

- Portal post-purchase BOGO send form does not get the country question (see §4).
- No CSV export changes (country column is dashboard-table only, per the ask).
- `GANSID Docs/Registration page details.md` not updated (static doc, not live content).
