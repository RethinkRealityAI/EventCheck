import { describe, it, expect } from 'vitest';
import {
  applyCompletion,
  assessCompleteness,
  isAnswered,
  isAskableOnCompletion,
  isFieldVisible,
  sanitizeValue,
  ASKED_FIELDS_KEY,
  COMPLETED_AT_KEY,
  type CompletenessField,
} from '../supabase/functions/_shared/registrationCompleteness';

// The live GANSID congress form, trimmed to the shapes that matter.
const F = (over: Partial<CompletenessField> & Pick<CompletenessField, 'id' | 'type'>): CompletenessField => ({
  label: over.id, required: false, ...over,
});
const FORM: CompletenessField[] = [
  F({ id: 'f_mode', type: 'registration-mode-selector', required: true }),
  F({ id: 'f_fname', type: 'text', required: true, label: 'First Name' }),
  F({ id: 'f_lname', type: 'text', required: true, label: 'Last Name' }),
  F({ id: 'f_email', type: 'email', required: true, label: 'Email Address' }),
  F({ id: 'f_whatsapp', type: 'phone', required: true }),
  F({ id: 'f_org', type: 'text', required: true }),
  F({ id: 'f_role', type: 'text' }),
  F({ id: 'f_country', type: 'country', required: true, usedForPricing: true }),
  F({ id: 'f_city', type: 'text' }),
  F({ id: 'f_days', type: 'checkbox', options: ['October 23, 2026', 'October 24, 2026', 'October 25, 2026'] }),
  F({ id: 'f_diet', type: 'textarea' }),
  F({ id: 'f_present', type: 'radio', options: ['No', 'Yes, oral presentation', 'Yes, poster'] }),
  F({ id: 'f_emerg_name', type: 'text' }),
  F({ id: 'f_consent_photo', type: 'boolean', required: true, label: 'Photo consent' }),
  F({ id: 'f_consent_terms', type: 'boolean', required: true, label: 'I have read and agree to the', linkText: 'Terms' }),
  F({ id: 'f_consent_liability', type: 'boolean', required: true, label: 'Liability' }),
  F({ id: 'f_consent_promo', type: 'radio', options: ['Yes', 'No'] }),
  F({ id: 'f_ticket', type: 'ticket' }),
];

// The shape of answers a TSCS India booking arrives with: identity, contact,
// organisation and days — nothing else. (Synthetic values; never real people.)
const TSCS_SPEAKER = {
  f_title: 'Prof.', f_fname: 'A', f_lname: 'Example Speaker', f_email: 'speaker@example.org',
  f_whatsapp: '+910000000000', f_org: 'Example Medical College', f_country: 'IN', f_days: ['October 25, 2026'],
};

describe('isAnswered', () => {
  it('counts a required consent only when it is true', () => {
    const consent = F({ id: 'c', type: 'boolean', required: true });
    expect(isAnswered(consent, true)).toBe(true);
    expect(isAnswered(consent, false)).toBe(false);
    expect(isAnswered(consent, undefined)).toBe(false);
  });

  it('treats an optional toggle as answered either way — left off is an answer', () => {
    expect(isAnswered(F({ id: 't', type: 'boolean' }), false)).toBe(true);
  });

  it('does not count blank text or an empty selection', () => {
    expect(isAnswered(F({ id: 'x', type: 'text' }), '   ')).toBe(false);
    expect(isAnswered(F({ id: 'x', type: 'checkbox' }), [])).toBe(false);
  });
});

describe('isAskableOnCompletion', () => {
  it('never offers the ticket, the mode selector, the email or a pricing field', () => {
    const byId = new Map(FORM.map(f => [f.id, f]));
    expect(isAskableOnCompletion(byId.get('f_ticket')!)).toBe(false);
    expect(isAskableOnCompletion(byId.get('f_mode')!)).toBe(false);
    // Email IS the identity: a link holder who could change it could redirect the ticket.
    expect(isAskableOnCompletion(byId.get('f_email')!)).toBe(false);
    // Country decided the price paid.
    expect(isAskableOnCompletion(byId.get('f_country')!)).toBe(false);
    expect(isAskableOnCompletion(byId.get('f_diet')!)).toBe(true);
  });
});

describe('isFieldVisible', () => {
  const dependent = F({ id: 'f_abstract', type: 'text', required: true, conditional: { enabled: true, fieldId: 'f_present', value: 'Yes, poster' } });

  it('hides a conditional question until its trigger is answered that way', () => {
    expect(isFieldVisible(dependent, {})).toBe(false);
    expect(isFieldVisible(dependent, { f_present: 'No' })).toBe(false);
    expect(isFieldVisible(dependent, { f_present: 'Yes, poster' })).toBe(true);
  });

  it('matches checkbox triggers by membership', () => {
    const onDay = F({ id: 'x', type: 'text', conditional: { enabled: true, fieldId: 'f_days', value: 'October 23, 2026' } });
    expect(isFieldVisible(onDay, { f_days: ['October 23, 2026'] })).toBe(true);
  });
});

