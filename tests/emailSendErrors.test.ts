import { describe, it, expect } from 'vitest';
import {
  classifyEmailFailure,
  extractInvokeError,
  shouldAbortBulkSend,
} from '../utils/emailSendErrors';

describe('extractInvokeError', () => {
  const GENERIC = 'Edge Function returned a non-2xx status code';

  it('digs the real reason out of a supabase-js FunctionsHttpError', async () => {
    // This is the exact shape that hid the outage: .message is the generic
    // string, the useful body is on .context and must be awaited.
    const err = {
      message: GENERIC,
      context: { json: async () => ({ error: 'Message failed: 550 You have reached your daily email sending quota.' }) },
    };
    expect(await extractInvokeError(err)).toContain('daily email sending quota');
  });

  it('falls back to text() when the body is not JSON', async () => {
    const err = {
      message: GENERIC,
      context: { json: async () => { throw new Error('not json'); }, text: async () => 'upstream exploded' },
    };
    expect(await extractInvokeError(err)).toBe('upstream exploded');
  });

  it('returns the generic string when there is genuinely nothing else', async () => {
    expect(await extractInvokeError({ message: GENERIC })).toBe(GENERIC);
    expect(await extractInvokeError(null)).toBe(GENERIC);
  });

  it('prefers a specific message over the generic one', async () => {
    expect(await extractInvokeError({ message: 'SMTP credentials are not configured in Settings.' }))
      .toBe('SMTP credentials are not configured in Settings.');
  });
});

describe('classifyEmailFailure', () => {
  it('recognises the exact error that broke reminder sends', () => {
    const f = classifyEmailFailure('Message failed: 550 You have reached your daily email sending quota.');
    expect(f.kind).toBe('quota');
    // The admin must learn three things: it is a provider limit, their data is
    // safe, and nothing more will send until it resets.
    expect(f.message).toMatch(/limit/i);
    expect(f.message).toMatch(/no registration data was affected/i);
    expect(f.raw).toContain('550');
  });

  it('recognises quota wording from other providers', () => {
    for (const raw of [
      'Daily sending quota exceeded',
      '429 Too many requests - rate limit reached',
      '452 4.7.0 Too many emails sent',
    ]) {
      expect(classifyEmailFailure(raw).kind, raw).toBe('quota');
    }
  });

  it('separates credentials from quota — they need different fixes', () => {
    expect(classifyEmailFailure('535 5.7.8 Authentication failed').kind).toBe('auth');
    expect(classifyEmailFailure('Invalid login: 535 incorrect username and password').kind).toBe('auth');
  });

  it('flags transient connection problems as retryable', () => {
    expect(classifyEmailFailure('connect ETIMEDOUT 1.2.3.4:587').kind).toBe('connection');
    expect(classifyEmailFailure('getaddrinfo ENOTFOUND smtp.example.com').kind).toBe('connection');
    expect(classifyEmailFailure('connect ETIMEDOUT 1.2.3.4:587').message).toMatch(/try again/i);
  });

  it('points a bad address at the record, not the provider', () => {
    expect(classifyEmailFailure('550 5.1.1 recipient address rejected: user unknown').kind).toBe('recipient');
    expect(classifyEmailFailure('550 5.1.1 recipient address rejected: user unknown').message).toMatch(/typo/i);
  });

  it('never returns an empty message', () => {
    expect(classifyEmailFailure('').message.length).toBeGreaterThan(0);
    expect(classifyEmailFailure(undefined as any).message.length).toBeGreaterThan(0);
  });

  it('passes an unrecognised provider error through verbatim rather than inventing one', () => {
    const f = classifyEmailFailure('554 5.7.1 Service unavailable; policy reasons');
    expect(f.kind).toBe('unknown');
    expect(f.message).toContain('554 5.7.1');
  });
});

describe('shouldAbortBulkSend', () => {
  it('stops a bulk run on quota, auth and misconfiguration', () => {
    // Continuing past a quota rejection burns time on 70+ recipients that will
    // all fail identically — and on a metered plan deepens the overage.
    expect(shouldAbortBulkSend('quota')).toBe(true);
    expect(shouldAbortBulkSend('auth')).toBe(true);
    expect(shouldAbortBulkSend('not-configured')).toBe(true);
  });

  it('keeps going for per-recipient and transient failures', () => {
    expect(shouldAbortBulkSend('recipient')).toBe(false);
    expect(shouldAbortBulkSend('connection')).toBe(false);
    expect(shouldAbortBulkSend('unknown')).toBe(false);
  });
});
