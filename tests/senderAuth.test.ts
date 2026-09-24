import { describe, it, expect } from 'vitest';
import {
  authorizeCallerContentSend,
  bearerToken,
  constantTimeEqual,
  CALLER_CONTENT_MODES,
} from '../supabase/functions/_shared/senderAuth';

const SERVICE = 'service-role-key-value';
const roles: Record<string, string> = { 'admin-jwt': 'admin', 'super-jwt': 'super_admin', 'attendee-jwt': 'attendee', 'sponsor-jwt': 'sponsor' };
const lookup = async (jwt: string) => roles[jwt] ?? null;

describe('authorizeCallerContentSend', () => {
  it('refuses a request with no credentials — the open-relay case', async () => {
    expect(await authorizeCallerContentSend(null, SERVICE, lookup)).toBe('denied');
    expect(await authorizeCallerContentSend('', SERVICE, lookup)).toBe('denied');
  });

  it('refuses the public anon key, which ships in every page', async () => {
    expect(await authorizeCallerContentSend('Bearer anon-key-in-the-bundle', SERVICE, lookup)).toBe('denied');
  });

  it('accepts another edge function holding the service-role key', async () => {
    expect(await authorizeCallerContentSend(`Bearer ${SERVICE}`, SERVICE, lookup)).toBe('service');
  });

  it('accepts admins and super admins signed in to the dashboard', async () => {
    expect(await authorizeCallerContentSend('Bearer admin-jwt', SERVICE, lookup)).toBe('admin');
    expect(await authorizeCallerContentSend('Bearer super-jwt', SERVICE, lookup)).toBe('admin');
  });

  it('refuses signed-in attendees and sponsors', async () => {
    expect(await authorizeCallerContentSend('Bearer attendee-jwt', SERVICE, lookup)).toBe('denied');
    expect(await authorizeCallerContentSend('Bearer sponsor-jwt', SERVICE, lookup)).toBe('denied');
  });

  it('refuses when the role lookup fails rather than letting it through', async () => {
    const boom = async () => { throw new Error('auth down'); };
    expect(await authorizeCallerContentSend('Bearer admin-jwt', SERVICE, boom)).toBe('denied');
  });

  it('never treats an empty service key as a match', async () => {
    expect(await authorizeCallerContentSend('Bearer x', '', async () => null)).toBe('denied');
  });
});

describe('helpers', () => {
  it('reads only a well-formed bearer token', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBe('');
    expect(bearerToken('Bearer')).toBe('');
    expect(bearerToken(undefined)).toBe('');
  });

  it('compares keys exactly, whatever their length', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('guards exactly the modes that send caller-written content', () => {
    expect([...CALLER_CONTENT_MODES].sort()).toEqual(['contact-register-invite', 'custom-ticket', 'raw-html']);
  });
});
