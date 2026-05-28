import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getHashAuthSearchParams,
  getAuthCallbackSearchParams,
  stripAuthCallbackParamsFromUrl,
  formatAuthCallbackErrorMessage,
} from '../utils/authHashCallback';

describe('getHashAuthSearchParams', () => {
  it('parses code from hash query', () => {
    const p = getHashAuthSearchParams('#/portal?code=abc123&type=signup');
    expect(p?.get('code')).toBe('abc123');
    expect(p?.get('type')).toBe('signup');
  });

  it('returns null when hash has no query', () => {
    expect(getHashAuthSearchParams('#/portal')).toBeNull();
  });

  it('parses Supabase error redirect without route or question mark', () => {
    const p = getHashAuthSearchParams(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(p?.get('error')).toBe('access_denied');
    expect(p?.get('error_code')).toBe('otp_expired');
  });
});

describe('formatAuthCallbackErrorMessage', () => {
  it('explains otp_expired in plain language', () => {
    expect(formatAuthCallbackErrorMessage('otp_expired', null)).toMatch(/expired|already used/i);
  });
});

describe('getAuthCallbackSearchParams', () => {
  let loc: { pathname: string; search: string; hash: string; origin: string };

  beforeEach(() => {
    loc = { pathname: '/', search: '', hash: '', origin: 'https://gansid.netlify.app' };
    vi.stubGlobal('window', { location: loc });
    vi.stubGlobal('location', loc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers hash over empty search', () => {
    loc.hash = '#/portal?code=from-hash';
    loc.search = '';
    const p = getAuthCallbackSearchParams();
    expect(p?.get('code')).toBe('from-hash');
  });

  it('falls back to search when code is before hash', () => {
    loc.hash = '#/portal';
    loc.search = '?code=from-search';
    const p = getAuthCallbackSearchParams();
    expect(p?.get('code')).toBe('from-search');
  });
});

describe('stripAuthCallbackParamsFromUrl', () => {
  let replaceState: ReturnType<typeof vi.fn>;
  let loc: { pathname: string; search: string; hash: string };

  beforeEach(() => {
    replaceState = vi.fn();
    vi.stubGlobal('history', { state: null, replaceState });
    loc = {
      pathname: '/',
      search: '',
      hash: '#/portal?code=xyz&error_description=ignored',
    };
    vi.stubGlobal('window', { location: loc, history: { state: null, replaceState } });
    vi.stubGlobal('location', loc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes auth params from hash', () => {
    stripAuthCallbackParamsFromUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/portal');
  });

  it('strips bare error hash to root route', () => {
    loc.hash = '#error=access_denied&error_code=otp_expired';
    stripAuthCallbackParamsFromUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/');
  });
});
