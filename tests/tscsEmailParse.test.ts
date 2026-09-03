import { describe, it, expect } from 'vitest';
import {
  parseTscsEmail,
  senderAllowed,
  categoryToPricingId,
  parseAmount,
  paymentStateOf,
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

// Fixtures below are the text bodies of REAL "[PAID] Registration Confirmed"
// emails from contact@tscsindia.org (captured 2026-08-31, dry-run poll). The
// template renders an HTML table, so labels and values run together with no
// colons and wrap mid-label — the 'table' strategy exists for exactly this.
describe('parseTscsEmail — live TSCS table template', () => {
  const solo = [
    '✅ [https://s.w.org/images/core/emoji/17.0.2/72x72/2705.png]',
    '',
    'PAYMENT CONFIRMED',
    '',
    'Registration Successful',
    '',
    'Ref: REG-00020  |  Via: Razorpay',
    '',
    'Your registration has been successfully completed.',
    '',
    'Hello Sathwika,',
    '',
    'Registration Details',
    '',
    'Full NameDr. Sathwika Maheswarapu Emailsathwika.mbbs@gmail.com Phone9390585989',
    'CountryIndia CityHanamkonda InstitutionChelmeda Anand Rao institute of medical',
    'science RoleMedical officer CategoryUndergraduate, Medical, Graduate Students',
    'Pricing TierPromo Total Participants1 Attending DaysOct 23, 2026, Oct 24, 2026,',
    'Oct 25, 2026 Presentation Transaction IDpay_TWIWKFEYdkL4F7',
    '',
    'Amount Paid ₹2,400.00 INR',
    '',
    'Automated notification from TSCS INDIA – Best Thalassemia Treatment in Hyderabad',
    '— https://www.tscsindia.org [https://www.tscsindia.org]',
  ].join('\n');

  it('parses a real individual registration (run-together labels, no colons)', () => {
    const r = parseTscsEmail({ subject: '[PAID] Registration Confirmed: REG-00020', text: solo });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('table');
    expect(r.registration.name).toBe('Sathwika Maheswarapu'); // honorific stripped
    expect(r.registration.email).toBe('sathwika.mbbs@gmail.com');
    expect(r.registration.phone).toBe('9390585989');
    expect(r.registration.city).toBe('Hanamkonda');
    expect(r.registration.institution).toBe('Chelmeda Anand Rao institute of medical science');
    expect(r.registration.role).toBe('Medical officer');
    expect(categoryToPricingId(r.registration.category)).toBe('student');
    expect(r.registration.participants).toBe(1);
    expect(r.registration.attending_days).toBe('Oct 23, 2026, Oct 24, 2026, Oct 25, 2026');
    expect(r.registration.payment_id).toBe('pay_TWIWKFEYdkL4F7');
    expect(r.registration.total_inr).toBe(2400); // not 240000 — footer cut at INR
    expect(r.registration.group).toBeUndefined();
  });

  const group = [
    'PAYMENT CONFIRMED',
    '',
    'Ref: REG-00012  |  Via: Razorpay',
    '',
    'Hello Ashif,',
    '',
    'Registration Details',
    '',
    'Full NameMs. Ashif Ahammed Emailashifahammed8@gmail.com Phone5555555555',
    'CountryIndia CityRampurhat InstitutionTSCS RoleDeveloper CategoryMedical',
    'Trainees (Residents, Fellows) Pricing TierPromo Total Participants2 Attending',
    'DaysOct 23, 2026, Oct 24, 2026 Presentation Transaction IDpay_TVUDr8BBWJq3px',
    '',
    'Additional Participants',
    '',
    'Participant 2 Ashif Ahammed',
    'ashifahammed8@gmail.com | 666666666',
    'Attending: Oct 24, 2026',
    'Undergraduate, Medical, Graduate Students',
    '',
    'Amount Paid ₹12,000.00 INR',
    '',
    'Automated notification from TSCS INDIA',
  ].join('\n');

  it('parses a real group registration with an Additional Participants block', () => {
    const r = parseTscsEmail({ subject: '[PAID] Registration Confirmed: REG-00012', text: group });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('table');
    expect(r.registration.name).toBe('Ashif Ahammed');
    expect(categoryToPricingId(r.registration.category)).toBe('trainee');
    expect(r.registration.participants).toBe(2);
    expect(r.registration.total_inr).toBe(12000);
    expect(r.registration.payment_id).toBe('pay_TVUDr8BBWJq3px');
    expect(r.registration.registration_type).toBe('group');
    expect(r.registration.group).toHaveLength(1);
    const p2 = r.registration.group![0];
    expect(p2.name).toBe('Ashif Ahammed');
    expect(p2.email).toBe('ashifahammed8@gmail.com');
    expect(p2.attending_days).toBe('Oct 24, 2026');
    expect(categoryToPricingId(p2.category || '')).toBe('student');
  });

  it('parses the same template arriving as HTML table cells', () => {
    const html = `<table><tr><td>Full Name</td><td>Ms. Snigdha rani Mishra</td></tr>
<tr><td>Email</td><td>snigdharani1989@gmail.com</td></tr>
<tr><td>Phone</td><td>+918847853553</td></tr>
<tr><td>City</td><td>Semiliguda</td></tr>
<tr><td>Institution</td><td>Live for Others</td></tr>
<tr><td>Role</td><td>Secretary General</td></tr>
<tr><td>Category</td><td>Patient Organizations</td></tr>
<tr><td>Total Participants</td><td>1</td></tr>
<tr><td>Attending Days</td><td>Oct 23, 2026, Oct 24, 2026, Oct 25, 2026</td></tr>
<tr><td>Transaction ID</td><td>pay_TVz8M4EhmZNXMn</td></tr>
<tr><td>Amount Paid</td><td>₹4,800.00 INR</td></tr></table>`;
    const r = parseTscsEmail({ html });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registration.email).toBe('snigdharani1989@gmail.com');
    expect(r.registration.name).toBe('Snigdha rani Mishra');
    expect(categoryToPricingId(r.registration.category)).toBe('patient_org');
    expect(r.registration.total_inr).toBe(4800);
    expect(r.registration.payment_id).toBe('pay_TVz8M4EhmZNXMn');
  });
});

