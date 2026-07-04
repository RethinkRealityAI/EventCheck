import { supabase } from './supabaseClient';

// Deep-merge override over defaults. Objects merge recursively; arrays and
// scalars from override replace defaults wholesale. Undefined/null in override
// is ignored (falls back to default) so a partial edit never blanks the page.
export function mergeContent<T>(defaults: T, override: any): T {
  if (override == null) return defaults;
  if (Array.isArray(defaults) || typeof defaults !== 'object') {
    return (override ?? defaults) as T;
  }
  const out: any = { ...defaults };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (ov === undefined || ov === null) continue;
    const dv = (defaults as any)[key];
    if (Array.isArray(ov) || typeof ov !== 'object') out[key] = ov;
    else out[key] = mergeContent(dv ?? {}, ov);
  }
  return out;
}

export async function getSiteContent(site: string, page: string): Promise<any> {
  const { data, error } = await supabase
    .from('site_content').select('content').eq('site', site).eq('page', page).maybeSingle();
  if (error) { console.error('getSiteContent', error); return {}; }
  return data?.content ?? {};
}

export async function saveSiteContent(site: string, page: string, content: any): Promise<boolean> {
  const { data, error } = await supabase
    .from('site_content')
    .upsert({ site, page, content, updated_at: new Date().toISOString() })
    .select('site');
  if (error) { console.error('saveSiteContent', error); return false; }
  return (data?.length ?? 0) > 0; // rowcount check
}
