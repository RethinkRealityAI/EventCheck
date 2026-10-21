import { describe, it, expect } from 'vitest';
import { refFromClaimUrl, resolveStaffRecipient } from '../supabase/functions/_shared/staffRecipient';

const ID = '3f2a9c1e-0b7d-4e5f-9a8b-1c2d3e4f5a6b';

describe('refFromClaimUrl', () => {
  it('reads the staff id from a claim link', () => {
    expect(refFromClaimUrl(`https://gansid.netlify.app/#/form/f-1?ref=${ID}`)).toBe(ID);
    expect(refFromClaimUrl(`https://gansid.netlify.app/#/form/f-1?x=1&ref=${ID}&y=2`)).toBe(ID);
  });

  it('returns empty when there is no ref', () => {
    expect(refFromClaimUrl('https://gansid.netlify.app/#/form/f-1')).toBe('');
    expect(refFromClaimUrl('')).toBe('');
    expect(refFromClaimUrl(undefined)).toBe('');
    expect(refFromClaimUrl('https://x/?preref=abc')).toBe('');
  });

  it('survives a malformed escape', () => {
    expect(refFromClaimUrl('https://x/#/form/f?ref=%E0%A4%A')).toBe('');
  });
});

describe('resolveStaffRecipient', () => {
  it('sends to the row\'s own address', () => {
    expect(resolveStaffRecipient('Staff@Org.com', undefined)).toEqual({ ok: true, to: 'Staff@Org.com' });
  });

  it('accepts a caller `to` that matches, in any case', () => {
    expect(resolveStaffRecipient('staff@org.com', ' STAFF@org.com ')).toEqual({ ok: true, to: 'staff@org.com' });
  });

  it('refuses a caller `to` that is anyone else', () => {
    expect(resolveStaffRecipient('staff@org.com', 'attacker@evil.org')).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('refuses a row with no real address', () => {
    expect(resolveStaffRecipient('', 'attacker@evil.org')).toEqual({ ok: false, reason: 'no-email' });
    expect(resolveStaffRecipient(null, undefined)).toEqual({ ok: false, reason: 'no-email' });
    expect(resolveStaffRecipient('staff-x@placeholder.invalid', undefined)).toEqual({ ok: false, reason: 'no-email' });
  });
});
