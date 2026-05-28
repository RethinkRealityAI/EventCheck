/**
 * Supabase email-confirm / magic-link / password-recovery callbacks on HashRouter.
 *
 * Redirect targets look like:
 *   https://gansid.netlify.app/#/portal?code=...
 *
 * `window.location.search` is empty — params live inside `location.hash`.
 * Supabase's default detectSessionInUrl does not reliably complete the session
 * in this setup, so we exchange the code (or set tokens) explicitly on boot.
 */

import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';

export type AuthCallbackStatus = 'none' | 'success' | 'error';

export type AuthCallbackResult = {
  status: AuthCallbackStatus;
  errorMessage?: string;
};

/**
 * Query params embedded in the hash. Supabase uses two shapes:
 *   - Success: `/#/portal?code=...`
 *   - Failure: `/#error=access_denied&error_code=otp_expired&...` (no `?`, no route)
 */
export function getHashAuthSearchParams(hash?: string): URLSearchParams | null {
  const fragment = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (!fragment || fragment === '#') return null;

  const qIdx = fragment.indexOf('?');
  if (qIdx !== -1) {
    return new URLSearchParams(fragment.slice(qIdx + 1));
  }

  // Failed redirects: `#error=access_denied&error_code=otp_expired&...`
  const bare = fragment.startsWith('#/') ? fragment.slice(2) : fragment.slice(1);
  if (bare.includes('=') && (
    bare.startsWith('error=')
    || bare.includes('error_code=')
    || bare.startsWith('code=')
    || bare.startsWith('access_token=')
    || bare.startsWith('token_hash=')
  )) {
    return new URLSearchParams(bare);
  }

  return null;
}

/** User-facing copy for common Supabase auth callback errors. */
export function formatAuthCallbackErrorMessage(
  errorCode: string | null,
  errorDescription: string | null,
): string {
  const code = (errorCode || '').toLowerCase();
  if (code === 'otp_expired') {
    return 'This verification link has expired or was already used. Sign in and click "Resend verification email", or create your account again with the same email.';
  }
  if (code === 'access_denied') {
    return errorDescription?.replace(/\+/g, ' ')
      || 'Sign-in was cancelled or the link is no longer valid. Try signing in or request a new verification email.';
  }
  return errorDescription?.replace(/\+/g, ' ') || 'Email verification could not be completed. Please try again.';
}

/** Hash query first, then rare `?code=` before the `#` (misconfigured Site URL). */
export function getAuthCallbackSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  const hashParams = getHashAuthSearchParams();
  if (hashParams && hasAuthCallbackKeys(hashParams)) return hashParams;

  const search = window.location.search;
  if (search.length > 1) {
    const searchParams = new URLSearchParams(search.slice(1));
    if (hasAuthCallbackKeys(searchParams)) return searchParams;
  }
  return null;
}

function hasAuthCallbackKeys(params: URLSearchParams): boolean {
  return params.has('code')
    || params.has('access_token')
    || params.has('token_hash')
    || params.has('error');
}

/** Remove auth query params from the hash (and search) after a successful exchange. */
export function stripAuthCallbackParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  let nextHash: string;
  if (qIdx !== -1) {
    nextHash = hash.slice(0, qIdx);
  } else if (getHashAuthSearchParams(hash)) {
    // Bare `#error=…` / `#code=…` — strip to root so HashRouter lands on `/`.
    nextHash = '#/';
  } else {
    nextHash = hash;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(window.history.state, '', nextUrl);

  if (window.location.search) {
    const sp = new URLSearchParams(window.location.search.slice(1));
    const authKeys = ['code', 'access_token', 'refresh_token', 'token_hash', 'type', 'error', 'error_description'];
    let touched = false;
    for (const k of authKeys) {
      if (sp.has(k)) { sp.delete(k); touched = true; }
    }
    if (touched) {
      const qs = sp.toString();
      const cleaned = `${window.location.pathname}${qs ? `?${qs}` : ''}${nextHash}`;
      window.history.replaceState(window.history.state, '', cleaned);
    }
  }
}

/**
 * Complete an auth redirect if the current URL carries Supabase callback params.
 * Safe to call on every app boot — no-ops when nothing to process.
 */
export async function handleSupabaseAuthCallback(
  supabase: SupabaseClient,
): Promise<AuthCallbackResult> {
  const params = getAuthCallbackSearchParams();
  if (!params) return { status: 'none' };

  const oauthError = params.get('error');
  if (oauthError) {
    const msg = formatAuthCallbackErrorMessage(
      params.get('error_code'),
      params.get('error_description') ?? oauthError,
    );
    stripAuthCallbackParamsFromUrl();
    return { status: 'error', errorMessage: msg };
  }

  const code = params.get('code');
  if (code) {
    // Avoid keeping a prior session (e.g. admin in same browser) when the
    // confirm link is for a newly created attendee account.
    await supabase.auth.signOut();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { status: 'error', errorMessage: error.message };
    }
    stripAuthCallbackParamsFromUrl();
    return { status: 'success' };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      return { status: 'error', errorMessage: error.message };
    }
    stripAuthCallbackParamsFromUrl();
    return { status: 'success' };
  }

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      return { status: 'error', errorMessage: error.message };
    }
    stripAuthCallbackParamsFromUrl();
    return { status: 'success' };
  }

  return { status: 'none' };
}

/** Default redirect for signup / resend verification emails (GANSID portal). */
export function portalEmailRedirectTo(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/portal`;
}
