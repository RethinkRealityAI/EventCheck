# SMTP Email Service — Implementation Guide

## Architecture Overview

The SMTP email system uses a **two-tier architecture**:

1. **Frontend** (`services/smtpService.ts`) — Browser-safe client that calls the Edge Function
2. **Backend** (`supabase/functions/send-ticket-email/index.ts`) — Supabase Edge Function that handles actual SMTP delivery

> **Why this design?** `nodemailer` is a Node.js-only library that cannot run in the browser. The frontend converts PDF attachments to base64 and sends them to the Edge Function, which reconstructs the binary data and delivers via SMTP.

---

## File Structure

```
services/
  smtpService.ts          ← Frontend client (calls Edge Function)
  emailService.ts         ← Existing general email service (Supabase 'send-email' function)

supabase/functions/
  send-ticket-email/
    index.ts              ← Edge Function for SMTP delivery (uses denomailer for Deno)
```

---

## Configuration

SMTP credentials are stored in the admin **Settings** panel under "SMTP Configuration":

| Setting      | Field in AppSettings | Default             |
|--------------|---------------------|---------------------|
| SMTP Host    | `smtpHost`          | `smtp.ionos.com`    |
| SMTP Port    | `smtpPort`          | `587`               |
| SMTP User    | `smtpUser`          | *(required)*        |
| SMTP Password| `smtpPass`          | *(required)*        |

These are passed from the frontend to the Edge Function at runtime — no environment variables needed on Supabase for SMTP.

---

## How It Works

### 1. Table Purchaser Flow
1. Purchaser completes registration and payment
2. Primary attendee record saved to database
3. If ticket has `seats > 1` (table ticket), guest placeholder records are created
4. PDFs generated for all tickets (primary + guests)
5. PDFs converted to base64 via `arrayBufferToBase64()`
6. All PDFs sent to purchaser via `sendTicketEmail()` → Edge Function
7. Named guests also receive their individual tickets via separate emails

### 2. Guest Registration Flow (via QR code or shared link)
1. Guest opens link with `?ref=<primaryAttendeeId>`
2. System resolves `ref` to the primary attendee (handles both primary and placeholder IDs)
3. Guest fills in name, email, dietary preferences
4. If `ref` pointed to a placeholder, updates it in-place (preserving original QR payload)
5. If `ref` pointed to the primary, creates a new guest record

### 3. Registration QR Code on Placeholder Tickets
- Always points to the **primary attendee ID** (not the guest's own ID)
- This ensures the guest mode flow can calculate remaining seats correctly
- Format: `https://your-domain.com/register/<formId>?ref=<primaryAttendeeId>`

---

## Deployment

Deploy the Edge Function to Supabase:

```bash
supabase functions deploy send-ticket-email
```

No additional environment variables are needed — SMTP credentials are passed from the frontend at runtime.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Edge Function (not direct nodemailer) | nodemailer is Node.js-only, can't run in browser |
| `denomailer` in Edge Function | Deno-compatible SMTP client for Supabase Functions |
| Base64 encoding for PDFs | Safe transport over HTTP JSON payloads |
| SMTP credentials from Settings (not env vars) | Admin can configure via UI without deploying |
| Registration URL uses primary ID | Avoids double-nesting and enables proper seat counting |
| QR payload preserved on placeholder update | Ensures printed check-in QR codes remain valid |
| Guest placeholders only for table tickets | Individual ticket purchases don't create phantom guests |
| `pdfConfig.primaryColor` respected | Admin Settings color picker works; red accent only on guest left bar |