describe('assessCompleteness', () => {
  it('reports exactly what the TSCS page never asks', () => {
    const r = assessCompleteness(FORM, TSCS_SPEAKER);
    expect(r.outstanding.map(f => f.id)).toEqual([
      'f_role', 'f_city', 'f_diet', 'f_present', 'f_emerg_name',
      'f_consent_photo', 'f_consent_terms', 'f_consent_liability', 'f_consent_promo',
    ]);
    expect(r.consentsMissing.map(f => f.id)).toEqual(['f_consent_photo', 'f_consent_terms', 'f_consent_liability']);
    expect(r.complete).toBe(false);
  });

  it('never lists a field hidden by a condition, even when required', () => {
    const form = [...FORM, F({ id: 'f_abstract', type: 'text', required: true, conditional: { enabled: true, fieldId: 'f_present', value: 'Yes, poster' } })];
    expect(assessCompleteness(form, TSCS_SPEAKER).outstanding.map(f => f.id)).not.toContain('f_abstract');
  });

  it('separates "never asked" from "asked and left blank"', () => {
    const r = assessCompleteness(FORM, { ...TSCS_SPEAKER, [ASKED_FIELDS_KEY]: ['f_diet', 'f_role'] });
    expect(r.declined.map(f => f.id)).toEqual(['f_role', 'f_diet']);
    expect(r.outstanding.map(f => f.id)).not.toContain('f_diet');
  });

  it('never treats a required question as declined, whatever was asked', () => {
    const r = assessCompleteness(FORM, { ...TSCS_SPEAKER, [ASKED_FIELDS_KEY]: ['f_consent_terms'] });
    expect(r.outstandingRequired.map(f => f.id)).toContain('f_consent_terms');
  });
});

describe('sanitizeValue', () => {
  const radio = F({ id: 'r', type: 'radio', options: ['Yes', 'No'] });

  it('rejects an option the form never offered', () => {
    expect(sanitizeValue(radio, 'Maybe')).toEqual({ ok: false });
    expect(sanitizeValue(F({ id: 'c', type: 'checkbox', options: ['A'] }), ['A', 'Z'])).toEqual({ ok: false });
  });

  it('refuses a consent that is not a real boolean', () => {
    expect(sanitizeValue(F({ id: 'c', type: 'boolean', required: true }), 'true')).toEqual({ ok: false });
  });

  it('bounds and trims free text', () => {
    const v = sanitizeValue(F({ id: 't', type: 'text' }), `  ${'x'.repeat(5000)}  `);
    expect(v.ok && (v.value as string).length).toBe(2000);
  });
});

describe('applyCompletion', () => {
  const NOW = '2026-09-23T10:00:00.000Z';
  const consents = { f_consent_photo: true, f_consent_terms: true, f_consent_liability: true };

  it('completes a registration once every required question is answered', () => {
    const r = applyCompletion(FORM, TSCS_SPEAKER, { ...consents, f_diet: 'Vegetarian' }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers.f_diet).toBe('Vegetarian');
    expect(r.answers[COMPLETED_AT_KEY]).toBe(NOW);
    expect(r.report.complete).toBe(true);
  });

  it('blocks on an unticked consent, and names it', () => {
    const r = applyCompletion(FORM, TSCS_SPEAKER, { f_consent_photo: true, f_consent_terms: true }, NOW);
    expect(r).toMatchObject({ ok: false, fieldId: 'f_consent_liability' });
  });

  it('cannot overwrite anything we already have', () => {
    const r = applyCompletion(FORM, TSCS_SPEAKER, { ...consents, f_org: 'Somewhere Else', f_days: ['October 23, 2026'] }, NOW);
    expect(r.ok && r.answers.f_org).toBe('Example Medical College');
    expect(r.ok && r.answers.f_days).toEqual(['October 25, 2026']);
  });

  it('cannot change the email or a pricing field even when they are blank', () => {
    const blank = { ...TSCS_SPEAKER, f_email: '', f_country: '' };
    const r = applyCompletion(FORM, blank, { ...consents, f_email: 'attacker@example.com', f_country: 'US' }, NOW);
    expect(r.ok && r.answers.f_email).toBe('');
    expect(r.ok && r.answers.f_country).toBe('');
  });

  it('ignores keys the form does not define', () => {
    const r = applyCompletion(FORM, TSCS_SPEAKER, { ...consents, is_admin: true, payment_status: 'paid' }, NOW);
    expect(r.ok && 'is_admin' in r.answers).toBe(false);
  });

  it('demands a conditional question revealed by the same submission', () => {
    const form = [...FORM, F({ id: 'f_abstract', type: 'text', required: true, label: 'Abstract title', conditional: { enabled: true, fieldId: 'f_present', value: 'Yes, poster' } })];
    const missing = applyCompletion(form, TSCS_SPEAKER, { ...consents, f_present: 'Yes, poster' }, NOW);
    expect(missing).toMatchObject({ ok: false, fieldId: 'f_abstract' });
    const done = applyCompletion(form, TSCS_SPEAKER, { ...consents, f_present: 'Yes, poster', f_abstract: 'HbF induction' }, NOW);
    expect(done.ok).toBe(true);
  });

  it('records what was asked, so a blank optional answer stops reading as a gap', () => {
    const r = applyCompletion(FORM, TSCS_SPEAKER, consents, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers[ASKED_FIELDS_KEY]).toEqual(expect.arrayContaining(['f_diet', 'f_role', 'f_consent_terms']));
    // Answered at original registration — never asked here, so never recorded as asked.
    expect(r.answers[ASKED_FIELDS_KEY]).not.toContain('f_org');
    expect(r.report.declined.map(f => f.id)).toContain('f_diet');
    expect(r.report.outstanding).toEqual([]);
  });

  it('rejects a malformed value instead of storing it', () => {
    expect(applyCompletion(FORM, TSCS_SPEAKER, { ...consents, f_present: 'Keynote' }, NOW))
      .toMatchObject({ ok: false, fieldId: 'f_present' });
  });
});
