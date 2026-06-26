// Email open/click tracking URL helpers, shared by the admin email tools.
//
// These build URLs pointing at the `track-email` edge function:
//   - an invisible 1×1 open pixel  (?type=open)
//   - a click-through redirect that records the click then 302s to the target
//
// Mirrors the inline helpers in Signups/SendUserEmailModal.tsx so the bulk
// campaign sender produces identical tracking semantics. Some corporate
// inboxes strip pixels / rewrite links, so counts are lower bounds.

function trackingEndpoint(): string {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  if (!url) return '';
  return `${url.replace(/\/$/, '')}/functions/v1/track-email`;
}

export function buildOpenPixelUrl(trackingId: string): string {
  const endpoint = trackingEndpoint();
  if (!endpoint || !trackingId) return '';
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=open`;
}

export function wrapClickUrl(trackingId: string, destination: string): string {
  const endpoint = trackingEndpoint();
  if (!endpoint || !trackingId || !destination) return destination;
  return `${endpoint}?id=${encodeURIComponent(trackingId)}&type=click&to=${encodeURIComponent(destination)}`;
}
