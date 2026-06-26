import { describe, it, expect } from 'vitest';
import { contactMatchesTags } from '../services/importedContactsService';

describe('contactMatchesTags', () => {
  const c = (tags: string[]) => ({ tags } as any);
  it('matches when no filter tags', () => {
    expect(contactMatchesTags(c(['vip']), [])).toBe(true);
  });
  it('matches when contact has ANY selected tag (OR semantics)', () => {
    expect(contactMatchesTags(c(['vip', 'hospital-x']), ['speakers', 'hospital-x'])).toBe(true);
  });
  it('does not match when contact shares none', () => {
    expect(contactMatchesTags(c(['vip']), ['speakers'])).toBe(false);
  });
  it('handles missing tags array', () => {
    expect(contactMatchesTags({} as any, ['vip'])).toBe(false);
  });
});
