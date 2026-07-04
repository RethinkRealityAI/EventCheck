-- site_content: JSONB-per-page CMS store. Public-read (landing is public),
-- admin-write. Decoupled from app_settings (avoids the monolithic saveSettings
-- explicit-column trap). Policies reference only auth.uid()/role — never
-- subquery site_content itself.
create table if not exists public.site_content (
  site       text not null,
  page       text not null,
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (site, page)
);

alter table public.site_content enable row level security;

-- Public read (anon + authenticated). Content holds no secrets.
drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content
  for select using (true);

-- Admin write via the existing helper.
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content
  for all using (public.is_portal_admin()) with check (public.is_portal_admin());
