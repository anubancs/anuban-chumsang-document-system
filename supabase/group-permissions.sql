-- Add role-based access control groups to the existing school CMS.
-- Apply AFTER supabase/schema.sql on the existing project.
-- Live project has already received these changes through Supabase migrations.
-- Never add service_role keys to frontend code.

create table if not exists public.admin_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);
alter table public.admin_users add column if not exists group_id uuid references public.admin_groups(id) on delete set null;
create table if not exists public.group_permissions (
  group_id uuid not null references public.admin_groups(id) on delete cascade,
  module text not null check (module in ('news','personnel','downloads','galleries','events','contact_messages','class_overview')),
  action text not null check (action in ('view','create','update','delete','publish')),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(group_id,module,action)
);
insert into public.admin_groups(name,slug,description) values
 ('กลุ่มประชาสัมพันธ์','public-relations','จัดการข่าวสาร ประชาสัมพันธ์ ภาพกิจกรรม และปฏิทินข่าว'),
 ('กลุ่มบริหารงานบุคคล','human-resources','จัดการข้อมูลบุคลากรของโรงเรียน'),
 ('กลุ่มกิจการนักเรียน','student-affairs','จัดการกิจกรรม ดาวน์โหลด และข้อมูลภาพรวมชั้นเรียน')
on conflict (slug) do update set name=excluded.name,description=excluded.description;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.admin_users where user_id=(select auth.uid()) and role='owner'); $$;
revoke all on function private.is_owner() from public,anon;
grant execute on function private.is_owner() to authenticated;

create or replace function private.has_permission(p_module text,p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.admin_users au
 left join public.group_permissions gp on gp.group_id=au.group_id
   and gp.module=p_module and gp.action=p_action and gp.allowed
 where au.user_id=(select auth.uid()) and (au.role='owner' or coalesce(gp.allowed,false)));
$$;
revoke all on function private.has_permission(text,text) from public,anon;
grant execute on function private.has_permission(text,text) to authenticated;

alter table public.admin_groups enable row level security;
alter table public.group_permissions enable row level security;
drop policy if exists "admins can view groups" on public.admin_groups;
drop policy if exists "owners manage groups" on public.admin_groups;
create policy "owners manage groups" on public.admin_groups for all to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
drop policy if exists "admins can view group permissions" on public.group_permissions;
drop policy if exists "owners manage group permissions" on public.group_permissions;
create policy "owners manage group permissions" on public.group_permissions for all to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));

drop policy if exists "admins can read own admin membership" on public.admin_users;
create policy "admins can read own admin membership" on public.admin_users for select to authenticated using (user_id=(select auth.uid()) or (select private.is_owner()));
drop policy if exists "owners insert admin memberships" on public.admin_users;
create policy "owners insert admin memberships" on public.admin_users for insert to authenticated with check ((select private.is_owner()));
drop policy if exists "owners update admin memberships" on public.admin_users;
create policy "owners update admin memberships" on public.admin_users for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
drop policy if exists "owners delete admin memberships" on public.admin_users;
create policy "owners delete admin memberships" on public.admin_users for delete to authenticated using ((select private.is_owner()));

do $$
declare t text;
begin
 foreach t in array array['news','personnel','downloads','galleries','events','class_overview'] loop
   execute format('drop policy if exists %I on public.%I','admins insert '||t,t);
   execute format('drop policy if exists %I on public.%I','admins update '||t,t);
   execute format('drop policy if exists %I on public.%I','admins delete '||t,t);
   execute format('drop policy if exists %I on public.%I','admins insert '||replace(t,'_',' '),t);
   execute format('drop policy if exists %I on public.%I','admins update '||replace(t,'_',' '),t);
   execute format('drop policy if exists %I on public.%I','admins delete '||replace(t,'_',' '),t);
   execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_permission(%L,%L)))','group create '||t,t,t,'create');
   execute format('create policy %I on public.%I for update to authenticated using ((select private.has_permission(%L,%L))) with check ((select private.has_permission(%L,%L)))','group update '||t,t,t,'update',t,'update');
   execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_permission(%L,%L)))','group delete '||t,t,t,'delete');
 end loop;
end $$;

drop policy if exists "published news readable by everyone" on public.news;
create policy "published news readable by everyone" on public.news for select to anon,authenticated
using ((status='published' and published_at<=now()) or (select private.has_permission('news','view')));
drop policy if exists "published personnel readable by everyone" on public.personnel;
create policy "published personnel readable by everyone" on public.personnel for select to anon,authenticated
using (is_published or (select private.has_permission('personnel','view')));
drop policy if exists "published downloads readable by everyone" on public.downloads;
create policy "published downloads readable by everyone" on public.downloads for select to anon,authenticated
using (is_published or (select private.has_permission('downloads','view')));
drop policy if exists "published galleries readable by everyone" on public.galleries;
create policy "published galleries readable by everyone" on public.galleries for select to anon,authenticated
using (is_published or (select private.has_permission('galleries','view')));
drop policy if exists "published events readable by everyone" on public.events;
create policy "published events readable by everyone" on public.events for select to anon,authenticated
using (is_published or (select private.has_permission('events','view')));
drop policy if exists "published class overview readable by everyone" on public.class_overview;
create policy "published class overview readable by everyone" on public.class_overview for select to anon,authenticated
using (is_published or (select private.has_permission('class_overview','view')));

