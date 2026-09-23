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
  name: 'Kavitha Ramaswamy',
  first_name: 'Kavitha',
  last_name: 'Ramaswamy',
  email: 'kavitha@example.com',
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

  // This used to fall back to `tscs-<message id>` as the dedupe key, which is
  // how two abandoned-checkout notices became paid rows with tickets: a mail
  // with no payment id could still be registered as paid. No payment id, no
  // paid row — a human decides in the review queue instead.
  it('refuses to build a paid row without a Razorpay payment id', () => {
    const withMessageId = buildTscsAttendeeRows({ ...solo, payment_id: undefined }, { ...baseOpts, messageId: 'msg-1' });
    expect(withMessageId.ok).toBe(false);
    expect((withMessageId as any).error).toMatch(/payment id/i);

    const withNothing = buildTscsAttendeeRows({ ...solo, payment_id: undefined }, baseOpts);
    expect(withNothing.ok).toBe(false);
  });

  it('refuses an empty-string payment id just as firmly', () => {
    const r = buildTscsAttendeeRows({ ...solo, payment_id: '' }, { ...baseOpts, messageId: 'msg-1' });
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

  it('test rehearsals get their own dedupe keyspace (test- prefix)', () => {
    // An isTest dry-run for pay_X must never block (or be blocked by) the
    // later REAL ingest of pay_X.
    const rehearsal = buildTscsAttendeeRows(
      { ...solo, group: [{ name: 'P Two' }] },
      { ...baseOpts, isTest: true },
    );
    const real = buildTscsAttendeeRows({ ...solo, group: [{ name: 'P Two' }] }, baseOpts);
    expect(rehearsal.ok && real.ok).toBe(true);
    if (!rehearsal.ok || !real.ok) return;
    expect(rehearsal.txnBase).toBe('test-pay_ABC123');
    expect(real.txnBase).toBe('pay_ABC123');
    expect((rehearsal.rows[1] as any).transaction_id).toBe('test-pay_ABC123-p2');
  });

  it('a non-finite total falls back to the non-monetary marker, never "NaN INR"', () => {
    const r = buildTscsAttendeeRows({ ...solo, total_inr: NaN }, baseOpts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.rows[0] as any).payment_amount).toBe('PAID VIA TSCS (INR)');
    const r2 = buildTscsAttendeeRows({ ...solo, total_inr: undefined }, baseOpts);
    if (r2.ok) expect((r2.rows[0] as any).payment_amount).toBe('PAID VIA TSCS (INR)');
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

// ── Companions: who is on the roster, and who can we write to? ─────────────
//
// The add-on block used to accept whatever TSCS sent. Two live rows show the
// cost: an attendee literally named "- -" holding the purchaser's inbox
// (REG-00061), and a companion stored at a doubled-TLD address that can never
// be delivered (REG-00058).

const withAddon = (addon: { name?: string; email?: string } | undefined): TscsRegistration => ({
  ...solo,
  payment_id: 'pay_ADDON1',
  addon,
});

describe('buildTscsAttendeeRows — free add-on companion', () => {
  const build = (reg: TscsRegistration) => {
    const r = buildTscsAttendeeRows(reg, { ...baseOpts, uuid: (() => { let i = 0; return () => `id-${++i}`; })() });
    if (r.ok === false) throw new Error(r.error);
    return r;
  };

  it('registers a fully identified companion as a normal person with their own ticket', () => {
    const r = build(withAddon({ name: 'Meera Devi Thomas', email: 'Meera@Example.com' }));
    const addon: any = r.rows[1];
    expect(addon.name).toBe('Meera Devi Thomas');
    expect(addon.email).toBe('meera@example.com');
    expect(addon.guest_type).toBeNull();
    expect(addon.ticket_type).toBe('Registration (Free Add-on)');
    expect(addon.payment_status).toBe('free');
    expect(addon.payment_method).toBeNull();
    // A complimentary seat was not sold at any of the template's paid rates,
    // so it must not be counted as one.
    expect(addon.pricing_category_id).toBeUndefined();
    // …but it IS traceable to the payment that bought it.
    expect(addon.transaction_id).toBe('pay_ADDON1-p2');
    expect(addon.answers).toMatchObject({
      f_fname: 'Meera', f_lname: 'Devi Thomas',
      f_email: 'meera@example.com',
      tscs_email_source: 'own',
      tscs_companion_status: 'identified',
    });
    expect(r.companions).toEqual([
      expect.objectContaining({ status: 'identified', hasOwnEmail: true, attendeeId: 'id-2' }),
    ]);
  });

  it('turns an unnamed companion into an unclaimed seat rather than a roster ghost', () => {
    const r = build(withAddon({ name: '- -', email: '' }));
    const addon: any = r.rows[1];
    expect(addon.guest_type).toBe('pending-claim');
    expect(addon.name).toBe('Kavitha Ramaswamy - Guest (pending)');
    // Never the purchaser's inbox: `.invalid` reaches nobody by design.
    expect(addon.email).toBe('guest-id-2@placeholder.invalid');
    expect(addon.answers.tscs_companion_status).toBe('pending');
    expect(addon.answers.tscs_raw_name).toBe('- -');
    expect(addon.answers.tscs_name_issue).toBe('placeholder');
    expect(r.companions[0]).toMatchObject({ status: 'pending', hasOwnEmail: false });
  });

  it('keeps a named companion on the roster when only their address is unusable', () => {
    // Kavya N arrived with "companion@gmail.com.com". She is a real
    // person on a paid booking — hiding her would take her off check-in.
    const r = build(withAddon({ name: 'Kavya N', email: 'companion@gmail.com.com' }));
    const addon: any = r.rows[1];
    expect(addon.guest_type).toBeNull();
    expect(addon.name).toBe('Kavya N');
    expect(addon.email).toBe('kavitha@example.com'); // purchaser's, deliverable
    expect(addon.answers.f_email).toBeNull();
    expect(addon.answers.tscs_email_source).toBe('inherited');
    expect(addon.answers.tscs_email_issue).toBe('doubled-tld');
    expect(addon.answers.tscs_raw_email).toBe('companion@gmail.com.com');
    // No own inbox → no separate ticket; the purchaser's mail covers them.
    expect(r.companions[0]).toMatchObject({ status: 'identified', hasOwnEmail: false });
  });

  it('marks a companion who reused the purchaser address as sharing that inbox', () => {
    const r = build(withAddon({ name: 'Arun Menon', email: 'KAVITHA@example.com' }));
    const addon: any = r.rows[1];
    expect(addon.email).toBe('kavitha@example.com');
    expect(addon.answers.f_email).toBeNull();
    expect(addon.answers.tscs_email_source).toBe('inherited');
    expect(addon.answers.tscs_email_issue).toBe('same-as-purchaser');
  });

  it('still books the seat when TSCS sends an add-on block with only an email', () => {
    // The buyer paid for that seat either way — dropping it loses inventory.
    const r = build(withAddon({ name: '', email: 'someone@example.com' }));
    expect(r.rows).toHaveLength(2);
    expect((r.rows[1] as any).guest_type).toBe('pending-claim');
  });

  it('creates no companion row when there was no add-on block at all', () => {
    expect(build(withAddon(undefined)).rows).toHaveLength(1);
    expect(build(withAddon({ name: '', email: '' })).rows).toHaveLength(1);
  });

  it('numbers the free seat after the paid participants', () => {
    const r = build({
      ...withAddon({ name: 'Free Person', email: 'free@example.com' }),
      group: [{ name: 'Paid One', email: 'one@example.com' }, { name: 'Paid Two' }],
    });
    expect(r.rows.map((x: any) => x.transaction_id)).toEqual([
      'pay_ADDON1', 'pay_ADDON1-p2', 'pay_ADDON1-p3', 'pay_ADDON1-p4',
    ]);
  });

  it('applies the same identity rules to paid group members', () => {
    const r = build({ ...withAddon(undefined), group: [{ name: 'None None' }, { name: 'Real Person' }] });
    const [, ghost, real]: any[] = r.rows;
    expect(ghost.guest_type).toBe('pending-claim');
    expect(ghost.email).toBe('guest-id-2@placeholder.invalid');
    expect(real.guest_type).toBeNull();
    expect(real.email).toBe('kavitha@example.com');
    expect(real.answers.tscs_email_source).toBe('inherited');
    // Paid participants DO carry a category — they were sold at a rate.
    expect(real.pricing_category_id).toBe('student');
  });
});
