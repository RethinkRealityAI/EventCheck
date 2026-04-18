import { supabase } from './supabaseClient';
import type { Announcement } from '../types';

export function mapAnnouncementFromDb(row: any): Announcement {
  return {
    id: row.id,
    site: row.site,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    isActive: row.is_active,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAnnouncements(site: 'scago' | 'gansid'): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('site', site)
    .order('published_at', { ascending: false });
  if (error) { console.error('listAnnouncements', error); return []; }
  return (data ?? []).map(mapAnnouncementFromDb);
}

export async function listActiveAnnouncements(site: 'scago' | 'gansid', limit = 3): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('site', site)
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('listActiveAnnouncements', error); return []; }
  return (data ?? []).map(mapAnnouncementFromDb);
}

export async function createAnnouncement(
  site: 'scago' | 'gansid',
  data: { title: string; body: string | null; imageUrl: string | null; isActive: boolean },
): Promise<Announcement | null> {
  const { data: row, error } = await supabase
    .from('announcements')
    .insert({
      site, title: data.title, body: data.body, image_url: data.imageUrl, is_active: data.isActive,
    })
    .select('*').maybeSingle();
  if (error) { console.error('createAnnouncement', error); return null; }
  return row ? mapAnnouncementFromDb(row) : null;
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Omit<Announcement, 'id' | 'site' | 'createdAt' | 'updatedAt'>>,
): Promise<Announcement | null> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if ('title' in patch) dbPatch.title = patch.title;
  if ('body' in patch) dbPatch.body = patch.body;
  if ('imageUrl' in patch) dbPatch.image_url = patch.imageUrl;
  if ('isActive' in patch) dbPatch.is_active = patch.isActive;
  if ('publishedAt' in patch) dbPatch.published_at = patch.publishedAt;
  const { data, error } = await supabase
    .from('announcements').update(dbPatch).eq('id', id).select('*').maybeSingle();
  if (error) { console.error('updateAnnouncement', error); return null; }
  return data ? mapAnnouncementFromDb(data) : null;
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) console.error('deleteAnnouncement', error);
  return !error;
}

export async function uploadAnnouncementImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `announcements/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('portal-assets').upload(path, file);
  if (error) { console.error('uploadAnnouncementImage', error); return null; }
  const { data } = supabase.storage.from('portal-assets').getPublicUrl(path);
  return data.publicUrl;
}
