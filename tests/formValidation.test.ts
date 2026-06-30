import { describe, it, expect } from 'vitest';
import { isValidEmail, validateRequiredAnswers } from '../utils/formValidation';

describe('isValidEmail', () => {
  it('accepts a normal address (and trims)', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  dapo@x.co  ')).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a b@c.co')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateRequiredAnswers', () => {
  const fields = [
    { id: 'x', required: true },
    { id: 'y', required: false },
    { id: 'consent', required: true },
  ];
  it('flags a missing required string and an unchecked required consent', () => {
    expect(validateRequiredAnswers(fields, { y: 'v', consent: false })).toEqual(['x', 'consent']);
  });
  it('passes when all required fields are present', () => {
    expect(validateRequiredAnswers(fields, { x: 'v', consent: true })).toEqual([]);
  });
  it('treats whitespace-only strings and empty arrays as missing', () => {
    expect(validateRequiredAnswers([{ id: 'a', required: true }], { a: '   ' })).toEqual(['a']);
    expect(validateRequiredAnswers([{ id: 'a', required: true }], { a: [] })).toEqual(['a']);
  });
});
