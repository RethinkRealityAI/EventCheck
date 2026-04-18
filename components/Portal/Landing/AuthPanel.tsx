import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'attendee' | 'exhibitor' | 'sponsor'>('attendee');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSignupSuccess(true);
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate('/portal');
  };

  return (
    <div className="w-full max-w-md lg:sticky lg:top-8 bg-white rounded-gansid-lg p-8 shadow-2xl border border-gansid-outline-variant/30 relative overflow-hidden">
      {/* Top accent bar */}
      <div className="absolute top-0 inset-x-0 h-1.5 bg-gansid-primary-gradient" />

      <div className="flex justify-center mb-6">
        <FloatingToggleTabs<Mode>
          tabs={[{ id: 'signup', label: 'Sign Up' }, { id: 'signin', label: 'Sign In' }]}
          active={mode}
          onChange={(id) => { setMode(id); setError(''); setSignupSuccess(false); }}
        />
      </div>

      {signupSuccess ? (
        <div className="space-y-4 text-center">
          <h3 className="font-display text-2xl">Check your email</h3>
          <p className="font-body text-gansid-on-surface/70">
            We've sent a verification link to <strong>{email}</strong>. Click it to complete your registration.
          </p>
        </div>
      ) : mode === 'signup' ? (
        <form onSubmit={handleSignup} className="space-y-4">
          <GlassInput placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <GlassInput type="password" placeholder="Password (min 8 chars)" value={password} minLength={8} onChange={(e) => setPassword(e.target.value)} required />
          <div>
            <label className="block text-sm font-display mb-2">I am a…</label>
            <div className="flex gap-2">
              {(['attendee', 'exhibitor', 'sponsor'] as const).map((r) => (
                <label key={r} className="flex-1">
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only peer" />
                  <span className="block text-center px-3 py-2 rounded-full bg-gansid-surface-container-low cursor-pointer peer-checked:bg-gansid-primary-gradient peer-checked:text-white font-display text-sm capitalize transition-all">
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create Account'}
          </ViscousButton>
        </form>
      ) : (
        <form onSubmit={handleSignin} className="space-y-4">
          <GlassInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <GlassInput type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </ViscousButton>
        </form>
      )}
    </div>
  );
}
