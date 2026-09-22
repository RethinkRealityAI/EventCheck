// Did this purchase buy seats for more than one person?
//
// `registration-confirmed` chooses between two templates: the standard ticket
// email, and the table-purchaser one ("Thank you for purchasing a table! Your
// table comes with seats for you and your guests…"). It used to decide by
// asking whether ANY other row pointed at the purchaser — and plenty of rows do
// that without a table having been bought:
//
//   - every TSCS India booking with a complimentary companion (all nineteen
//     such GANSID registrants were told they had bought a table — GANSID sells
//     no tables at all);
//   - an invited speaker given a guest place;
//   - a single SCAGO "Individual" ticket carrying a free BOGO guest.
//
// The honest signal is the purchase itself: the ticket summary ("Table of 8
// x1", "Individual x3") read against the form's ticket config, or a group-mode
// registration. Linked rows describe who is attending, not what was bought.

export interface SeatItem {
  name: string;
  /** Seats one unit of this item provides. Absent = 1; 0 = none (an advert, a booth). */
  seats?: number | null;
}

/**
 * Seats bought, from a ticket summary like "Table of 8 x1, Individual x2".
 *
 * Item names are compared trimmed and case-insensitively: SCAGO's live config
 * names an item "Individual " with a trailing space, which an exact comparison
 * never matches — silently counting every lookup as one seat.
 */
export function purchasedSeatCount(ticketType: string | null | undefined, items: readonly SeatItem[] | undefined): number {
  const summary = (ticketType ?? '').trim();
  if (!summary) return 1;
  const norm = (s: string) => s.trim().toLowerCase();
  const byName = new Map((items ?? []).map(i => [norm(i.name), i] as const));

  let total = 0;
  let recognised = false;
  for (const part of summary.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(.+?)\s*x(\d+)$/i);
    const name = m ? m[1] : trimmed;
    const qty = m ? parseInt(m[2], 10) : 1;
    const item = byName.get(norm(name));
    if (!item) continue;
    recognised = true;
    const perUnit = item.seats === undefined || item.seats === null ? 1 : Number(item.seats);
    total += qty * (Number.isFinite(perUnit) ? Math.max(0, perUnit) : 1);
  }
  // A summary that names nothing in the config (a dynamic-pricing category,
  // "Speakers", "Manual Entry") is one person's registration.
  return recognised ? total : 1;
}

export interface PurchaseShapeInput {
  ticket_type?: string | null;
  answers?: Record<string, unknown> | null;
}

export interface PurchaseShapeField {
  id: string;
  type: string;
  ticketConfig?: { items?: SeatItem[] } | null;
}

/** True only when the purchase itself covered more than one seat. */
export function isMultiSeatPurchase(primary: PurchaseShapeInput, fields: readonly PurchaseShapeField[] | undefined): boolean {
  const list = fields ?? [];
  // Group-mode registration: one purchaser buying for several named people.
  const rms = list.find(f => f.type === 'registration-mode-selector');
  if (rms && primary.answers?.[rms.id] === 'group') return true;
  const items = list.find(f => f.type === 'ticket')?.ticketConfig?.items;
  return purchasedSeatCount(primary.ticket_type, items) > 1;
}
