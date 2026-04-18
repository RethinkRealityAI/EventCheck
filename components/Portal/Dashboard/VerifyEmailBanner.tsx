import { useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../../services/supabaseClient';

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.email_confirmed_at) return null;

  const resend = async () => {
    if (!user.email) return;
    setSending(true);
    await supabase.auth.resend({ type: 'signup', email: user.email });
    setSending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="mb-6 rounded-gansid-lg bg-gansid-primary-container/10 px-6 py-4 flex items-center justify-between gap-4">
      <p className="font-body text-sm text-gansid-on-surface">
        <strong>Verify your email.</strong> Registration requires a verified account. Check your inbox for the verification link.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={sending || resent}
        className="shrink-0 text-sm font-display font-semibold text-gansid-primary hover:underline disabled:opacity-50"
      >
        {resent ? 'Sent!' : sending ? 'Sending\u2026' : 'Resend'}
      </button>
    </div>
  );
}
