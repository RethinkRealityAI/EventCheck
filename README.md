<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1GjeDkdH4WM9CdCnL_gusGNw5wbtCAfC3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Payment providers

Online payments support **PayPal** and **Flutterwave** (the latter for African
cards/mobile money — e.g. Nigeria & Uganda — where PayPal is unreliable). Both
are optional; if neither is configured, checkout shows a configuration notice.

Client env vars (`.env.local` for dev, Netlify for prod):

```
# PayPal
VITE_PAYPAL_CLIENT_ID=...
VITE_PAYPAL_SANDBOX_CLIENT_ID=...   # optional
VITE_PAYPAL_ENV=live                # or "sandbox"

# Flutterwave (public key only — the SECRET key is a server-side Supabase secret)
VITE_FLW_PUBLIC_KEY=FLWPUBK-...
VITE_FLW_TEST_PUBLIC_KEY=FLWPUBK_TEST-...   # optional
VITE_FLW_ENV=live                  # or "test"
```

Server-side secrets (PayPal `PAYPAL_*`, Flutterwave `FLW_SECRET_KEY` / `FLW_MODE`)
are set as Supabase edge-function secrets. See **[DEPLOY.md](DEPLOY.md) § 4** for
the full Flutterwave setup runbook.
