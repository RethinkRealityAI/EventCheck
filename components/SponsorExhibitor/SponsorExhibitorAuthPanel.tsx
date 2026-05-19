import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { FloatingToggleTabs } from '../Portal/ui/FloatingToggleTabs';
import { GlassInput } from '../Portal/ui/GlassInput';
import { ViscousButton } from '../Portal/ui/ViscousButton';

type Mode = 'signup' | 'signin';
type Role = 'sponsor' | 'exhibitor';

interface Props {
  /**
   * Form ID of the sponsor_exhibitor form for this tenant. Resolved by the parent
   * page from `forms.form_type = 'sponsor_exhibitor'`. After successful sign-up or
   * sign-in, we navigate to `/form/<formId>` so the user lands directly in the
   * combined registration form.
   */
  sponsorExhibitorFormId: string | null;
}

export function SponsorExhibitorAuthPanel({ sponsorExhibitorFormId }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState<Role>('sponsor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

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

  // Where to land after sign-in (the user is already signed in, so we can
  // route them directly to the form).
  const postAuthPath = sponsorExhibitorFormId
    ? `/form/${sponsorExhibitorFormId}`
    : '/portal';

  // Where Supabase's email-confirmation link should land the user. We use the
  // dedicated sponsor/exhibitor landing page (not /#/portal and not
  // /#/form/<id>) so:
  //   1. Users who haven't finished the form-id lookup at signup time still
  //      end up on the right page after confirming their email.
  //   2. SponsorExhibitorLandingPage detects an authenticated user and
  //      auto-redirects them to /#/form/<id> on mount — a single source of
  //      truth for "post-auth, route to the form".
  // Pointing the redirect at /#/portal (the old root AuthPanel default) is
  // what caused the bug where users landed on the attendee Congress
  // registration page after confirming.
  const postAuthRedirect = `${window.location.origin}/#/sponsor-exhibitor`;

  const handleResend = async () => {
    if (!email || cooldownSec > 0 || resending) return;
    setResending(true); setResendMsg(null);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: postAuthRedirect },
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
        data: {
          full_name: `${firstName} ${lastName}`.trim(),
          role,
          organization: orgName.trim() || null,
        },
        emailRedirectTo: postAuthRedirect,
      },
    });
    setLoading(false);
    if (err) {
      if (/already|exists|registered/i.test(err.message) || (err as { code?: string }).code === 'user_already_exists') {
        setError('A user with that email already exists. Please sign in instead.');
      } else {
        setError(err.message);
      }
      return;
    }
    // When email-confirm is enabled, an already-registered email returns
    // success with an empty `identities` array (Supabase's anti-enumeration
    // measure). Detect and surface a friendly message rather than telling
    // the user to check an email that will never arrive.
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
      const code = (err as { code?: string }).code;
      const unverified = code === 'email_not_confirmed'
        || /email not confirmed/i.test(err.message);
      if (unverified) {
        setShowResendOnSignin(true);
        setError('Your email isn’t verified yet. Check your inbox for the link, or resend it below.');
      } else {
        setError(err.message);
      }
      return;
    }

    setLoading(false);
    if (!data.user) { navigate('/portal'); return; }
    // Send the signed-in user straight to the combined sponsor/exhibitor form.
    navigate(postAuthPath);
  };

  const resendLabel = resending
    ? 'Sending…'
    : cooldownSec > 0
      ? `Resend in ${cooldownSec}s`
      : 'Resend verification email';

  return (
    <div className="w-full max-w-lg lg:sticky lg:top-8 rounded-gansid-lg px-4 py-7 sm:px-6 sm:py-8 md:p-10 shadow-2xl gradient-border relative">
      <p className="font-body text-sm text-gansid-on-surface/70 text-center mb-3">
        Create your account to complete your sponsor or exhibitor registration, or sign in if you already have one.
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
            We've sent a verification link to <strong>{email}</strong>. Click it to access the sponsor &amp; exhibitor registration form.
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
          <GlassInput placeholder="Organization / Company name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          <GlassInput type="email" placeholder="Work email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
          <div>
            <label className="block text-base font-display mb-2">I am a…</label>
            <div className="flex gap-2">
              {(['sponsor', 'exhibitor'] as const).map((r) => (
                <label key={r} className="flex-1">
                  <input type="radio" name="se-role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only peer" />
                  <span className="block text-center px-3 py-2.5 rounded-full bg-gansid-surface-container-low cursor-pointer peer-checked:bg-gansid-primary-gradient peer-checked:text-white font-display text-base capitalize transition-all">
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full text-base sm:text-lg py-4" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account & Continue'}
          </ViscousButton>
          <p className="text-xs text-gansid-on-surface/60 font-body text-center">
            Attending as an individual? <a href="#/" className="text-gansid-secondary font-semibold hover:underline">Register here</a> instead.
          </p>
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
