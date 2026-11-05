-- FULL SCHOOL WEBSITE DATABASE SCHEMA
-- Target: Supabase PostgreSQL 17.11
-- Run once in SQL Editor on a clean project. On the connected school project,
-- this schema is already installed via Supabase migrations; do not rerun blindly.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','editor')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.admin_users
    where user_id = (select auth.uid()) and role in ('owner','admin','editor'));
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to anon, authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  slug text not null unique, description text, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  title text not null, slug text not null unique, excerpt text, content text not null,
  cover_image_url text, author_name text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_pinned boolean not null default false, published_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.personnel (
  id uuid primary key default gen_random_uuid(), full_name text not null,
  position text not null, department text, bio text, photo_url text, email text,
  phone_public text, personal_website_url text,
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links)='object'),
  sort_order integer not null default 0, is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.downloads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  title text not null, description text, file_url text not null, file_type text,
  file_size_label text, download_count bigint not null default 0 check (download_count >= 0),
  is_published boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  cover_image_url text, image_urls jsonb not null default '[]'::jsonb
    check (jsonb_typeof(image_urls)='array'),
  event_date date, is_published boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), title text not null,
  description text, location text, starts_at timestamptz not null, ends_at timestamptz,
  is_published boolean not null default true, created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create table if not exists public.settings (
  key text primary key, value jsonb not null default '{}'::jsonb,
  is_public boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(), sender_name text not null,
  sender_email text, subject text, message text not null,
  status text not null default 'new' check (status in ('new','read','replied','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.class_overview (
  id uuid primary key default gen_random_uuid(), academic_year integer not null,
  grade_label text not null, room_label text not null,
  student_count integer not null default 0 check (student_count >= 0),
  is_published boolean not null default false, updated_at timestamptz not null default now(),
  unique(academic_year,grade_label,room_label)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists news_set_updated_at on public.news;
create trigger news_set_updated_at before update on public.news for each row execute function public.set_updated_at();
drop trigger if exists personnel_set_updated_at on public.personnel;
create trigger personnel_set_updated_at before update on public.personnel for each row execute function public.set_updated_at();
drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings for each row execute function public.set_updated_at();
drop trigger if exists class_overview_set_updated_at on public.class_overview;
create trigger class_overview_set_updated_at before update on public.class_overview for each row execute function public.set_updated_at();

-- RLS and least-privilege grants. Every public table has RLS enabled.
alter table public.categories enable row level security;
alter table public.news enable row level security;
alter table public.personnel enable row level security;
alter table public.downloads enable row level security;
alter table public.galleries enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;
alter table public.contact_messages enable row level security;
alter table public.class_overview enable row level security;

-- Public SELECT policies.
drop policy if exists "categories readable by everyone" on public.categories;
create policy "categories readable by everyone" on public.categories for select to anon, authenticated using (true);
drop policy if exists "published news readable by everyone" on public.news;
create policy "published news readable by everyone" on public.news for select to anon, authenticated
using ((status='published' and published_at <= now()) or (select private.is_admin()));
drop policy if exists "published personnel readable by everyone" on public.personnel;
create policy "published personnel readable by everyone" on public.personnel for select to anon, authenticated
using (is_published or (select private.is_admin()));
drop policy if exists "published downloads readable by everyone" on public.downloads;
create policy "published downloads readable by everyone" on public.downloads for select to anon, authenticated
using (is_published or (select private.is_admin()));
drop policy if exists "published galleries readable by everyone" on public.galleries;
create policy "published galleries readable by everyone" on public.galleries for select to anon, authenticated
using (is_published or (select private.is_admin()));
drop policy if exists "published events readable by everyone" on public.events;
create policy "published events readable by everyone" on public.events for select to anon, authenticated
using (is_published or (select private.is_admin()));
drop policy if exists "public settings readable by everyone" on public.settings;
create policy "public settings readable by everyone" on public.settings for select to anon, authenticated
using (is_public or (select private.is_admin()));
drop policy if exists "published class overview readable by everyone" on public.class_overview;
create policy "published class overview readable by everyone" on public.class_overview for select to anon, authenticated
using (is_published or (select private.is_admin()));

-- Admin membership: an authenticated user can read only their own membership row.
drop policy if exists "admins can read own admin membership" on public.admin_users;
create policy "admins can read own admin membership" on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

-- Admin-only DML policies (no public writes to content tables).
do $$
declare t text;
begin
  foreach t in array array['categories','news','personnel','downloads','galleries','events','settings','class_overview'] loop
    execute format('drop policy if exists %I on public.%I','admins insert '||t,t);
    execute format('drop policy if exists %I on public.%I','admins update '||t,t);
    execute format('drop policy if exists %I on public.%I','admins delete '||t,t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))','admins insert '||t,t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))','admins update '||t,t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))','admins delete '||t,t);
  end loop;
end $$;

drop policy if exists "anonymous and signed-in visitors can submit contact" on public.contact_messages;
create policy "anonymous and signed-in visitors can submit contact" on public.contact_messages
for insert to anon, authenticated with check (
  char_length(trim(sender_name)) between 2 and 120 and char_length(trim(message)) between 5 and 5000
);
drop policy if exists "admins read contact messages" on public.contact_messages;
create policy "admins read contact messages" on public.contact_messages for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins update contact messages" on public.contact_messages;
create policy "admins update contact messages" on public.contact_messages for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admins delete contact messages" on public.contact_messages;
create policy "admins delete contact messages" on public.contact_messages for delete to authenticated using ((select private.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.categories,public.news,public.personnel,public.downloads,public.galleries,
  public.events,public.settings,public.class_overview to anon,authenticated;
grant insert on public.contact_messages to anon,authenticated;
grant select on public.admin_users to authenticated;
grant insert,update,delete on public.categories,public.news,public.personnel,public.downloads,
  public.galleries,public.events,public.settings,public.class_overview,public.contact_messages to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create index if not exists news_category_id_idx on public.news(category_id);
create index if not exists news_created_by_idx on public.news(created_by);
create index if not exists news_published_listing_idx on public.news(status,published_at desc) where status='published';
create index if not exists downloads_category_id_idx on public.downloads(category_id);
create index if not exists personnel_published_sort_idx on public.personnel(is_published,sort_order);
create index if not exists events_published_starts_idx on public.events(is_published,starts_at);

-- First admin bootstrap (run manually only after selecting a trusted Auth account):
-- insert into public.admin_users(user_id,role) values ('AUTH_USER_UUID','owner')
-- on conflict (user_id) do update set role=excluded.role;

-- Do not create student-level records in public tables. class_overview stores only aggregate counts.
