import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, Mail } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { portalEmailRedirectTo } from '../../utils/authHashCallback';
import {
  AccountClaimError,
  resolveAccountClaim,
  submitAccountClaim,
  type ResolvedAccountClaim,
} from '../../services/accountClaim';

// "Create your account" — /#/account?token=…
//
// Opened from a ticket email. The person is ALREADY registered and ticketed;
// this only gives them a portal account that holds that ticket. It matters most
// for a companion registered under the purchaser's email: they cannot sign up
// at that address (it is the purchaser's account), so this page takes their
// own address and moves the ticket there. Same trust model as /tickets and
// /complete: the signed token is the credential. Rules:
// supabase/functions/_shared/accountClaim.ts.

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ResolvedAccountClaim }
  | { kind: 'check-inbox'; data: ResolvedAccountClaim; email: string }
  | { kind: 'existing'; data: ResolvedAccountClaim; email: string };

const MIN_PASSWORD = 8;

export const AccountClaimPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // HashRouter: the query lives in the router's location, never window.location.
  const token = useMemo(() => new URLSearchParams(location.search).get('token') ?? '', [location.search]);

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: 'error', message: 'This link is incomplete. Please use the full link from your email.' });
        return;
      }
      try {
        const data = await resolveAccountClaim(token);
        if (cancelled) return;
        setEmail(data.attendee.email ?? '');
        setState({ kind: 'ready', data });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const data = state.kind === 'error' || state.kind === 'loading' ? null : state.data;
  const ownEmail = (data?.attendee.email ?? '').toLowerCase();
  const movingTicket = !!data && email.trim().toLowerCase() !== ownEmail;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== 'ready') return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setFormError('Please enter your email address.');
    if (password.length < MIN_PASSWORD) return setFormError(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setFormError('The two passwords do not match.');

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await submitAccountClaim(token, cleanEmail, password);
      if (res.next === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: res.email, password });
        if (error) throw new AccountClaimError('Your account was created, but we could not sign you in automatically. Please sign in with your email and new password.');
        navigate('/portal');
        return;
      }
      if (res.next === 'sign-in-existing') {
        setState({ kind: 'existing', data: state.data, email: res.email });
        return;
      }
      // sign-up: a normal sign-up at an address nobody has proven yet.
      const { data: su, error } = await supabase.auth.signUp({
        email: res.email,
        password,
        options: {
          data: { full_name: state.data.attendee.name ?? '', role: 'attendee' },
          emailRedirectTo: portalEmailRedirectTo(),
        },
      });
      if (error) throw new AccountClaimError(error.message);
      if (su.session) {
        navigate('/portal');
        return;
      }
      setState({ kind: 'check-inbox', data: state.data, email: res.email });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gansid-primary/30';

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4 py-8">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gansid-primary-gradient px-6 py-5">
          <h1 className="text-white font-semibold text-lg">{data?.eventName ?? 'Create your account'}</h1>
          <p className="text-white/85 text-sm mt-0.5">Create your account</p>
        </div>

        <div className="p-6">
          {state.kind === 'loading' && (
            <div className="py-10 text-center text-gray-500" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin inline" />
              <span className="sr-only">Loading your ticket…</span>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700">{state.message}</p>
            </div>
          )}

          {state.kind === 'ready' && state.data.state === 'linked' && (
            <div className="py-6 text-center" role="status">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-800">You already have an account, {state.data.attendee.firstName}.</p>
              <p className="text-sm text-gray-600 mt-2">
                Your ticket is already in it. Sign in with <strong>{state.data.attendee.email}</strong> to see it.
              </p>
              <a href="#/portal" className="inline-block mt-5 px-5 py-2.5 rounded-full bg-gansid-primary text-white text-sm font-semibold hover:opacity-90">
                Sign in
              </a>
            </div>
          )}

          {state.kind === 'ready' && state.data.state === 'unavailable' && (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700">
                This ticket is not ready for an account yet. Please contact the congress team.
              </p>
            </div>
          )}

          {state.kind === 'ready' && state.data.state === 'open' && (
            <form onSubmit={onSubmit} noValidate>
              <p className="text-sm text-gray-700">
                Hello {state.data.attendee.firstName}, you're registered for <strong>{state.data.eventName}</strong>.
              </p>
              {state.data.attendee.ticketType && (
                <p className="text-xs text-gray-500 mt-1">Ticket: {state.data.attendee.ticketType}</p>
              )}
              <p className="text-sm text-gray-700 mt-2">
                Create your free account to keep your ticket on your phone and get congress updates. It's optional,
                but we encourage everyone attending to have one.
              </p>

              {state.data.sharedEmail && (
                <p className="mt-4 text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {state.data.purchaserName ? <><strong>{state.data.purchaserName}</strong> booked</> : 'This ticket was booked'} your
                  ticket using their email address. Enter <strong>your own</strong> email below — your ticket will be
                  moved to it and linked to your new account.
                </p>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="acct-email" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Your email <span className="text-red-600">*</span>
                  </label>
                  <input id="acct-email" type="email" autoComplete="email" required value={email}
                    onChange={e => { setEmail(e.target.value); setFormError(null); }} className={inputClass} />
                  {movingTicket && email.trim() && !state.data.sharedEmail && (
                    <p className="text-xs text-gray-500 mt-1">
                      Your ticket and future congress emails will go to this address instead of {state.data.attendee.email}.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="acct-password" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Choose a password <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input id="acct-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                      required minLength={MIN_PASSWORD} value={password}
                      onChange={e => { setPassword(e.target.value); setFormError(null); }} className={`${inputClass} pr-10`} />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">At least {MIN_PASSWORD} characters.</p>
                </div>
                <div>
                  <label htmlFor="acct-confirm" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Confirm password <span className="text-red-600">*</span>
                  </label>
                  <input id="acct-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                    required value={confirm} onChange={e => { setConfirm(e.target.value); setFormError(null); }} className={inputClass} />
                </div>
              </div>

              {formError && (
                <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
                  {formError}
                </p>
              )}

              <button type="submit" disabled={submitting}
                className="mt-6 w-full py-3 rounded-full bg-gansid-primary text-white font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Creating your account…' : 'Create my account'}
              </button>
              <p className="mt-3 text-xs text-gray-500 text-center">
                Your ticket is valid either way — the PDF or QR code from your email works at check-in.
              </p>
            </form>
          )}

          {state.kind === 'check-inbox' && (
            <div className="py-6 text-center" role="status" aria-live="polite">
              <Mail className="h-10 w-10 text-gansid-primary mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-800">Check your inbox</p>
              <p className="text-sm text-gray-600 mt-2">
                We've sent a confirmation link to <strong>{state.email}</strong>. Open it to finish creating your
                account — your ticket is already linked to that address.
              </p>
            </div>
          )}

          {state.kind === 'existing' && (
            <div className="py-6 text-center" role="status" aria-live="polite">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-800">Your ticket is linked to your existing account</p>
              <p className="text-sm text-gray-600 mt-2">
                An account already exists for <strong>{state.email}</strong>, so we've added your ticket to it. Sign in
                with that account's password to see it.
              </p>
              <a href="#/portal" className="inline-block mt-5 px-5 py-2.5 rounded-full bg-gansid-primary text-white text-sm font-semibold hover:opacity-90">
                Sign in
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountClaimPage;
