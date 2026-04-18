import { supabase } from './supabaseClient';
import type { Profile } from '../types';

export function mapProfileFromDb(row: any): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organization: row.organization,
    countryCode: row.country_code,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.error('fetchProfile', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<Profile | null> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if ('fullName' in patch) dbPatch.full_name = patch.fullName;
  if ('role' in patch) dbPatch.role = patch.role;
  if ('organization' in patch) dbPatch.organization = patch.organization;
  if ('countryCode' in patch) dbPatch.country_code = patch.countryCode;
  if ('phone' in patch) dbPatch.phone = patch.phone;
  if ('avatarUrl' in patch) dbPatch.avatar_url = patch.avatarUrl;

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('updateProfile', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `avatars/${userId}.${ext}`;

  // Remove any existing avatar at this path (storage will silently 404 if absent)
  await supabase.storage.from('portal-assets').remove([path]).catch(() => null);

  const { error } = await supabase.storage
    .from('portal-assets')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) { console.error('uploadAvatar', error); return null; }

  const { data } = supabase.storage.from('portal-assets').getPublicUrl(path);
  // Cache-bust so the <img> reloads immediately after overwrite
  return `${data.publicUrl}?v=${Date.now()}`;
}
