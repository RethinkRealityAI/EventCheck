import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { updateProfile } from '../../../services/profileService';
import { COUNTRIES } from '../../../utils/countries';
import { GlassCard } from '../ui/GlassCard';
import { GlassInput } from '../ui/GlassInput';
import { GlassSelect } from '../ui/GlassSelect';
import { ViscousButton } from '../ui/ViscousButton';

export function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setOrganization(profile.organization ?? '');
    setCountryCode(profile.countryCode ?? '');
    setPhone(profile.phone ?? '');
  }, [profile]);

  if (!profile || !user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile(user.id, { fullName, organization, countryCode, phone });
    await refreshProfile();
    setSaving(false);
    setToast('Profile saved.');
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-6">Profile</h1>
      <GlassCard>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-display mb-1">Full Name</label>
            <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Email</label>
            <GlassInput value={profile.email} disabled />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Organization</label>
            <GlassInput value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Country</label>
            <GlassSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="">Select a country</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </GlassSelect>
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Phone</label>
            <GlassInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display mb-1">Role</label>
            <div className="font-body text-gansid-on-surface/80">{profile.role}</div>
            <p className="text-xs text-gansid-on-surface/50 mt-1">Contact support to change your role.</p>
          </div>
          {toast && <p className="text-sm text-gansid-secondary">{toast}</p>}
          <ViscousButton type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving\u2026' : 'Save Profile'}
          </ViscousButton>
        </form>
      </GlassCard>
    </div>
  );
}
