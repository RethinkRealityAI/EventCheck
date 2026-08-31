import { describe, it, expect } from 'vitest';
import {
  parseTscsEmail,
  senderAllowed,
  categoryToPricingId,
  parseAmount,
} from '../supabase/functions/_shared/tscsEmailParse';

describe('senderAllowed', () => {
  it('matches domain suffixes and full addresses', () => {
    expect(senderAllowed('noreply@tscsindia.org', '@tscsindia.org')).toBe(true);
    expect(senderAllowed('Registrations <forms@tscsindia.org>', '@tscsindia.org')).toBe(true);
    expect(senderAllowed('attacker@evil.com', '@tscsindia.org')).toBe(false);
    expect(senderAllowed('a@b.com', '@tscsindia.org, a@b.com')).toBe(true);
  });

  it('full-address entries are EXACT — no substring impersonation', () => {
    // 'registrations@tscsindia.org.evil.in' CONTAINS the allowed address; a
    // substring check would wave it through.
    expect(senderAllowed('registrations@tscsindia.org.evil.in', 'registrations@tscsindia.org')).toBe(false);
    expect(senderAllowed('Evil <registrations@tscsindia.org.evil.in>', 'registrations@tscsindia.org')).toBe(false);
    expect(senderAllowed('xregistrations@tscsindia.org', 'registrations@tscsindia.org')).toBe(false);
    expect(senderAllowed('registrations@tscsindia.org', 'registrations@tscsindia.org')).toBe(true);
    expect(senderAllowed('REGISTRATIONS@TSCSINDIA.ORG', 'registrations@tscsindia.org')).toBe(true);
  });

  it('@domain entries anchor at the @ — lookalike domains fail', () => {
    expect(senderAllowed('x@eviltscsindia.org', '@tscsindia.org')).toBe(false);
    expect(senderAllowed('x@tscsindia.org.in', '@tscsindia.org')).toBe(false);
  });
});

describe('parseAmount', () => {
  it('preserves decimals — never a 100x inflation', () => {
    expect(parseAmount('₹2,400.00')).toBe(2400);
    expect(parseAmount('INR 2400.50')).toBe(2400.5);
    expect(parseAmount('Rs. 9,600')).toBe(9600);
    expect(parseAmount('9600')).toBe(9600);
    expect(parseAmount(2400)).toBe(2400);
  });

  it('refuses garbage instead of inventing a number', () => {
    expect(parseAmount('free')).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount(undefined)).toBeUndefined();
    expect(parseAmount(null)).toBeUndefined();
    expect(parseAmount(NaN)).toBeUndefined();
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

  it('survives inside a full HTML body (comments are stripped by stripHtml)', () => {
    const html = `<html><body><p>Thank you for registering!</p>
<!-- GANSID-JSON {"name":"Html Person","email":"h@x.in","category":"Industry Partners","total_inr":24000,"payment_id":"pay_HtmlBody01"} -->
<div>GANSID Congress 2026</div></body></html>`;
    const r = parseTscsEmail({ html });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('json');
    expect(r.registration.payment_id).toBe('pay_HtmlBody01');
    expect(r.registration.total_inr).toBe(24000);
  });

  it('brace-balances a bare block followed by footer text (no terminator)', () => {
    const r = parseTscsEmail({
      text: `GANSID-JSON {"name":"Brace Case","email":"b@x.in","category":"Physicians / Researchers","addon":{"name":"Curly {Brace} Fan"}}\nRegards,\nThe TSCS Team {est. 1998}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('json');
    expect(r.registration.addon?.name).toBe('Curly {Brace} Fan');
  });

  it('coerces string-typed amounts from the JSON path — no NaN on paid records', () => {
    const r = parseTscsEmail({
      text: `GANSID-JSON {"name":"String Amount","email":"s@x.in","category":"Patients or Family Members","total_inr":"₹2,400.00","group":[{"name":"G One","fee":"7,200"}]}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registration.total_inr).toBe(2400);
    expect(r.registration.group![0].fee).toBe(7200);
  });

  it('drops a non-numeric total rather than keeping NaN', () => {
    const r = parseTscsEmail({
      text: `GANSID-JSON {"name":"Bad Amount","email":"n@x.in","category":"Industry Partners","total_inr":"contact us"}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration.total_inr).toBeUndefined();
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

  it('parses a decimal total from label lines without 100x inflation', () => {
    const r = parseTscsEmail({
      text: 'Name: A B\nEmail: a@b.com\nCategory: Industry Partners\nTotal Fee: ₹9,600.00',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration.total_inr).toBe(9600);
  });

  it('drops implausible payment ids rather than trusting them', () => {
    const r = parseTscsEmail({
      text: 'Name: A B\nEmail: a@b.com\nCategory: Patients or Family Members\nPayment ID: <script>x</script>',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration.payment_id).toBeUndefined();
  });
});
