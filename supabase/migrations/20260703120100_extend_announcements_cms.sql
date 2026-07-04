-- Additive columns for CMS announcements: CTA, accent color, style, schedule.
alter table public.announcements
  add column if not exists cta_label   text,
  add column if not exists cta_url      text,
  add column if not exists cta_mode     text not null default 'none',
  add column if not exists accent_color text,
  add column if not exists style        text not null default 'card',
  add column if not exists starts_at    timestamptz,
  add column if not exists ends_at      timestamptz;

-- Guard the enum-ish columns.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_cta_mode_check') then
    alter table public.announcements
      add constraint announcements_cta_mode_check check (cta_mode in ('none','link','iframe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'announcements_style_check') then
    alter table public.announcements
      add constraint announcements_style_check check (style in ('card','banner'));
  end if;
end $$;
