// Pure builder for an admin-ISSUED free attendee row (the "send a ticket to a
// contact without them filling the form" flow). Mirrors the invite-claim free
// row but with ticket_type='Issued (free)'. Pure (no Date) so it's unit-testable;
// the caller stamps registered_at. Importable by both Deno (edge fn) and vitest.
//
// CRITICAL: payment_method MUST be null — the attendees_payment_method_check
// CHECK constraint allows {card,paypal,flutterwave,cheque,external,promo,bogo}
// or NULL only. A label like 'issued' would 500 the insert.

export function buildIssuedAttendeeRow(id: string, formId: string, name: string, email: string) {
  return {
    id,
    form_id: formId,
    name,
    email,
    answers: {},
    ticket_type: 'Issued (free)',
    payment_status: 'free',
    payment_method: null,
    payment_amount: '0.00',
    qr_payload: JSON.stringify({ id }),
    is_primary: true,
  };
}
