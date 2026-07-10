import { describe, it, expect } from 'vitest';
import { resolveAttendeeCountryCode } from '../utils/resolveAttendeeCountry';
import type { Form } from '../types';

const countryForm: Form = {
  id: 'form-1',
  title: 'Test Form',
  description: '',
  fields: [
    { id: 'f_name', type: 'text', label: 'Name' },
    { id: 'f_country', type: 'country', label: 'Country' },
  ],
} as any;

describe('resolveAttendeeCountryCode', () => {
  it('prefers the synthetic _guest_country key over any form field', () => {
    const attendee = { answers: { _guest_country: 'IN', f_country: 'US' } };
    expect(resolveAttendeeCountryCode(attendee, countryForm)).toBe('IN');
  });

  it('falls back to the form country-type field answer', () => {
    const attendee = { answers: { f_country: 'CA' } };
    expect(resolveAttendeeCountryCode(attendee, countryForm)).toBe('CA');
  });

  it('returns null when the form has no country field', () => {
    const noCountryForm: Form = { ...countryForm, fields: [{ id: 'f_name', type: 'text', label: 'Name' }] } as any;
    const attendee = { answers: { f_name: 'Alice' } };
    expect(resolveAttendeeCountryCode(attendee, noCountryForm)).toBeNull();
  });

  it('returns null when there are no answers at all', () => {
    expect(resolveAttendeeCountryCode({ answers: undefined }, countryForm)).toBeNull();
  });

  it('returns null when form is undefined and no _guest_country is set', () => {
    expect(resolveAttendeeCountryCode({ answers: { f_country: 'CA' } }, undefined)).toBeNull();
  });

  it('ignores an empty-string _guest_country and falls back to the form field', () => {
    const attendee = { answers: { _guest_country: '', f_country: 'MX' } };
    expect(resolveAttendeeCountryCode(attendee, countryForm)).toBe('MX');
  });
});
