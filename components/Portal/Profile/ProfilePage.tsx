import { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { updateProfile, uploadAvatar } from '../../../services/profileService';
import { COUNTRIES } from '../../../utils/countries';
import { GlassInput } from '../ui/GlassInput';
import { GlassSelect } from '../ui/GlassSelect';
import { ViscousButton } from '../ui/ViscousButton';
import { ChangePasswordForm } from '../../ChangePasswordForm';

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

  const attendeeTypeLabel = profile.role === 'exhibitor' ? 'Exhibitor'
    : profile.role === 'sponsor' ? 'Sponsor'
    : profile.role === 'super_admin' ? 'Super Admin'
    : profile.role === 'admin' ? 'Admin'
    : 'Attendee';
  const attendeeTypePillGradient =
    profile.role === 'exhibitor' ? 'bg-[linear-gradient(135deg,#8b2a5e_0%,#5a3575_100%)]'
    : profile.role === 'sponsor' ? 'bg-[linear-gradient(135deg,#2260a1_0%,#1a4880_100%)]'
    : profile.role === 'super_admin' ? 'bg-[linear-gradient(135deg,#78350f_0%,#b45309_100%)]'
    : profile.role === 'admin' ? 'bg-[linear-gradient(135deg,#0f172a_0%,#1a4880_100%)]'
    : 'bg-gansid-primary-gradient';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // updateProfile returns null on error OR when the .update().select() returns
    // no rows (RLS-blocked or row missing). Treat both as failure so we never
    // toast "Profile saved." for a write that didn't persist.
    const result = await updateProfile(user.id, { fullName, organization, countryCode, phone });
    if (!result) {
      setSaving(false);
      setToast('Failed to save profile. Please try again.');
      setTimeout(() => setToast(''), 4000);
      return;
    }
    await refreshProfile();
    setSaving(false);
    setToast('Profile saved.');
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold mb-1">
          <span className="text-gansid-secondary">My</span>{' '}
          <span className="bg-gansid-primary-gradient bg-clip-text text-transparent">Profile</span>
        </h1>
        <p className="font-body text-sm text-gansid-on-surface/60">Update your details and photo.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        {/* Left: Personal Details */}
        <section className="bg-white rounded-gansid-lg p-6 shadow-2xl shadow-gansid-secondary/10 gradient-border">
          <h2 className="font-display text-lg font-semibold mb-4">Personal Details</h2>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide">Full Name</label>
              <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide">Email</label>
              <GlassInput value={profile.email} disabled />
            </div>
            <div>
              <label className="block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide">Organization</label>
              <GlassInput value={organization} onChange={(e) => setOrganization(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide">Country</label>
                <GlassSelect value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  <option value="">Select…</option>
                  {COUNTRIES.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </GlassSelect>
              </div>
              <div>
                <label className="block text-xs font-display font-semibold mb-1 text-gansid-on-surface/70 uppercase tracking-wide">Phone</label>
                <GlassInput value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3">
              {toast && <p className="text-sm text-gansid-secondary font-semibold">{toast}</p>}
              <div className="ml-auto">
                <ViscousButton type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Saving\u2026' : 'Save Profile'}
                </ViscousButton>
              </div>
            </div>
          </form>
        </section>

        {/* Right: Profile Photo + attendee pill */}
        <section className="bg-white rounded-gansid-lg p-6 shadow-2xl shadow-gansid-secondary/10 gradient-border flex flex-col items-center text-center">
          <span className={`${attendeeTypePillGradient} text-white font-display text-[11px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-lg mb-6`}>
            {attendeeTypeLabel}
          </span>
          <div className="relative mb-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-32 w-32 rounded-full object-cover ring-4 ring-white shadow-xl" />
            ) : (
              <div className="h-32 w-32 rounded-full bg-gansid-primary-gradient flex items-center justify-center text-white font-display text-3xl shadow-xl ring-4 ring-white">
                {(profile.fullName ?? profile.email).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <label className="inline-block cursor-pointer px-5 py-2 rounded-full bg-gansid-primary-gradient hover:scale-[1.02] transition-all font-display text-sm font-semibold text-white shadow-lg">
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
          <p className="text-xs text-gansid-on-surface/40 mt-4">Role changes require support.</p>
        </section>
      </div>

      {/* Change Password */}
      <section className="bg-white rounded-gansid-lg p-6 shadow-2xl shadow-gansid-secondary/10 gradient-border mt-6 max-w-2xl">
        <h2 className="font-display text-lg font-semibold mb-1">Change Password</h2>
        <p className="font-body text-sm text-gansid-on-surface/60 mb-4">
          Update the password you use to sign in. You&apos;ll be asked to enter your current password first.
        </p>
        <ChangePasswordForm theme="portal" />
      </section>
    </div>
  );
}
