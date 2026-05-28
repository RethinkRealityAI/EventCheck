import type { BogoClaim } from '../types';

/** One BOGO slot on the checkout form (mirrors PublicRegistration local state). */
export type BogoCheckoutSlot = {
  mode: 'inline' | 'claim_link' | 'skip';
  guestName: string;
  guestEmail: string;
  categoryId: string;
};

export function isCompleteInlineBogoSlot(slot: BogoCheckoutSlot): boolean {
  if (slot.mode !== 'inline') return false;
  if (!slot.guestName.trim()) return false;
  if (!/^.+@.+\..+$/.test(slot.guestEmail.trim())) return false;
  if (!slot.categoryId) return false;
  return true;
}

/** Slots where the user chose "Add guest now" but left required fields empty. */
export function countIncompleteInlineBogoSlots(slots: BogoCheckoutSlot[]): number {
  return slots.filter((s) => s.mode === 'inline' && !isCompleteInlineBogoSlot(s)).length;
}

/**
 * Build claims sent to verify-payment. Incomplete inline slots are omitted —
 * payment must never fail for BOGO; guests can be sent later from My Tickets.
 */
export function buildBogoClaimsForCheckout(slots: BogoCheckoutSlot[]): {
  claims: BogoClaim[];
  omittedIncomplete: number;
} {
  const claims: BogoClaim[] = [];
  let omittedIncomplete = 0;

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.mode === 'skip') continue;
    if (s.mode === 'claim_link') {
      claims.push({ paidIndex: i, mode: 'claim_link', categoryId: null });
      continue;
    }
    if (!isCompleteInlineBogoSlot(s)) {
      omittedIncomplete += 1;
      continue;
    }
    claims.push({
      paidIndex: i,
      mode: 'inline',
      guestName: s.guestName.trim(),
      guestEmail: s.guestEmail.trim(),
      categoryId: s.categoryId,
    });
  }

  return { claims, omittedIncomplete };
}

export const BOGO_CHECKOUT_INCOMPLETE_HINT =
  'Incomplete complimentary-guest details will not be submitted with this payment. '
  + 'You can send free guests anytime from My Tickets in your portal.';

export const BOGO_POST_CHECKOUT_PORTAL_HINT =
  'Open My Tickets in your portal to send or finish complimentary guests.';
