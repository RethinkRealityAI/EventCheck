# GANSID branding assets

Served from `/branding/gansid/` by Vite at runtime. Loaded as the admin shell
logo when `VITE_SITE=gansid`.

## Required files

- **`mark.png`** — year-agnostic GANSID mark (512×512, transparent). The
  blood-drops icon next to the "GANSID CONGRESS" wordmark, cut from
  `congress-logo-white.png`. Used as the admin shell / login logo
  (`config/sites.ts` `logoImage`).

- **`favicon.ico`**, **`favicon-192.png`**, **`apple-touch-icon.png`** — the
  mark on a white rounded tile, so it reads on light and dark browser tabs.
  Written into `index.html` at build time from `config/favicons.ts`.

- **`wordmark-2026.png`** — year-specific "GANSID CONGRESS 2026 / HYDERABAD"
  wordmark. Uploaded by the GANSID admin into
  `app_settings.email_header_logo` and `app_settings.pdf_settings.logo` via
  the Settings UI. Not referenced by code directly.

- **`hero-2026.png`** — optional full banner ("Registration Now Open" hero)
  for use in email headers or landing-page content. Not referenced by code.

## Annual refresh

When a new year's Congress starts, replace the `-2026` suffixed assets with
the new year's artwork and update `app_settings` via the Settings UI.
`mark.png` and the favicons stay unchanged year-over-year.
