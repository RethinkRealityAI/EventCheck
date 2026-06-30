import { describe, it, expect } from 'vitest';
import { normalizeContactInput, isDuplicateEmail } from '../services/importedContactsService';

describe('normalizeContactInput', () => {
  it('trims name, lowercases/trims email, and defaults arrays', () => {
    expect(normalizeContactInput({ name: ' Dapo ', email: '  DAPO@X.CO ' }))
      .toEqual({ name: 'Dapo', email: 'dapo@x.co', tags: [], extraFields: {} });
  });
  it('keeps provided tags + extraFields', () => {
    const out = normalizeContactInput({ name: 'A', email: 'a@b.co', tags: ['VIP'], extraFields: { org: 'X' } });
    expect(out.tags).toEqual(['VIP']);
    expect(out.extraFields).toEqual({ org: 'X' });
  });
});

describe('isDuplicateEmail', () => {
  it('matches case-insensitively and trims', () => {
    expect(isDuplicateEmail('dapo@x.co', [{ email: 'DAPO@X.CO' }])).toBe(true);
    expect(isDuplicateEmail('  dapo@x.co ', [{ email: 'dapo@x.co' }])).toBe(true);
    expect(isDuplicateEmail('new@x.co', [{ email: 'DAPO@X.CO' }])).toBe(false);
  });
  it('handles an empty list', () => {
    expect(isDuplicateEmail('a@b.co', [])).toBe(false);
  });
});
