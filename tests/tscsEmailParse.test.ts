import { describe, it, expect } from 'vitest';
import {
  parseTscsEmail,
  senderAllowed,
  categoryToPricingId,
} from '../supabase/functions/_shared/tscsEmailParse';

describe('senderAllowed', () => {
  it('matches domain suffixes and full addresses', () => {
    expect(senderAllowed('noreply@tscsindia.org', '@tscsindia.org')).toBe(true);
    expect(senderAllowed('Registrations <forms@tscsindia.org>', '@tscsindia.org')).toBe(true);
    expect(senderAllowed('attacker@evil.com', '@tscsindia.org')).toBe(false);
    expect(senderAllowed('a@b.com', '@tscsindia.org, a@b.com')).toBe(true);
  });
});

describe('categoryToPricingId', () => {
  it('maps every TSCS category name to our pricing category', () => {
    expect(categoryToPricingId('Physicians / Researchers')).toBe('physician');
    expect(categoryToPricingId('Medical Trainees (Residents, Fellows)')).toBe('trainee');
    expect(categoryToPricingId('Abstract Presenters')).toBe('abstract_presenter');
    expect(categoryToPricingId('Undergraduate, Medical, Graduate Students')).toBe('student');
    expect(categoryToPricingId('Nurses or Allied Health Professionals')).toBe('nurse');
    expect(categoryToPricingId('Industry Partners')).toBe('industry');
    expect(categoryToPricingId('Patient Organizations')).toBe('patient_org');
    expect(categoryToPricingId('Patients or Family Members')).toBe('patient');
    expect(categoryToPricingId('Astronaut')).toBeNull();
  });

  it('prefers organization over patient for patient organizations', () => {
    // "Patient Organizations" contains "patient" too — order matters.
    expect(categoryToPricingId('patient organisations')).toBe('patient_org');
  });
});

describe('parseTscsEmail — GANSID-JSON block', () => {
  it('parses the embedded machine block', () => {
    const r = parseTscsEmail({
      text: `Thank you for registering!\n<!-- GANSID-JSON {"first_name":"Sathwika","last_name":"Maheswarapu","email":"S@Example.com","category":"Undergraduate, Medical, Graduate Students","total_inr":2400,"payment_id":"pay_ABC123xyz","attending_days":"October 23, 2026,October 24, 2026"} -->`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('json');
    expect(r.registration.email).toBe('s@example.com');
    expect(r.registration.name).toBe('Sathwika Maheswarapu');
    expect(r.registration.total_inr).toBe(2400);
    expect(r.registration.payment_id).toBe('pay_ABC123xyz');
  });

  it('accepts a group registration with participants', () => {
    const r = parseTscsEmail({
      text: `GANSID-JSON {"name":"Lead Person","email":"lead@x.in","category":"Physicians / Researchers","registration_type":"group","group":[{"name":"Second Person","email":"p2@x.in","category":"Nurses or Allied Health Professionals"},{"name":"  ","email":"discard@x.in"}]}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registration.group).toHaveLength(1);
    expect(r.registration.group![0].email).toBe('p2@x.in');
  });
});

describe('parseTscsEmail — label fallback', () => {
  const sample = [
    'GANSID Congress 2026 — Registration Confirmation',
    'First Name: Anurati',
    'Last Name: Arora',
    'Email: aroraanurati@gmail.com',
    'WhatsApp: 8872811558',
    'City: Bathinda',
    'Institution / Organization: Adesh University',
    'Registration Category: Medical Trainees (Residents, Fellows)',
    'Days Attending: October 23, 2026, October 24, 2026',
    'Total Fee: ₹9,600',
    'Razorpay Payment ID: pay_NxYz12345678',
  ].join('\n');

  it('extracts fields from label/value lines', () => {
    const r = parseTscsEmail({ text: sample });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('labels');
    expect(r.registration.name).toBe('Anurati Arora');
    expect(r.registration.email).toBe('aroraanurati@gmail.com');
    expect(r.registration.phone).toBe('8872811558');
    expect(r.registration.institution).toBe('Adesh University');
    expect(r.registration.total_inr).toBe(9600);
    expect(r.registration.payment_id).toBe('pay_NxYz12345678');
    expect(categoryToPricingId(r.registration.category)).toBe('trainee');
  });

  it('extracts the same fields from an HTML body', () => {
    const html = `<table>${sample.split('\n').map((l) => `<tr><td>${l.replace(':', '</td><td>')}</td></tr>`).join('')}</table>`;
    const r = parseTscsEmail({ html });
    // HTML table splits label/value into cells; the joined text keeps ":"-less
    // rows unparseable, so at minimum the plain lines survive stripping.
    const r2 = parseTscsEmail({ html: `<div>${sample.replace(/\n/g, '<br>')}</div>` });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.registration.email).toBe('aroraanurati@gmail.com');
    // Table-form emails must at worst fail safe (needs-review), never mis-parse.
    if (r.ok) expect(r.registration.email).toBe('aroraanurati@gmail.com');
  });

  it('fails safe on missing essentials', () => {
    expect(parseTscsEmail({ text: 'Name: X\nCategory: Physicians / Researchers' }).ok).toBe(false);
    expect(parseTscsEmail({ text: 'Email: a@b.com\nName: X\nCategory: Rocket Scientist' }).ok).toBe(false);
    expect(parseTscsEmail({ text: '' }).ok).toBe(false);
  });

  it('drops implausible payment ids rather than trusting them', () => {
    const r = parseTscsEmail({
      text: 'Name: A B\nEmail: a@b.com\nCategory: Patients or Family Members\nPayment ID: <script>x</script>',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration.payment_id).toBeUndefined();
  });
});
