# GANSID branding assets

Served from `/branding/gansid/` by Vite at runtime. Loaded as the admin shell
logo when `VITE_SITE=gansid`.

## Required files

- **`mark.svg`** (or `mark.png`) — year-agnostic GANSID mark. The small
  blood-drops icon next to the "GANSID CONGRESS" wordmark. Used as the admin
  shell logo. Referenced by `config/sites.ts` `logoImage`. If you save a
  `.png` instead of `.svg`, update `logoImage` in `config/sites.ts` to
  `/branding/gansid/mark.png`.

- **`wordmark-2026.png`** — year-specific "GANSID CONGRESS 2026 / HYDERABAD"
  wordmark. Uploaded by the GANSID admin into
  `app_settings.email_header_logo` and `app_settings.pdf_settings.logo` via
  the Settings UI. Not referenced by code directly.

- **`hero-2026.png`** — optional full banner ("Registration Now Open" hero)
  for use in email headers or landing-page content. Not referenced by code.

## Annual refresh

When a new year's Congress starts, replace the `-2026` suffixed assets with
the new year's artwork and update `app_settings` via the Settings UI.
`mark.svg` stays unchanged year-over-year.
