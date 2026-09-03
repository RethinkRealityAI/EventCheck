// Relative-time formatting for admin lists.
//
// The same ladder was already copy-pasted into three dashboard tabs (and one
// copy had drifted — it was missing the years arm). This is the canonical home;
// new callers should import it rather than adding a fifth copy.

/** '3m ago', '2d ago', 'just now'. Empty string for missing/unparseable input.
 *  House convention is to pair it with the exact timestamp in a `title`. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
