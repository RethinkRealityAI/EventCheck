import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { GlassCard } from '../ui/GlassCard';
import { GlassInput } from '../ui/GlassInput';
import { ViscousButton } from '../ui/ViscousButton';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="portal-root min-h-screen bg-gansid-surface flex items-center justify-center p-6">
      <GlassCard className="max-w-md w-full">
        <h1 className="font-display text-2xl font-bold mb-4">Set a new password</h1>
        <form onSubmit={submit} className="space-y-4">
          <GlassInput type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
          <GlassInput type="password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
          {error && <p className="text-sm text-gansid-primary">{error}</p>}
          <ViscousButton type="submit" variant="primary" className="w-full" disabled={saving}>
            {saving ? 'Saving\u2026' : 'Update Password'}
          </ViscousButton>
        </form>
      </GlassCard>
    </div>
  );
}
