import { describe, it, expect } from 'vitest';
import {
  signInviteToken, verifyInviteToken,
  signRegistrationToken, verifyRegistrationToken,
} from '../supabase/functions/_shared/registrationToken';

const SECRET = 'test-secret-xyz';
const NOW = 1_750_000_000_000;
const TTL = 60 * 24 * 60 * 60 * 1000;

describe('inviteToken', () => {
  it('round-trips', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    expect(await verifyInviteToken(t, SECRET, NOW + 1000)).toEqual({ valid: true, contactId: 'contact-1', formId: 'form-9' });
  });
  it('rejects tampered signature', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    const [b, s] = t.split('.');
    const flipped = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(await verifyInviteToken(`${b}.${flipped}`, SECRET, NOW)).toEqual({ valid: false, reason: 'bad-signature' });
  });
  it('rejects wrong secret', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    expect(await verifyInviteToken(t, 'other', NOW)).toEqual({ valid: false, reason: 'bad-signature' });
  });
  it('rejects expired', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, 1000);
    expect(await verifyInviteToken(t, SECRET, NOW + 2000)).toEqual({ valid: false, reason: 'expired' });
  });
  it('rejects malformed', async () => {
    expect(await verifyInviteToken('garbage', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
  });
  it('cannot cross-use a download token as an invite token', async () => {
    const dl = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyInviteToken(dl, SECRET, NOW);
    expect(r.valid).toBe(false);
    expect((r as Extract<typeof r, { valid: false }>).reason).toBe('wrong-kind');
  });
  it('cannot cross-use an invite token as a download token', async () => {
    const inv = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(inv, SECRET, NOW);
    expect(r.valid).toBe(false);
  });
});
