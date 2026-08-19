// Generic inline (CID) image embedding for outbound email.
//
// WHY THIS EXISTS
// Every remote <img> in an email is optional from the recipient's point of
// view. Gmail, Outlook and virtually every corporate gateway block remote
// images from external senders by default, so a hotlinked image renders as an
// empty bordered box until the reader explicitly allows it.
//
// That is exactly how the 2026-08-18 Novartis report happened: the staff
// confirmation email's only <img> was the branded header logo, hotlinked from
// Supabase storage. Their gateway blocked it, the recipient saw one broken
// image box, and — because the copy claimed a QR was attached — concluded the
// broken box WAS their missing ticket.
//
// `cid:` attachments render with no remote fetch and no permission prompt.
// `data:` URIs are NOT an option — Gmail strips them (the same reason
// `usableImageUrl` rejects data: header logos).
//
// These helpers are the generic primitives; `qrEmbed.ts` builds the QR-specific
// API on top of them. Pure except for `fetchRemoteImage`.

/** An image ready to ride along as a nodemailer attachment. */
export interface InlineAttachment {
  filename: string;
  content: Uint8Array;
  cid: string;
  contentType: string;
}

/** Content-ID for the branded header logo. Referenced as `cid:<HEADER_LOGO_CID>`. */
export const HEADER_LOGO_CID = 'brand-header';

/** Map a URL's file extension to a MIME type, defaulting to PNG. */
export function guessImageContentType(url: string): string {
  const clean = String(url || '').split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

/**
 * Only http(s) URLs can be fetched and inlined.
 *
 * `data:` URIs are already inline but are stripped by Gmail, and relative URLs
 * have no meaning in an inbox. Both must be left for the caller to reject.
 */
export function isFetchableImageUrl(url: string): boolean {
  const u = String(url || '').trim();
  return /^https?:\/\//i.test(u);
}

/**
 * Point every occurrence of `remoteUrl` in `html` at a `cid:` reference.
 *
 * Templates are ADMIN-EDITABLE, so we can't assume the default markup
 * survived. Rewriting the resolved URL wherever it landed keeps custom
 * templates working without asking admins to re-author them.
 */
export function inlineImageSrc(html: string, remoteUrl: string, cid: string): string {
  if (!html || !remoteUrl || !cid) return html;
  // Split/join avoids building a RegExp from a URL full of regex metacharacters.
  return String(html).split(remoteUrl).join(`cid:${cid}`);
}

/**
 * Fetch a remote image so it can be sent as an inline attachment.
 *
 * Returns null on ANY failure (bad URL, network, non-200, empty body, timeout,
 * oversized). The caller then leaves the remote <img> in place, which is
 * exactly today's behaviour — a logo that can't be fetched must never block a
 * ticket from going out.
 */
export async function fetchRemoteImage(
  url: string,
  cid: string,
  filename: string,
  timeoutMs = 8000,
  maxBytes = 2 * 1024 * 1024,
): Promise<InlineAttachment | null> {
  if (!isFetchableImageUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      console.error('[imageEmbed] fetch non-200', cid, resp.status);
      return null;
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength === 0) {
      console.error('[imageEmbed] fetch returned an empty body', cid);
      return null;
    }
    // A multi-megabyte logo would bloat every single email. Better to fall
    // back to the remote <img> than to attach it to every send.
    if (buf.byteLength > maxBytes) {
      console.warn('[imageEmbed] image too large to inline', cid, buf.byteLength);
      return null;
    }
    return { filename, content: buf, cid, contentType: guessImageContentType(url) };
  } catch (e) {
    console.error('[imageEmbed] fetch failed', cid, String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Build the nodemailer entry for an inline image. */
export function inlineAttachmentEntry(img: InlineAttachment): any {
  return {
    filename: img.filename,
    content: img.content,
    cid: img.cid,
    contentType: img.contentType,
    contentDisposition: 'inline',
  };
}
