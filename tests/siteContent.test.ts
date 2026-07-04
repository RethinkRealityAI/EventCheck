import { describe, it, expect } from 'vitest';
import { mergeContent } from '../services/siteContentService';

describe('mergeContent', () => {
  it('returns defaults when override is empty', () => {
    const defaults = { hero: { badge: 'A' }, includes: ['x'] };
    expect(mergeContent(defaults, {})).toEqual(defaults);
  });
  it('overrides scalar fields but keeps unspecified defaults', () => {
    const defaults = { hero: { badge: 'A', dates: 'D' } };
    const out = mergeContent(defaults, { hero: { badge: 'B' } });
    expect(out.hero.badge).toBe('B');
    expect(out.hero.dates).toBe('D');
  });
  it('replaces arrays wholesale when provided', () => {
    const defaults = { includes: ['a', 'b'] };
    expect(mergeContent(defaults, { includes: ['c'] }).includes).toEqual(['c']);
  });
  it('ignores null/undefined override values (falls back to default)', () => {
    const defaults = { hero: { badge: 'A' } };
    expect(mergeContent(defaults, { hero: { badge: null } }).hero.badge).toBe('A');
  });
});
