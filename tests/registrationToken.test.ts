import { describe, it, expect } from 'vitest';
import {
  signRegistrationToken,
  verifyRegistrationToken,
} from '../supabase/functions/_shared/registrationToken';

const SECRET = 'test-service-role-key-abc123';
const NOW = 1_750_000_000_000;
const TTL = 180 * 24 * 60 * 60 * 1000;

describe('registrationToken', () => {
  it('round-trips a valid token', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(t, SECRET, NOW + 1000);
    expect(r).toEqual({ valid: true, primaryAttendeeId: 'att-1', formId: 'form-9' });
  });

  it('rejects a tampered signature', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const [bodyPart, sig] = t.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const r = await verifyRegistrationToken(`${bodyPart}.${flipped}`, SECRET, NOW);
    expect(r).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects a forged payload (re-signed body)', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const sig = t.split('.')[1];
    const forgedBody = btoa(JSON.stringify({ a: 'att-EVIL', f: 'form-9', iat: NOW, exp: NOW + TTL }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await verifyRegistrationToken(`${forgedBody}.${sig}`, SECRET, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect((r as { valid: false; reason: string }).reason).toBe('bad-signature');
  });

  it('rejects a wrong secret', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(t, 'different-secret', NOW);
    expect(r).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects an expired token', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, 1000);
    const r = await verifyRegistrationToken(t, SECRET, NOW + 2000);
    expect(r).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects malformed input', async () => {
    expect(await verifyRegistrationToken('garbage', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    expect(await verifyRegistrationToken('', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    expect(await verifyRegistrationToken('a.b.c', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
  });
});
