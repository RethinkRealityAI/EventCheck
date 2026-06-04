import { Attendee, Form } from '../types';

/** Sum purchased seats from a primary's ticketType summary + form ticket config. */
export function computePurchasedSeatTotal(primary: Attendee, form?: Form): number {
  const ticketField = form?.fields.find(f => f.type === 'ticket');
  if (!ticketField?.ticketConfig?.items?.length) return 1;

  const parts = (primary.ticketType || '').split(', ');
  let total = 0;
  for (const part of parts) {
    const match = part.match(/^(.+?)\s*x(\d+)$/);
    if (!match) continue;
    const itemName = match[1].trim();
    const qty = parseInt(match[2], 10);
    const item = ticketField.ticketConfig.items.find(i => i.name === itemName);
    total += qty * (item?.seats || 1);
  }

  if (total === 0) total = 1;
  total -= primary.donatedSeats || 0;
  return Math.max(1, total);
}

export function isTableGuestRow(a: Attendee): boolean {
  const t = a.guestType;
  if (!t) return true;
  return t !== 'staff-pending'
    && t !== 'staff-claimed'
    && t !== 'exhibitor-staff-pending'
    && t !== 'exhibitor-staff-claimed';
}

export interface TableCapacityCheck {
  allowed: boolean;
  maxSeats: number;
  currentSeats: number;
  message?: string;
}

/** Whether another guest row can be linked to this primary (includes placeholders). */
export function checkTableGuestCapacity(
  primary: Attendee,
  linkedGuests: Attendee[],
  form?: Form,
): TableCapacityCheck {
  const maxSeats = computePurchasedSeatTotal(primary, form);
  const tableGuests = linkedGuests.filter(isTableGuestRow);
  const currentSeats = 1 + tableGuests.length;

  if (currentSeats >= maxSeats) {
    return {
      allowed: false,
      maxSeats,
      currentSeats,
      message: `This purchase includes ${maxSeats} seat${maxSeats !== 1 ? 's' : ''} (${currentSeats} already assigned). Remove a guest or upgrade the purchase before adding another.`,
    };
  }

  return { allowed: true, maxSeats, currentSeats };
}
