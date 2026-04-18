import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { updateProfile, uploadAvatar } from '../../../services/profileService';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setOrganization(profile.organization ?? '');
    setCountryCode(profile.countryCode ?? '');
    setPhone(profile.phone ?? '');
    setAvatarUrl(profile.avatarUrl ?? null);
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
          <div className="flex items-center gap-5 pb-2">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-lg"
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-3xl shadow-lg ring-4 ring-white">
                  {(profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <label className="inline-block cursor-pointer px-4 py-2 rounded-full bg-gansid-surface-container-low hover:bg-gansid-surface-container-lowest font-display text-sm font-semibold text-gansid-secondary transition">
                {uploadingAvatar ? 'Uploading\u2026' : avatarUrl ? 'Change photo' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingAvatar(true);
                    const url = await uploadAvatar(user.id, file);
                    if (url) {
                      setAvatarUrl(url);
                      await updateProfile(user.id, { avatarUrl: url });
                      await refreshProfile();
                    }
                    setUploadingAvatar(false);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-xs text-gansid-on-surface/50 mt-2">JPG, PNG, or GIF &middot; max ~2MB</p>
            </div>
          </div>
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
