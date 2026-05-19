import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../../services/supabaseClient';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassInput } from '../ui/GlassInput';
import { ViscousButton } from '../ui/ViscousButton';

type Mode = 'signup' | 'signin';

export function AuthPanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Resend verification state — shared between the signup-success screen and
  // the "Email not confirmed" signin recovery path.
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [showResendOnSignin, setShowResendOnSignin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSec]);

  const resetResendState = () => {
    setResendMsg(null);
    setCooldownSec(0);
    setShowResendOnSignin(false);
  };

  const handleResend = async () => {
    if (!email || cooldownSec > 0 || resending) return;
    setResending(true); setResendMsg(null);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/#/portal` },
    });
    setResending(false);
    if (err) {
      const secMatch = err.message.match(/(\d+)\s*second/i);
      if (secMatch) {
        setCooldownSec(Number(secMatch[1]));
        setResendMsg({ kind: 'error', text: `Please wait ${secMatch[1]}s before requesting another email.` });
      } else if (/rate limit|too many/i.test(err.message)) {
        setResendMsg({ kind: 'error', text: 'Hourly email limit reached. Please try again in an hour.' });
      } else {
        setResendMsg({ kind: 'error', text: err.message });
      }
    } else {
      setCooldownSec(60);
      setResendMsg({ kind: 'success', text: 'Verification email sent. Please check your inbox (and spam folder).' });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    resetResendState();
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: `${firstName} ${lastName}`.trim(), role: 'attendee' },
        // Supabase's verification link redirects here after token confirmation.
        // Without this, Supabase uses the project's default Site URL which may
        // not be set or may not match the current deployment (landing vs portal).
        emailRedirectTo: `${window.location.origin}/#/portal`,
      },
    });
    setLoading(false);
    if (err) {
      // Some Supabase server versions return the "user already exists" condition
      // as a real error. Normalize it to the friendly message we use below.
      if (/already|exists|registered/i.test(err.message) || (err as { code?: string }).code === 'user_already_exists') {
        setError('A user with that email already exists. Please sign in instead.');
      } else {
        setError(err.message);
      }
      return;
    }
    // When "Confirm email" is enabled in Supabase Auth (the default), an
    // already-registered email returns success WITH an empty `identities`
    // array to prevent email enumeration. We detect that and surface a
    // friendly "already exists" message instead of silently showing
    // "Check your email" — otherwise the user waits forever for an email
    // that was never sent.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('A user with that email already exists. Please sign in instead.');
      return;
    }
    setSignupSuccess(true);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    setShowResendOnSignin(false);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      // Supabase's canonical code is the truth; regex is a backstop for older
      // server versions. Tightened to avoid matching unrelated "verification"
      // phrases that could surface in other auth errors.
      const code = (err as { code?: string }).code;
      const unverified = code === 'email_not_confirmed'
        || /email not confirmed/i.test(err.message);
      if (unverified) {
        setShowResendOnSignin(true);
        setError('Your email isn\u2019t verified yet. Check your inbox for the link, or resend it below.');
      } else {
        setError(err.message);
      }
      return;
    }

    const user = data.user;
    if (!user) { setLoading(false); navigate('/portal'); return; }

    // Check if the user has any existing attendee rows
    const { count } = await supabase
      .from('attendees')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${user.id},email.eq.${user.email}`);

    setLoading(false);
    if (!count || count === 0) {
      // First-time user — take them straight to the Congress registration form
      navigate('/form/gansid-congress-2026');
    } else {
      navigate('/portal');
    }
  };

  const resendLabel = resending
    ? 'Sending\u2026'
    : cooldownSec > 0
      ? `Resend in ${cooldownSec}s`
      : 'Resend verification email';

  return (
    <div className="w-full max-w-lg lg:sticky lg:top-8 rounded-gansid-lg px-4 py-7 sm:px-6 sm:py-8 md:p-10 shadow-2xl gradient-border relative">
      <p className="font-body text-sm text-gansid-on-surface/70 text-center mb-3">
        Create an account to access the Congress registration form, or sign in if you already have one.
      </p>
      <div className="mb-7">
        <FloatingToggleTabs<Mode>
          tabs={[{ id: 'signup', label: 'Create Account' }, { id: 'signin', label: 'Sign In' }]}
          active={mode}
          onChange={(id) => { setMode(id); setError(''); setSignupSuccess(false); resetResendState(); setShowPassword(false); }}
          fullWidth
        />
      </div>

      {signupSuccess ? (
        <div className="space-y-4 text-center">
          <h3 className="font-display text-2xl">Check your email</h3>
          <p className="font-body text-gansid-on-surface/70">
            We've sent a verification link to <strong>{email}</strong>. Click it to complete your registration.
          </p>
          <p className="font-body text-sm text-gansid-on-surface/50">
            Didn't get it? Check your spam folder or resend below.
          </p>
          <ViscousButton
            type="button"
            variant="primary"
            className="w-full"
            disabled={resending || cooldownSec > 0}
            onClick={handleResend}
          >
            {resendLabel}
          </ViscousButton>
          {resendMsg && (
            <p className={`text-sm font-body ${resendMsg.kind === 'success' ? 'text-gansid-secondary' : 'text-gansid-primary'}`}>
              {resendMsg.text}
            </p>
          )}
        </div>
      ) : mode === 'signup' ? (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <GlassInput placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            <GlassInput placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="relative">
            <GlassInput
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (min 8 chars)"
              value={password}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-12"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gansid-on-surface/60 hover:text-gansid-on-surface transition"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gansid-on-surface/60 font-body text-center">
            Sponsor or exhibitor? <a href="#/sponsor-exhibitor" className="text-gansid-secondary font-semibold hover:underline">Register here</a> instead.
          </p>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full text-base sm:text-lg py-4" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account & Register'}
          </ViscousButton>
        </form>
      ) : (
        <form onSubmit={handleSignin} className="space-y-4">
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="relative">
            <GlassInput
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-12"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gansid-on-surface/60 hover:text-gansid-on-surface transition"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={async () => {
                if (!email) { setError('Enter your email first'); return; }
                const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/#/reset-password`,
                });
                if (err) setError(err.message); else setError('Password reset email sent.');
              }}
              className="text-sm text-gansid-secondary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          {showResendOnSignin && (
            <>
              <ViscousButton
                type="button"
                variant="primary"
                className="w-full"
                disabled={resending || cooldownSec > 0 || !email}
                onClick={handleResend}
              >
                {resendLabel}
              </ViscousButton>
              {resendMsg && (
                <p className={`text-sm font-body ${resendMsg.kind === 'success' ? 'text-gansid-secondary' : 'text-gansid-primary'}`}>
                  {resendMsg.text}
                </p>
              )}
            </>
          )}
          <ViscousButton type="submit" variant="primary" className="w-full text-xl py-4" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </ViscousButton>
        </form>
      )}
    </div>
  );
}
