import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { useAuth } from '../../AuthContext';
import { GlassCard } from '../ui/GlassCard';
import { GlassInput } from '../ui/GlassInput';
import { ViscousButton } from '../ui/ViscousButton';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  // The recovery link is exchanged on app boot (AuthContext → handleSupabaseAuthCallback).
  // A real recovery session must exist here before we let anyone set a password —
  // otherwise updateUser() either fails with "Auth session missing" or, worse, edits
  // whatever account happened to be signed in.
  const { session, loading, authNotice } = useAuth();

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Shown when the recovery link could not establish a session (expired link, or
  // opened in a different browser/device than it was requested from).
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (err) { setError(err.message); return; }
    navigate('/portal');
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) { setResendMsg({ kind: 'error', text: 'Enter your email address.' }); return; }
    setResending(true); setResendMsg(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(resendEmail, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    setResending(false);
    setResendMsg(err
      ? { kind: 'error', text: err.message }
      : { kind: 'success', text: 'If an account exists for that email, a new reset link is on its way. Open it on this device and click through right away.' });
  };

  // Boot callback is still exchanging the recovery token.
  if (loading) {
    return (
      <div className="portal-root min-h-screen bg-gansid-surface flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full text-center">
          <p className="font-body text-gansid-on-surface/70">Verifying your reset link…</p>
        </GlassCard>
      </div>
    );
  }

  // No recovery session — link was invalid, expired, already used, or opened in a
  // different browser/device than the one that requested it. Offer a fresh link.
  if (!session) {
    return (
      <div className="portal-root min-h-screen bg-gansid-surface flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full">
          <h1 className="font-display text-2xl font-bold mb-3">Reset link can’t be used</h1>
          <p className="font-body text-gansid-on-surface/70 mb-4">
            {authNotice
              || 'This password reset link is invalid, has expired, or was opened in a different browser than the one you requested it from. Request a new link below, then open it on this device.'}
          </p>
          <form onSubmit={handleResend} className="space-y-3">
            <GlassInput
              type="email"
              placeholder="Your email address"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              required
            />
            <ViscousButton type="submit" variant="primary" className="w-full" disabled={resending}>
              {resending ? 'Sending…' : 'Send a new reset link'}
            </ViscousButton>
          </form>
          {resendMsg && (
            <p className={`mt-3 text-sm font-body ${resendMsg.kind === 'success' ? 'text-gansid-secondary' : 'text-gansid-primary'}`}>
              {resendMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 text-sm text-gansid-secondary hover:underline"
          >
            Back to sign in
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="portal-root min-h-screen bg-gansid-surface flex items-center justify-center p-6">
      <GlassCard className="max-w-md w-full">
        <h1 className="font-display text-2xl font-bold mb-4">Set a new password</h1>
        <form onSubmit={submit} className="space-y-4">
          <GlassInput type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
          <GlassInput type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Update Password'}
          </ViscousButton>
        </form>
      </GlassCard>
    </div>
  );
}
