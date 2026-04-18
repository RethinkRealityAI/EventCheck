import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { updateProfile, uploadAvatar } from '../../../services/profileService';
import { COUNTRIES } from '../../../utils/countries';
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
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">
          <span className="text-gansid-secondary">My</span>{' '}
          <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">Profile</span>
        </h1>
        <p className="font-body text-gansid-on-surface/60">Update your details and photo.</p>
      </div>

      {/* Card 1: Profile Photo */}
      <section className="bg-white rounded-gansid-lg p-8 shadow-2xl shadow-gansid-secondary/10 gradient-border">
        <h2 className="font-display text-xl font-semibold mb-6">Profile Photo</h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-28 w-28 rounded-full object-cover ring-4 ring-white shadow-xl" />
            ) : (
              <div className="h-28 w-28 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-3xl shadow-xl ring-4 ring-white">
                {(profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <label className="inline-block cursor-pointer px-5 py-2.5 rounded-full bg-gansid-primary-gradient hover:scale-[1.02] transition-all font-display text-sm font-semibold text-white shadow-lg">
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
      </section>

      {/* Card 2: Personal Details */}
      <section className="bg-white rounded-gansid-lg p-8 shadow-2xl shadow-gansid-secondary/10 gradient-border">
        <h2 className="font-display text-xl font-semibold mb-6">Personal Details</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-display font-semibold mb-1.5">Full Name</label>
            <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display font-semibold mb-1.5">Email</label>
            <GlassInput value={profile.email} disabled />
          </div>
          <div>
            <label className="block text-sm font-display font-semibold mb-1.5">Organization</label>
            <GlassInput value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-display font-semibold mb-1.5">Country</label>
            <GlassSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="">Select a country</option>
              {COUNTRIES.map((c: any) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </GlassSelect>
          </div>
          <div>
            <label className="block text-sm font-display font-semibold mb-1.5">Phone</label>
            <GlassInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="pt-2">
            <label className="block text-sm font-display font-semibold mb-1.5">Role</label>
            <div className="inline-block px-4 py-2 rounded-full bg-gansid-surface-container-low text-gansid-secondary font-display font-semibold text-sm capitalize">
              {profile.role}
            </div>
            <p className="text-xs text-gansid-on-surface/50 mt-2">Contact support to change your role.</p>
          </div>
          {toast && <p className="text-sm text-gansid-secondary font-semibold">{toast}</p>}
          <div className="pt-4">
            <ViscousButton type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving\u2026' : 'Save Profile'}
            </ViscousButton>
          </div>
        </form>
      </section>
    </div>
  );
}
