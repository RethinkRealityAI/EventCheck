// Who is coming to the GANSID Networking Reception — the paid evening add-on
// (pricing template add-on id `networking`, USD 50) sold alongside a congress
// registration. Catering and the door list both need the headcount.
//
// Where the fact lives on an attendee row:
//   * `answers._addons` — the add-on ids verify-payment confirmed were paid
//     for (written at checkout since 2026-10-14, and backfilled for earlier
//     PayPal orders by the addon-sync edge function, which reads the order's
//     line items from PayPal);
//   * `answers._guest_addons` — what a group purchaser picked for a guest who
//     has not filled in their own details yet.
//
// Pure + data-only so it is unit-tested.

export const RECEPTION_ADDON_ID = 'networking';

/** Filter values for the dashboard's Reception filter. */
export type ReceptionFilter = 'all' | 'yes' | 'no';

export const RECEPTION_FILTER_LABELS: Record<Exclude<ReceptionFilter, 'all'>, string> = {
  yes: 'Reception ticket',
  no: 'No reception ticket',
};

export interface ReceptionSource {
  answers?: Record<string, unknown> | null;
}

function idsAt(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export function hasReceptionTicket(a: ReceptionSource): boolean {
  const answers = a.answers ?? {};
  return idsAt(answers._addons).includes(RECEPTION_ADDON_ID)
    || idsAt(answers._guest_addons).includes(RECEPTION_ADDON_ID);
}

export function matchesReceptionFilter(a: ReceptionSource, filter: ReceptionFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'yes' ? hasReceptionTicket(a) : !hasReceptionTicket(a);
}
