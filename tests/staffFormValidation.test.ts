import { describe, it, expect } from 'vitest';
import {
  isLikelyPhoneNumber,
  validateRequired,
  fieldRenderableForClaim,
  filterStepsForClaim,
  stepTitleForClaim,
  STAFF_CLAIM_HIDDEN_FIELD_IDS,
} from '../components/SteppedRegistration/steppedValidation';
import type { FormField } from '../types';

const f = (id: string, type: string, extra: Record<string, any> = {}): FormField =>
  ({ id, type, label: id, required: false, ...extra } as any);
const allVisible = () => true;

describe('isLikelyPhoneNumber', () => {
  it('accepts real numbers in the formats people actually type', () => {
    for (const n of [
      '+91 98765 43210',
      '+1 (555) 010-9999',
      '9876543210',
      '+44.20.7946.0958',
      '020 7946 0958',
    ]) {
      expect(isLikelyPhoneNumber(n), n).toBe(true);
    }
  });

  it('rejects the text people put in a phone box', () => {
    // The `phone` field is a plain text input, so all of these submit today —
    // and an unreachable contact is how a ticket fails to arrive.
    for (const n of ['n/a', 'N/A', 'ask my assistant', 'call the office', 'none', '-', '']) {
      expect(isLikelyPhoneNumber(n), n).toBe(false);
    }
  });

  it('rejects numbers outside the E.164 length range', () => {
    expect(isLikelyPhoneNumber('12345')).toBe(false);          // too short
    expect(isLikelyPhoneNumber('1234567890123456')).toBe(false); // 16 digits
    expect(isLikelyPhoneNumber('1234567')).toBe(true);          // 7 = lower bound
    expect(isLikelyPhoneNumber('123456789012345')).toBe(true);  // 15 = upper bound
  });

  it('rejects letters mixed into an otherwise valid number', () => {
    expect(isLikelyPhoneNumber('+1 555 CALL NOW')).toBe(false);
    expect(isLikelyPhoneNumber('98765x43210')).toBe(false);
  });

  it('handles null and undefined', () => {
    expect(isLikelyPhoneNumber(null)).toBe(false);
    expect(isLikelyPhoneNumber(undefined)).toBe(false);
  });
});

describe('validateRequired — phone', () => {
  const fields = [f('f_whatsapp', 'phone', { label: 'Phone Number', required: true })];

  it('blocks a text value in a phone field', () => {
    const r = validateRequired(fields, { f_whatsapp: 'ask my assistant' }, allVisible);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('valid phone number');
  });

  it('passes a real number', () => {
    expect(validateRequired(fields, { f_whatsapp: '+91 98765 43210' }, allVisible).ok).toBe(true);
  });

  it('still reports the plain required error when empty', () => {
    const r = validateRequired(fields, {}, allVisible);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Please fill in');
  });
});

describe('validateRequired — confirm email', () => {
  const fields = [
    f('f_email', 'email', { label: 'Email Address', required: true }),
    f('f_email_confirm', 'email', { label: 'Confirm Email Address', required: true, confirmsFieldId: 'f_email' }),
  ];

  it('blocks a mismatch', () => {
    const r = validateRequired(
      fields,
      { f_email: 'sameera.g@novartis.com', f_email_confirm: 'sameera.g@novartis.co' },
      allVisible,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('does not match');
  });

  it('accepts a match regardless of case or padding', () => {
    const r = validateRequired(
      fields,
      { f_email: 'Sameera.G@Novartis.com', f_email_confirm: '  sameera.g@novartis.com ' },
      allVisible,
    );
    expect(r.ok).toBe(true);
  });

  it('does not fire while the confirm box is still empty', () => {
    // Mid-typing should surface the required error, not a scary mismatch.
    const r = validateRequired(fields, { f_email: 'a@b.co' }, allVisible);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Please fill in');
  });

  it('still rejects a malformed address in the confirm field', () => {
    const r = validateRequired(fields, { f_email: 'a@b.co', f_email_confirm: 'nope' }, allVisible);
    expect(r.ok).toBe(false);
  });
});

describe('staff claim hiding', () => {
  it('hides affiliation, role, presenting and emergency contacts for BOTH staff types', () => {
    // Before 2026-08-19 this set was gated on the LEGACY exhibitor type only,
    // so combined-form staff (guest_type='staff-pending') saw all of them.
    for (const id of ['f_org', 'f_role', 'f_present', 'f_emerg_name', 'f_emerg_phone', 'f_emerg_rel']) {
      expect(STAFF_CLAIM_HIDDEN_FIELD_IDS.has(id), id).toBe(true);
      expect(fieldRenderableForClaim(f(id, 'text'), { isStaffClaim: true }), id).toBe(false);
      expect(fieldRenderableForClaim(f(id, 'text'), { isStaffClaim: false }), id).toBe(true);
    }
  });

  it('keeps the fields only the person can answer', () => {
    for (const id of ['f_fname', 'f_lname', 'f_email', 'f_whatsapp', 'f_diet', 'f_access', 'f_consent_terms']) {
      expect(fieldRenderableForClaim(f(id, 'text'), { isStaffClaim: true }), id).toBe(true);
    }
  });

  it('drops the affiliation step entirely once both its fields are hidden', () => {
    const steps = [
      { id: 'personal', label: 'Personal Details' },
      { id: 'affiliation', label: 'Affiliation & Role' },
    ] as any;
    const byStep = {
      personal: [f('f_fname', 'text')],
      affiliation: [f('f_org', 'text', { required: true }), f('f_role', 'text')],
    };
    const visible = filterStepsForClaim(steps, byStep, { isStaffClaim: true });
    expect(visible.map(s => s.id)).toEqual(['personal']);
  });

  it('a hidden REQUIRED field cannot block submit when folded into isVisible', () => {
    // f_org is required. Hiding it in the renderer without exempting it from
    // validation is precisely how the 2026-07-29 claim link stranded guests.
    const fields = [f('f_org', 'text', { required: true }), f('f_fname', 'text', { required: true })];
    const isVisible = (fl: FormField) => fieldRenderableForClaim(fl, { isStaffClaim: true });
    expect(validateRequired(fields, { f_fname: 'Sameera' }, isVisible).ok).toBe(true);
  });
});

describe('stepTitleForClaim', () => {
  const ticket = f('f_ticket', 'ticket');
  const consent = f('f_consent_terms', 'boolean');

  it('drops the payment wording when the payment field is hidden', () => {
    expect(stepTitleForClaim('Consent & Payment', [consent, ticket], { isClaim: true })).toBe('Consent');
  });

  it('leaves the label alone for a purchaser', () => {
    expect(stepTitleForClaim('Consent & Payment', [consent, ticket], { isClaim: false })).toBe('Consent & Payment');
  });

  it('leaves an unrelated label ending in Payment alone', () => {
    expect(stepTitleForClaim('Deferred Payment', [consent], { isClaim: true })).toBe('Deferred Payment');
  });

  it('never returns an empty heading', () => {
    expect(stepTitleForClaim('Payment', [ticket], { isClaim: true })).toBe('Payment');
  });
});
