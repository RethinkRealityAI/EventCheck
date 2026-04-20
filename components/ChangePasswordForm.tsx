// components/ChangePasswordForm.tsx
//
// Shared password-change form. Re-authenticates with the current password
// first (Supabase's updateUser({ password }) does NOT require it, but a
// stolen-session attacker could otherwise rotate the password without ever
// proving they knew the old one).
//
// Embedded inline in the GANSID portal ProfilePage AND used standalone at
// /#/change-password for SCAGO admins (who don't have a portal surface).
// Keeps styling utility-class-based so it works in both contexts.

import { useState } from 'react';
import { Loader2, Check, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';

type Theme = 'portal' | 'admin';

interface Props {
  /** Portal theme rounds corners tighter and uses the portal-root font stack.
   *  Admin theme uses the same utility classes as the rest of /admin pages. */
  theme?: Theme;
  /** Optional callback after a successful password change. */
  onSuccess?: () => void;
}

export function ChangePasswordForm({ theme = 'admin', onSuccess }: Props) {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNext, setShowNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user) {
    return <p className="text-sm text-slate-500">Sign in to change your password.</p>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (next === current) {
      setError('New password must differ from the current password.');
      return;
    }

    setSubmitting(true);

    // Re-authenticate with the current password. This proves the caller
    // actually knows it and isn't just wielding a captured session token.
    // Note: signInWithPassword replaces the current session with a new one
    // for the same user — transparent to the app.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current,
    });
    if (reauthErr) {
      setSubmitting(false);
      setError('Current password is incorrect.');
      return;
    }

    // Apply the new password.
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (updErr) {
      setError(updErr.message || 'Failed to update password.');
      return;
    }

    setSuccess(true);
    setCurrent('');
    setNext('');
    setConfirm('');
    onSuccess?.();
  };

  const inputCls = theme === 'portal'
    ? 'w-full px-3 py-2 rounded-gansid-md bg-white/80 border border-gansid-on-surface/10 focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40'
    : 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const labelCls = theme === 'portal'
    ? 'block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide'
    : 'block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1';

  const buttonCls = theme === 'portal'
    ? 'inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gansid-primary-gradient hover:scale-[1.02] transition-all font-display text-sm font-semibold text-white shadow-lg disabled:opacity-60'
    : 'inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-lg';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={labelCls}>Current password</label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputCls}
          autoComplete="current-password"
          required
        />
      </div>

      <div>
        <label className={labelCls}>New password</label>
        <div className="relative">
          <input
            type={showNext ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={`${inputCls} pr-10`}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="button"
            onClick={() => setShowNext((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            tabIndex={-1}
            aria-label={showNext ? 'Hide password' : 'Show password'}
          >
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className={theme === 'portal' ? 'text-xs text-gansid-on-surface/50 mt-1' : 'text-xs text-slate-500 mt-1'}>
          Minimum 8 characters.
        </p>
      </div>

      <div>
        <label className={labelCls}>Confirm new password</label>
        <input
          type={showNext ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          autoComplete="new-password"
          required
        />
      </div>

      {error && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Password updated. Your next sign-in will use the new password.</span>
        </div>
      )}

      <div className="pt-1">
        <button type="submit" disabled={submitting || !current || !next || !confirm} className={buttonCls}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {submitting ? 'Updating…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
