// Inline (CID) QR embedding for ticket emails.
//
// THE BUG THIS FIXES
// Ticket emails rendered the check-in QR as a hotlinked remote image:
//   <img src="https://api.qrserver.com/v1/create-qr-code/?...&data=...">
// Gmail, Outlook and most mobile clients block remote images until the reader
// taps "show images" — so the recipient saw an empty bordered box exactly where
// their QR should be (reported 2026-07-30, BOGO free-ticket email). The BOGO
// email carries NO PDF attachment, so a blocked image means they have no
// ticket at all.
//
// Remote images are the wrong mechanism here for three reasons:
//   1. blocked by default in most clients (the reported symptom),
//   2. it leaks the QR payload to a third party on every open,
//   3. it makes door check-in depend on api.qrserver.com being reachable from
//      the attendee's phone, at the venue, on conference wifi.
//
// A `cid:` attachment renders inline with no remote fetch and no permission
// prompt. `data:` URIs are NOT an option — Gmail strips them (the same reason
// `usableImageUrl` rejects data: header logos).
//
// Pure except for the fetch; the URL builder and the HTML rewrite are unit-tested.

/** Content-ID used for the embedded QR. Referenced as `cid:<QR_CID>` in HTML. */
export const QR_CID = 'checkin-qr';

/** Remote generator, still used as the fallback and as the fetch source. */
export function buildQrImageUrl(qrData: string, size = 240): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrData)}`;
}

export interface QrAttachment {
  filename: string;
  content: Uint8Array;
  cid: string;
  contentType: string;
}

/**
 * Fetch the QR PNG so it can ride along as an inline attachment.
 *
 * Returns null on any failure (network, non-200, empty body, timeout) — the
 * caller then falls back to the remote <img>, which is exactly today's
 * behaviour. A QR that can't be fetched must never block the ticket email.
 */
export async function fetchQrPng(qrData: string, size = 240, timeoutMs = 8000): Promise<QrAttachment | null> {
  if (!qrData) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(buildQrImageUrl(qrData, size), { signal: controller.signal });
    if (!resp.ok) {
      console.error('[qrEmbed] QR fetch non-200', resp.status);
      return null;
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength === 0) {
      console.error('[qrEmbed] QR fetch returned an empty body');
      return null;
    }
    return { filename: 'checkin-qr.png', content: buf, cid: QR_CID, contentType: 'image/png' };
  } catch (e) {
    console.error('[qrEmbed] QR fetch failed', String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Point every QR <img> at the inline attachment.
 *
 * Templates are ADMIN-EDITABLE (app_settings.email_bogo_ticket_body and
 * friends), so we can't assume the default markup survived. Rewriting the
 * resolved `{{qr_image_url}}` value wherever it landed keeps custom templates
 * working without asking admins to re-author them.
 */
export function inlineQrSrc(html: string, remoteUrl: string): string {
  if (!html || !remoteUrl) return html;
  // Split/join avoids building a RegExp from a URL full of regex metacharacters.
  return String(html).split(remoteUrl).join(`cid:${QR_CID}`);
}

/**
 * Build BOTH attachment entries for a QR: the inline copy the HTML references,
 * and a second, plainly-named downloadable copy.
 *
 * Why both — a guest must be able to get through the door even if their client
 * refuses to render anything. Inline alone still fails on clients that strip
 * ALL images including cid:, and on plain-text views. The duplicate is ~500
 * bytes, so redundancy is essentially free.
 */
export function qrAttachments(qr: QrAttachment, downloadName = 'GANSID-Congress-check-in-QR.png'): any[] {
  return [
    { filename: qr.filename, content: qr.content, cid: qr.cid, contentType: qr.contentType, contentDisposition: 'inline' },
    { filename: downloadName, content: qr.content, contentType: qr.contentType, contentDisposition: 'attachment' },
  ];
}
