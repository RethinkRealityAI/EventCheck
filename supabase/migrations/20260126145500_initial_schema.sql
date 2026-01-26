-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: forms
create table if not exists public.forms (
  id uuid not null default uuid_generate_v4(),
  title text not null,
  description text not null,
  status text not null check (status in ('active', 'draft', 'closed')),
  created_at timestamp with time zone not null default now(),
  settings jsonb null,
  thank_you_message text null,
  fields jsonb not null default '[]'::jsonb,
  constraint forms_pkey primary key (id)
);

-- Table: attendees
create table if not exists public.attendees (
  id uuid not null default uuid_generate_v4(),
  form_id uuid not null,
  name text not null,
  email text not null,
  ticket_type text not null,
  registered_at timestamp with time zone not null default now(),
  checked_in_at timestamp with time zone null,
  qr_payload text not null,
  payment_status text check (payment_status in ('paid', 'pending', 'free')),
  invoice_id text null,
  answers jsonb null,
  is_test boolean not null default false,
  constraint attendees_pkey primary key (id),
  constraint attendees_form_id_fkey foreign key (form_id) references public.forms (id) on delete cascade
);

-- Table: app_settings (Singleton)
create table if not exists public.app_settings (
  id integer not null default 1,
  paypal_client_id text null,
  currency text not null default 'USD',
  ticket_price numeric not null default 0,
  smtp_host text null,
  smtp_port text null,
  smtp_user text null,
  smtp_pass text null,
  email_header_logo text null,
  email_subject text null,
  email_body_template text null,
  email_footer_text text null,
  email_invitation_subject text null,
  email_invitation_body text null,
  pdf_settings jsonb null,
  constraint app_settings_pkey primary key (id),
  constraint app_settings_singleton check (id = 1)
);

-- RLS Policies
alter table public.forms enable row level security;
create policy "Allow all access to forms" on public.forms for all using (true);

alter table public.attendees enable row level security;
create policy "Allow all access to attendees" on public.attendees for all using (true);

alter table public.app_settings enable row level security;
create policy "Allow all access to app_settings" on public.app_settings for all using (true);
