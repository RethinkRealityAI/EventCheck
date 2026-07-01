import { describe, it, expect } from 'vitest';
import { buildIssuedAttendeeRow } from '../supabase/functions/_shared/issuedTicket';

describe('buildIssuedAttendeeRow', () => {
  it('builds a free "Issued (free)" row with payment_method=null and a {id} QR', () => {
    expect(buildIssuedAttendeeRow('abc-123', 'gansid-congress-2026-invite', 'Dapo', 'd@x.co')).toEqual({
      id: 'abc-123',
      form_id: 'gansid-congress-2026-invite',
      name: 'Dapo',
      email: 'd@x.co',
      answers: {},
      ticket_type: 'Issued (free)',
      payment_status: 'free',
      payment_method: null,
      payment_amount: '0.00',
      qr_payload: '{"id":"abc-123"}',
      is_primary: true,
    });
  });

  it('never sets a non-null payment_method (CHECK-constraint safety)', () => {
    const row = buildIssuedAttendeeRow('x', 'f', 'N', 'e@e.co');
    expect(row.payment_method).toBeNull();
    expect(row.payment_status).toBe('free');
  });
});
