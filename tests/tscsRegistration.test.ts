import { describe, expect, it } from 'vitest';
import { isTscsRegistration, tscsRefOf } from '../utils/tscsRegistration';

describe('isTscsRegistration', () => {
  it('recognises the email feed and the hand-registered lists', () => {
    expect(isTscsRegistration({ answers: { tscs_source: 'email-poll (table)' } })).toBe(true);
    expect(isTscsRegistration({ answers: { tscs_ref: 'REG-00141' } })).toBe(true);
    expect(isTscsRegistration({ answers: { tscs_payment_id: 'pay_X' } })).toBe(true);
  });

  it('leaves out DMHOs, test rows and everyone else', () => {
    expect(isTscsRegistration({ answers: { tscs_source: 'x' }, attendeeCategory: 'dmho' })).toBe(false);
    expect(isTscsRegistration({ answers: { tscs_source: 'x' }, isTest: true })).toBe(false);
    expect(isTscsRegistration({ answers: { f_org: 'TSCS' } })).toBe(false);
    expect(isTscsRegistration({ answers: { tscs_source: '  ' } })).toBe(false);
    expect(isTscsRegistration({ answers: null })).toBe(false);
  });
});

describe('tscsRefOf', () => {
  it('returns the booking reference or empty', () => {
    expect(tscsRefOf({ answers: { tscs_ref: ' REG-00126 ' } })).toBe('REG-00126');
    expect(tscsRefOf({ answers: {} })).toBe('');
  });
});
