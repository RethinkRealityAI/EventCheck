import { describe, it, expect } from 'vitest';
import { COUNTRIES, getCountryByCode, getCountryName } from '../utils/countries';

describe('countries list', () => {
  it('contains at least 190 entries', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(190);
  });

  it('each entry has 2-letter ISO code and name', () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('getCountryByCode returns the entry', () => {
    expect(getCountryByCode('IN')?.name).toBe('India');
    expect(getCountryByCode('US')?.name).toBe('United States');
    expect(getCountryByCode('ZZ')).toBeUndefined();
  });

  it('getCountryName returns the name or the code as fallback', () => {
    expect(getCountryName('IN')).toBe('India');
    expect(getCountryName('ZZ')).toBe('ZZ');
  });
});
