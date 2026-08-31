import { describe, it, expect } from 'vitest';
import { buildTscsAttendeeRows } from '../supabase/functions/_shared/tscsIngestRows';
import type { TscsRegistration } from '../supabase/functions/_shared/tscsEmailParse';

const baseOpts = {
  source: 'test',
  formId: 'gansid-congress-2026',
  pricingTemplateId: 'tpl-1',
  uuid: (() => { let i = 0; return () => `uuid-${++i}`; })(),
  now: () => '2026-09-01T00:00:00.000Z',
};

const solo: TscsRegistration = {
  name: 'Sathwika Maheswarapu',
  first_name: 'Sathwika',
  last_name: 'Maheswarapu',
  email: 'sathwika@example.com',
  category: 'Undergraduate, Medical, Graduate Students',
  total_inr: 2400,
  payment_id: 'pay_ABC123',
  attending_days: 'October 23, 2026, October 24, 2026',
};

describe('buildTscsAttendeeRows — solo', () => {
  it('builds one paid razorpay row keyed on the payment id', () => {
    const r = buildTscsAttendeeRows(solo, { ...baseOpts, uuid: () => 'p1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    const row: any = r.rows[0];
    expect(row.payment_status).toBe('paid');
    expect(row.payment_method).toBe('razorpay');
    expect(row.payment_amount).toBe('2400.00 INR');
    expect(row.transaction_id).toBe('pay_ABC123');
    expect(row.ticket_type).toBe('Undergraduate, Medical, Graduate Students');
    expect(row.pricing_category_id).toBe('student');
    expect(row.is_test).toBe(false);
    expect(JSON.parse(row.qr_payload as string)).toEqual({ id: 'p1' });
    expect((row.answers as any).f_country).toBe('IN');
    expect((row.answers as any).f_days).toEqual(['October 23, 2026', 'October 24, 2026']);
  });

  it('falls back to the message id for dedupe when no payment id', () => {
    const r = buildTscsAttendeeRows({ ...solo, payment_id: undefined }, { ...baseOpts, messageId: 'msg-1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.txnBase).toBe('tscs-msg-1');
  });

  it('refuses when there is nothing to dedupe on', () => {
    const r = buildTscsAttendeeRows({ ...solo, payment_id: undefined }, baseOpts);
    expect(r.ok).toBe(false);
  });

  it('refuses unknown categories', () => {
    const r = buildTscsAttendeeRows({ ...solo, category: 'Astronaut' }, { ...baseOpts, messageId: 'm' });
    expect(r.ok).toBe(false);
  });

  it('propagates is_test to every row', () => {
    const r = buildTscsAttendeeRows(
      { ...solo, group: [{ name: 'P Two' }], addon: { name: 'Companion' } },
      { ...baseOpts, isTest: true },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows.every((row: any) => row.is_test === true)).toBe(true);
  });
});

describe('buildTscsAttendeeRows — group + addon', () => {
  const group: TscsRegistration = {
    ...solo,
    registration_type: 'group',
    group: [
      { name: 'Second Person', email: 'p2@x.in', category: 'Nurses or Allied Health Professionals', fee: 7200 },
      { name: 'Third Person' },
    ],
    addon: { name: 'Free Companion', email: 'comp@x.in' },
  };

  it('creates linked member rows with unique dedupe suffixes', () => {
    const r = buildTscsAttendeeRows(group, baseOpts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(4);
    const [primary, p2, p3, addon]: any[] = r.rows;
    expect(p2.transaction_id).toBe('pay_ABC123-p2');
    expect(p3.transaction_id).toBe('pay_ABC123-p3');
    expect(p2.primary_attendee_id).toBe(primary.id);
    expect(p3.primary_attendee_id).toBe(primary.id);
    expect(addon.primary_attendee_id).toBe(primary.id);
    // ids must all differ (QR payloads collide otherwise)
    expect(new Set(r.rows.map((x: any) => x.id)).size).toBe(4);
  });

  it('members carry their own fee, or a non-monetary marker — never the total', () => {
    const r = buildTscsAttendeeRows(group, baseOpts);
    if (!r.ok) throw new Error('build failed');
    const [primary, p2, p3]: any[] = r.rows;
    expect(primary.payment_amount).toBe('2400.00 INR');
    expect(p2.payment_amount).toBe('7200.00 INR');
    // No fee known → marker that parsePaymentAmount refuses (not re-collectable,
    // not summable as a duplicate of the total).
    expect(p3.payment_amount).toBe('PAID WITH pay_ABC123 (INR)');
  });

  it('member category falls back to the primary category', () => {
    const r = buildTscsAttendeeRows(group, baseOpts);
    if (!r.ok) throw new Error('build failed');
    const [, p2, p3]: any[] = r.rows;
    expect(p2.pricing_category_id).toBe('nurse');
    expect(p3.pricing_category_id).toBe('student');
  });

  it('the free addon gets NULL payment_method (CHECK constraint rule) and free status', () => {
    const r = buildTscsAttendeeRows(group, baseOpts);
    if (!r.ok) throw new Error('build failed');
    const addon: any = r.rows[3];
    expect(addon.payment_status).toBe('free');
    expect(addon.payment_method).toBeNull();
    expect(addon.payment_amount).toBe('0');
    expect(addon.email).toBe('comp@x.in');
  });
});
