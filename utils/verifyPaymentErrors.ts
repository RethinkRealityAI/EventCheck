/** Non-blocking notices after a successful paid registration (BOGO). */
export function buildBogoPostCheckoutNotice(args: {
  omittedIncompleteAtCheckout?: number;
  serverSkipped?: number;
  partialBogoFailure?: boolean;
}): string | null {
  const parts: string[] = [];
  const omitted = (args.omittedIncompleteAtCheckout ?? 0) + (args.serverSkipped ?? 0);
  if (omitted > 0) {
    parts.push(
      omitted === 1
        ? 'One complimentary guest was not submitted because details were incomplete.'
        : `${omitted} complimentary guests were not submitted because details were incomplete.`,
    );
  }
  if (args.partialBogoFailure) {
    parts.push('We could not finish saving one or more complimentary guests.');
  }
  if (parts.length === 0) return null;
  return `${parts.join(' ')} Payment is confirmed. Open My Tickets in your portal to send or complete free guests.`;
}

/** User-facing copy for verify-payment error codes. */
export function formatVerifyPaymentError(raw: string, errorCode?: string): string {
  const code = errorCode ?? raw;
  switch (code) {
    case 'BOGO_MISSING_FIELDS':
      return 'Your complimentary guest is incomplete. Enter guest name, email, and category, switch to "Send claim link later", or contact support.';
    case 'BOGO_NOT_ALLOWED_FOR_FREE_OR_SPEAKER':
      return 'Your promo code cannot be combined with a complimentary guest ticket. Remove free-guest details or use a different registration path.';
    case 'BOGO_NOT_ALLOWED_FOR_FREE_REGISTRATION':
      return 'Complimentary guest tickets are not available on free registrations.';
    case 'BOGO_PRICE_EXCEEDED':
      return 'The free guest category must be equal to or less than the paid ticket category.';
    case 'BOGO_BAD_INDEX':
    case 'BOGO_DUPLICATE_SOURCE':
    case 'BOGO_BAD_MODE':
      return 'There was a problem with the complimentary guest setup. Please refresh and try again.';
    default:
      if (raw.includes('payment was processed but we encountered a database error')) {
        return raw;
      }
      return raw;
  }
}
