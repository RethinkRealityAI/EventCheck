// Which paid add-ons belong to which attendee, read back from the line items
// of a PayPal order.
//
// Checkout used to add an add-on's price to the total and then forget which
// add-on it was: nothing on the attendee row recorded that someone bought a
// Networking Reception ticket. PayPal kept it, though — utils/paypalOrderMeta
// itemises every order, one line per add-on:
//
//   solo:  "<event> — <add-on name>"
//   group: "<event> — <add-on name> — <member display name>"
//
// (" — " is an em dash with spaces.) This module turns those lines back into
// per-attendee add-on ids so the addon-sync function can backfill
// answers._addons. Kept pure and dependency-free so both the edge runtime and
// vitest can load it.

export interface AddonDef {
  id: string;
  name: string;
}

export interface OrderRow {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface AddonMatch {
  /** attendee id → add-on ids found for them */
  byAttendee: Record<string, string[]>;
  /** add-on lines whose person could not be matched to a row */
  unmatched: string[];
}

const SEP = ' — ';

function norm(s: string): string {
  return s.toLowerCase().replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, '').replace(/[^a-z0-9]/g, '');
}

/** PayPal truncates names to 127 chars with a trailing ellipsis. */
function sameName(a: string, b: string): boolean {
  const x = a.replace(/…$/, '').trim();
  const y = b.trim();
  return x === y || (a.endsWith('…') && y.startsWith(x));
}

export function matchAddonLineItems(
  itemNames: readonly string[],
  addons: readonly AddonDef[],
  rows: readonly OrderRow[],
): AddonMatch {
  const byAttendee: Record<string, string[]> = {};
  const unmatched: string[] = [];
  const primary = rows.find(r => r.isPrimary) ?? rows[0];
  const add = (id: string, addonId: string) => {
    const list = (byAttendee[id] ??= []);
    if (!list.includes(addonId)) list.push(addonId);
  };

  for (const raw of itemNames) {
    const parts = raw.split(SEP);
    // [event, add-on] or [event, add-on, who]. Category lines carry
    // "(tier, bracket)" in the second part and never equal an add-on name.
    if (parts.length < 2) continue;
    const addon = addons.find(a => sameName(parts[1], a.name));
    if (!addon) continue;
    const who = parts.slice(2).join(SEP).trim();
    if (!who) {
      if (primary) add(primary.id, addon.id);
      else unmatched.push(raw);
      continue;
    }
    const target = rows.find(r => norm(r.name) === norm(who))
      ?? (/^Registrant 1$/i.test(who) ? primary : undefined);
    if (target) add(target.id, addon.id);
    else unmatched.push(raw);
  }
  return { byAttendee, unmatched };
}