drop policy if exists "admins read contact messages" on public.contact_messages;
create policy "group view contact messages" on public.contact_messages for select to authenticated using ((select private.has_permission('contact_messages','view')));
drop policy if exists "admins update contact messages" on public.contact_messages;
create policy "group update contact messages" on public.contact_messages for update to authenticated using ((select private.has_permission('contact_messages','update'))) with check ((select private.has_permission('contact_messages','update')));
drop policy if exists "admins delete contact messages" on public.contact_messages;
create policy "group delete contact messages" on public.contact_messages for delete to authenticated using ((select private.has_permission('contact_messages','delete')));

insert into public.group_permissions(group_id,module,action,allowed)
select g.id,m.module,a.action,true from public.admin_groups g
join (values ('public-relations','news'),('public-relations','galleries'),('public-relations','events'),
 ('human-resources','personnel'),('student-affairs','events'),('student-affairs','galleries'),
 ('student-affairs','downloads'),('student-affairs','class_overview')) m(group_slug,module) on m.group_slug=g.slug
cross join (values ('view'),('create'),('update'),('delete'),('publish')) a(action)
on conflict (group_id,module,action) do nothing;

-- Lock down any legacy broad grants; each group may manage only its intended modules.
update public.group_permissions gp
set allowed = case g.slug
  when 'public-relations' then gp.module in ('news','galleries','events')
  when 'human-resources' then gp.module in ('personnel')
  when 'student-affairs' then gp.module in ('events','galleries','downloads','class_overview')
  else false
end
from public.admin_groups g
where gp.group_id=g.id
  and g.slug in ('public-relations','human-resources','student-affairs');

create or replace function private.guard_publish_permission()
returns trigger language plpgsql set search_path=''
as $$
declare module_name text; was_published boolean; now_published boolean;
begin
 module_name:=tg_table_name;
 if tg_op='INSERT' then
   if module_name='news' then now_published:=new.status='published';
   else now_published:=coalesce((to_jsonb(new)->>'is_published')::boolean,false); end if;
   if now_published and not private.has_permission(module_name,'publish') then
     raise exception 'Missing publish permission for %',module_name using errcode='42501';
   end if;
 elsif tg_op='UPDATE' then
   if module_name='news' then was_published:=old.status='published';now_published:=new.status='published';
   else was_published:=coalesce((to_jsonb(old)->>'is_published')::boolean,false);now_published:=coalesce((to_jsonb(new)->>'is_published')::boolean,false);end if;
   if was_published is distinct from now_published and not private.has_permission(module_name,'publish') then
     raise exception 'Missing publish permission for %',module_name using errcode='42501';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_publish_permission() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['news','personnel','downloads','galleries','events','class_overview'] loop
   execute format('drop trigger if exists guard_publish_permission on public.%I',t);
   execute format('create trigger guard_publish_permission before insert or update on public.%I for each row execute function private.guard_publish_permission()',t);
 end loop;
end $$;

revoke all privileges on public.admin_groups,public.group_permissions from anon,authenticated;
grant select,insert,update,delete on public.admin_groups,public.group_permissions to authenticated;
grant select,insert,update,delete on public.admin_users to authenticated;
create index if not exists admin_users_group_id_idx on public.admin_users(group_id);


-- Owner-only directory for assigning existing Supabase Auth accounts to admin groups.
-- The SECURITY DEFINER implementation stays in the non-exposed private schema.
-- Return names and job positions from Supabase Auth user metadata as well as email.
-- Drop first because PostgreSQL cannot change a RETURNS TABLE row type with CREATE OR REPLACE.
drop function if exists public.list_auth_users_for_owner();
drop function if exists private.list_auth_users_for_owner();

create function private.list_auth_users_for_owner()
returns table (
 user_id uuid, full_name text, "position" text, email text,
 created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $
begin
 if auth.uid() is null or not exists (
   select 1 from public.admin_users au where au.user_id=auth.uid() and au.role='owner'
 ) then
   raise exception 'owner access required' using errcode='42501';
 end if;
 return query
 select u.id,
   nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')),''),
   nullif(trim(coalesce(u.raw_user_meta_data->>'position','')),''),
   u.email::text,u.created_at,u.last_sign_in_at
 from auth.users u
 where u.deleted_at is null and coalesce(u.is_anonymous,false)=false
 order by lower(coalesce(u.raw_user_meta_data->>'full_name',u.email,'')),u.created_at;
end;
$;
revoke all on function private.list_auth_users_for_owner() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.list_auth_users_for_owner() to authenticated;

-- Public RPC wrapper is SECURITY INVOKER; the private function enforces Owner access.
create function public.list_auth_users_for_owner()
returns table (
 user_id uuid, full_name text, "position" text, email text,
 created_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security invoker set search_path=''
as $ select * from private.list_auth_users_for_owner(); $;
revoke all on function public.list_auth_users_for_owner() from public,anon;
grant execute on function public.list_auth_users_for_owner() to authenticated;