// Regression fixtures from LIVE production incidents (2026-09-03). Both bugs
// below reached real registrants before being caught.
describe('paymentStateOf — the pending-notice trap', () => {
  // TSCS mails this for an abandoned checkout. It is structurally identical to
  // a confirmation: same table, same registrant, same fields. Two of these were
  // ingested as PAID and had congress tickets emailed.
  const pendingSubject = '⏳ [PENDING] Incomplete Registration: REG-00022';
  const confirmedSubject = '✅ [SUCCESS] Registration Confirmed: REG-00022';

  it('treats a [PENDING] notice as unpaid even when it parses perfectly', () => {
    expect(paymentStateOf({ subject: pendingSubject })).toBe('pending');
    expect(paymentStateOf({ subject: 'Incomplete Registration: REG-1' })).toBe('pending');
    // Pending must win even if the body also carries positive-sounding words.
    expect(paymentStateOf({
      subject: pendingSubject,
      text: 'Registration Successful\nPAYMENT CONFIRMED',
    })).toBe('pending');
  });

  it('a transaction id is proof of payment', () => {
    expect(paymentStateOf({ subject: confirmedSubject, paymentId: 'pay_TXTbLRamVUH3bp' })).toBe('confirmed');
    expect(paymentStateOf({ subject: 'anything', paymentId: 'pay_ABC123' })).toBe('confirmed');
  });

  it('accepts the [PAID]/[SUCCESS]/PAYMENT CONFIRMED markers without an id', () => {
    expect(paymentStateOf({ subject: '[PAID] Registration Confirmed: REG-12' })).toBe('confirmed');
    expect(paymentStateOf({ subject: confirmedSubject })).toBe('confirmed');
    expect(paymentStateOf({ text: 'PAYMENT CONFIRMED\nRef: REG-9' })).toBe('confirmed');
  });

  it('anything else is unknown — a human decides, never an auto-register', () => {
    expect(paymentStateOf({ subject: 'Your registration details' })).toBe('unknown');
    expect(paymentStateOf({})).toBe('unknown');
  });
});

describe('parseTscsEmail — free add-on person', () => {
  // A complimentary companion on a PAID booking. The block was not parsed, so
  // Isha was never registered or ticketed despite ₹7,200 being collected.
  const withAddon = [
    'PAYMENT CONFIRMED',
    'Ref: REG-00022  |  Via: Razorpay',
    'Hello VIvek,',
    'Registration Details',
    'Full NameDr. VIvek Gunda Emailsunnyvivek64@gmail.com Phone+918106676343',
    'CountryIndia CityHyderabad, Moosapet InstitutionYashoda Hospitals RoleConsultant',
    'Transfusion medicine CategoryAbstract Presenters Pricing TierPromo Total',
    'Participants1 Attending DaysOct 23, 2026, Oct 24, 2026, Oct 25, 2026',
    'Presentation Transaction IDpay_TXTbLRamVUH3bp',
    '',
    'Free Addon Person',
    '',
    'NameIsha PolavarapuEmailishapolavarapu91@gmail.comPhone8978978686',
    '',
    'Amount Paid ₹7,200.00 INR',
    '',
    'Automated notification from TSCS INDIA',
  ].join('\n');

  it('extracts the companion from the run-together block', () => {
    const r = parseTscsEmail({ subject: '✅ [SUCCESS] Registration Confirmed: REG-00022', text: withAddon });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registration.addon).toEqual({
      name: 'Isha Polavarapu',
      email: 'ishapolavarapu91@gmail.com',
    });
  });

  it('does not let the add-on block corrupt the primary registrant', () => {
    const r = parseTscsEmail({ text: withAddon });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registration.name).toBe('VIvek Gunda');
    expect(r.registration.email).toBe('sunnyvivek64@gmail.com');
    // The add-on's phone must not overwrite the primary's, and the amount must
    // survive the block sitting between Transaction ID and Amount Paid.
    expect(r.registration.phone).toBe('+918106676343');
    expect(r.registration.payment_id).toBe('pay_TXTbLRamVUH3bp');
    expect(r.registration.total_inr).toBe(7200);
  });

  it('leaves addon unset when there is no such block', () => {
    const r = parseTscsEmail({
      text: 'Full NameA B Emaila@b.com CategoryIndustry Partners Transaction IDpay_X1Y2Z3',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration.addon).toBeUndefined();
  });
});
