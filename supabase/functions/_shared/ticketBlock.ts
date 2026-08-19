// Guarantees a ticket email actually contains a ticket.
//
// THE BUG THIS FIXES (2026-08-18, Novartis exhibitor staff)
// Email templates are admin-editable via Settings → Email Templates. The live
// GANSID `email_staff_confirmed_body` read "Your ticket QR is attached and also
// appears in your portal dashboard" — but contained no {{qr_image_url}}, the
// caller passed `attachments: []`, and the staff had no portal accounts. Every
// claim of a ticket in that email was false, and the recipient's only <img> was
// the (blocked) header logo.
//
// Fixing the copy alone is not enough: the next admin who edits the template
// can silently delete the ticket again, and nothing would surface it. So the
// server APPENDS the QR and download blocks whenever the resolved template does
// not already reference them. An admin can freely reposition the ticket by
// including the token themselves; they cannot accidentally remove it.
//
// This mirrors the "three independent routes to a ticket" principle already
// used by the BOGO path: inline cid: QR, attached PNG, tokenised download link.
//
// Pure and unit-tested — no I/O.

/** Placeholder token for the check-in QR image. */
export const QR_TOKEN = 'qr_image_url';
/** Placeholder token for the tokenised /#/tickets download link. */
export const DOWNLOAD_TOKEN = 'ticket_download_url';

/**
 * Does the template already reference this placeholder?
 *
 * Tolerates surrounding whitespace (`{{ qr_image_url }}`) because
 * `mergePlaceholders` does, so detection must not be stricter than
 * substitution — otherwise we would append a second, duplicate QR.
 */
export function templateReferencesToken(template: string, token: string): boolean {
  if (!template || !token) return false;
  // Normalise `{{ token }}` to `{{token}}` using the SAME character class
  // applyPlaceholders uses, then do a literal match. Avoids building a RegExp
  // out of the token and keeps detection exactly as permissive as substitution.
  const normalized = String(template).replace(
    /\{\{\s*([\w.-]+)\s*\}\}/g,
    (_m: string, t: string) => `{{${t}}}`,
  );
  return normalized.includes(`{{${token}}}`);
}

/** Standard QR markup. Uses the token so `applyPlaceholders` resolves it. */
export function buildQrBlockHtml(): string {
  return `<p style="margin:24px 0 8px;font-weight:600;">Your check-in QR code</p>`
    + `<div style="text-align:center;margin:8px 0 24px;">`
    + `<img src="{{${QR_TOKEN}}}" alt="Check-in QR code" width="240" height="240" `
    + `style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" />`
    + `</div>`
    + `<p style="color:#666;font-size:13px;margin:0 0 16px;">`
    + `A copy is also attached to this email as <strong>GANSID-Congress-check-in-QR.png</strong> `
    + `in case your email client blocks images.</p>`;
}

/** Standard download CTA. Survives full image stripping and plain-text forwarding. */
export function buildDownloadBlockHtml(): string {
  return `<p style="text-align:center;margin:24px 0;">`
    + `<a href="{{${DOWNLOAD_TOKEN}}}" `
    + `style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;`
    + `text-decoration:none;border-radius:6px;font-weight:600;">Download my ticket</a></p>`;
}

export interface EnsureTicketBlocksOptions {
  /** Append the QR block when the template doesn't reference {{qr_image_url}}. */
  includeQr?: boolean;
  /** Append the download block when the template doesn't reference {{ticket_download_url}}. */
  includeDownload?: boolean;
}

/**
 * Append whichever ticket blocks the template is missing.
 *
 * Returns the template UNCHANGED when it already carries both — an admin who
 * has deliberately placed the QR mid-body keeps their layout.
 */
export function ensureTicketBlocks(template: string, opts: EnsureTicketBlocksOptions = {}): string {
  let out = String(template ?? '');
  if (opts.includeQr && !templateReferencesToken(out, QR_TOKEN)) {
    out += buildQrBlockHtml();
  }
  if (opts.includeDownload && !templateReferencesToken(out, DOWNLOAD_TOKEN)) {
    out += buildDownloadBlockHtml();
  }
  return out;
}

/**
 * Amber "we're resending your ticket" notice.
 *
 * Extracted from the bogo-ticket mode (2026-08-10) so every ticket mode can
 * re-issue with the same wording. Opt-in via `reissue: true` on the request so
 * ordinary sends are untouched.
 *
 * The copy deliberately reassures that the REGISTRATION was never at risk —
 * the failure was only in how the email rendered, and a recipient who was told
 * "your ticket QR is attached" and saw an empty box has every reason to worry
 * that their booking is gone.
 */
export function buildReissueNoticeHtml(): string {
  return `<div style="margin:0 0 20px;padding:12px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;font-size:14px;">
<strong>We're resending your ticket.</strong> Some earlier emails showed a blank space where the check-in QR code should be. That's fixed — your QR code is below, attached as an image, and downloadable from the link further down. Your registration was never affected.
</div>`;
}

/** Prepend the re-issue notice when `reissue` is true; otherwise pass through. */
export function prependReissueNotice(bodyHtml: string, reissue: boolean | undefined): string {
  if (!reissue) return String(bodyHtml ?? '');
  return buildReissueNoticeHtml() + String(bodyHtml ?? '');
}
