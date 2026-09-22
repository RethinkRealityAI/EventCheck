import { describe, it, expect } from 'vitest';
import {
  signRegistrationToken,
  verifyRegistrationToken,
  signCompleteToken,
  verifyCompleteToken,
  signPayToken,
  verifyPayToken,
  signInviteToken,
  verifyInviteToken,
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

// A completion link fills in someone's outstanding answers. It must never be
// usable as a ticket download, a payment link or an invite — or the reverse.
describe('completion token', () => {
  it('round-trips', async () => {
    const t = await signCompleteToken('att-1', SECRET, NOW, TTL);
    expect(await verifyCompleteToken(t, SECRET, NOW)).toEqual({ valid: true, attendeeId: 'att-1' });
  });

  it('expires', async () => {
    const t = await signCompleteToken('att-1', SECRET, NOW, 1000);
    expect(await verifyCompleteToken(t, SECRET, NOW + 2000)).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a tampered attendee id on signature', async () => {
    const t = await signCompleteToken('att-1', SECRET, NOW, TTL);
    const [body, sig] = t.split('.');
    const forged = btoa(atob(body.replace(/-/g, '+').replace(/_/g, '/')).replace('att-1', 'att-2'))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyCompleteToken(`${forged}.${sig}`, SECRET, NOW)).toMatchObject({ valid: false, reason: 'bad-signature' });
  });

  it('is refused as a pay token, and a pay token is refused as a completion token', async () => {
    const complete = await signCompleteToken('att-1', SECRET, NOW, TTL);
    const pay = await signPayToken('att-1', SECRET, NOW, TTL);
    expect(await verifyPayToken(complete, SECRET, NOW)).toMatchObject({ valid: false, reason: 'wrong-kind' });
    expect(await verifyCompleteToken(pay, SECRET, NOW)).toMatchObject({ valid: false, reason: 'wrong-kind' });
  });

  it('is refused as an invite, and cannot download tickets', async () => {
    const complete = await signCompleteToken('att-1', SECRET, NOW, TTL);
    expect(await verifyInviteToken(complete, SECRET, NOW)).toMatchObject({ valid: false, reason: 'wrong-kind' });
    expect((await verifyRegistrationToken(complete, SECRET, NOW)).valid).toBe(false);
    const invite = await signInviteToken('c-1', 'form', SECRET, NOW, TTL);
    expect(await verifyCompleteToken(invite, SECRET, NOW)).toMatchObject({ valid: false, reason: 'wrong-kind' });
  });

  it('refuses a ticket-download token', async () => {
    const download = await signRegistrationToken('att-1', 'form', SECRET, NOW, TTL);
    expect(await verifyCompleteToken(download, SECRET, NOW)).toMatchObject({ valid: false, reason: 'wrong-kind' });
  });
});
