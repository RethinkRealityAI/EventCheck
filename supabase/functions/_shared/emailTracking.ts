// Server-side twins of utils/emailTracking.ts.
//
// Open pixels and click redirects both point at the `track-email` edge
// function. The CLIENT builds these for campaign sends because it renders that
// HTML itself; sends that are rendered or finalised on the SERVER (free-
// registration invites, issued tickets) need the same URLs built there, or the
// send is logged but never records an open or a click.
//
// Pure — unit-tested alongside the client helpers (CLAUDE.md §16 rule #14).

/** Build the track-email endpoint from the project URL. */
export function trackingEndpoint(supabaseUrl: string): string {
  const url = (supabaseUrl || '').replace(/\/$/, '');
  if (!url) return '';
  return `${url}/functions/v1/track-email`;
}

export function buildOpenPixelUrl(supabaseUrl: string, trackingId: string): string {
  const endpoint = trackingEndpoint(supabaseUrl);
  if (!endpoint || !trackingId) return '';
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=open`;
}

export function wrapClickUrl(supabaseUrl: string, trackingId: string, destination: string): string {
  const endpoint = trackingEndpoint(supabaseUrl);
  if (!endpoint || !trackingId || !destination) return destination;
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=click&to=${encodeURIComponent(destination)}`;
}

/**
 * Append the 1×1 open pixel to an already-rendered HTML body.
 *
 * Used for pre-rendered sends (`raw-html` / `contact-register-invite`) where
 * the shell was built by the caller, so `renderEmailShell({ trackingPixelUrl })`
 * is no longer reachable. Inserted before `</body>` when present so it stays
 * inside the document; appended otherwise.
 */
export function appendTrackingPixel(html: string, pixelUrl: string): string {
  if (!pixelUrl) return html;
  const img = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden;" />`;
  const body = String(html ?? '');
  const idx = body.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return body + img;
  return body.slice(0, idx) + img + body.slice(idx);
}
