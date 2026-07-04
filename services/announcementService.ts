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
    ctaLabel: row.cta_label ?? null,
    ctaUrl: row.cta_url ?? null,
    ctaMode: row.cta_mode ?? 'none',
    accentColor: row.accent_color ?? null,
    style: row.style ?? 'card',
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
  };
}

function isWithinSchedule(a: Announcement, now = new Date()): boolean {
  const t = now.getTime();
  if (a.startsAt) {
    const start = new Date(a.startsAt).getTime();
    if (t < start) return false;
  }
  if (a.endsAt) {
    const end = new Date(a.endsAt).getTime();
    if (t >= end) return false;
  }
  return true;
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
    .limit(limit * 3);
  if (error) { console.error('listActiveAnnouncements', error); return []; }
  return (data ?? [])
    .map(mapAnnouncementFromDb)
    .filter((a) => isWithinSchedule(a))
    .slice(0, limit);
}

type AnnouncementInput = {
  title: string;
  body: string | null;
  imageUrl: string | null;
  isActive: boolean;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaMode?: Announcement['ctaMode'];
  accentColor?: string | null;
  style?: Announcement['style'];
  startsAt?: string | null;
  endsAt?: string | null;
};

export async function createAnnouncement(
  site: 'scago' | 'gansid',
  data: AnnouncementInput,
): Promise<Announcement | null> {
  const { data: row, error } = await supabase
    .from('announcements')
    .insert({
      site,
      title: data.title,
      body: data.body,
      image_url: data.imageUrl,
      is_active: data.isActive,
      cta_label: data.ctaLabel ?? null,
      cta_url: data.ctaUrl ?? null,
      cta_mode: data.ctaMode ?? 'none',
      accent_color: data.accentColor ?? null,
      style: data.style ?? 'card',
      starts_at: data.startsAt ?? null,
      ends_at: data.endsAt ?? null,
    })
    .select('*')
    .maybeSingle();
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
  if ('ctaLabel' in patch) dbPatch.cta_label = patch.ctaLabel;
  if ('ctaUrl' in patch) dbPatch.cta_url = patch.ctaUrl;
  if ('ctaMode' in patch) dbPatch.cta_mode = patch.ctaMode;
  if ('accentColor' in patch) dbPatch.accent_color = patch.accentColor;
  if ('style' in patch) dbPatch.style = patch.style;
  if ('startsAt' in patch) dbPatch.starts_at = patch.startsAt;
  if ('endsAt' in patch) dbPatch.ends_at = patch.endsAt;
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
