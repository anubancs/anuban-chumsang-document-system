-- Personnel self-service profile updates with administrator approval.
-- Applied to the production Supabase project as migration 20261107141854.

alter table public.personnel
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
create index if not exists personnel_auth_user_id_idx on public.personnel(auth_user_id) where auth_user_id is not null;

create table if not exists public.personnel_update_requests (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint personnel_request_changes_object check (jsonb_typeof(changes)='object'),
  constraint personnel_request_allowed_fields check (
    changes <> '{}'::jsonb
    and not (changes ?| array['id','auth_user_id','email','is_published','sort_order','created_at','updated_at','status','requested_by','personnel_id'])
    and (not (changes ? 'social_links') or jsonb_typeof(changes->'social_links')='object')
  )
);
create unique index if not exists personnel_one_pending_request_idx on public.personnel_update_requests(personnel_id) where status='pending';
alter table public.personnel_update_requests enable row level security;

drop policy if exists "personnel users read own profile" on public.personnel;
create policy "personnel users read own profile" on public.personnel for select to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "personnel users read own update requests" on public.personnel_update_requests;
create policy "personnel users read own update requests" on public.personnel_update_requests for select to authenticated
using (requested_by = (select auth.uid()) or (select private.has_permission('personnel','view')));

drop policy if exists "personnel users submit own update requests" on public.personnel_update_requests;
create policy "personnel users submit own update requests" on public.personnel_update_requests for insert to authenticated
with check (
  requested_by = (select auth.uid()) and status='pending'
  and exists (select 1 from public.personnel p where p.id=personnel_id and p.auth_user_id=(select auth.uid()))
);
grant select, insert on public.personnel_update_requests to authenticated;
revoke update, delete, truncate, references, trigger on public.personnel_update_requests from anon, authenticated;

create or replace function private.list_auth_users_for_personnel_admin()
returns table(user_id uuid, full_name text, "position" text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission('personnel','update') then
    raise exception 'personnel update permission required' using errcode='42501';
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
$$;
revoke all on function private.list_auth_users_for_personnel_admin() from public, anon;
grant execute on function private.list_auth_users_for_personnel_admin() to authenticated;

create or replace function public.list_auth_users_for_personnel_admin()
returns table(user_id uuid, full_name text, "position" text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable set search_path = ''
as $$ select * from private.list_auth_users_for_personnel_admin(); $$;
revoke all on function public.list_auth_users_for_personnel_admin() from public, anon;
grant execute on function public.list_auth_users_for_personnel_admin() to authenticated;

create or replace function private.review_personnel_update_request(p_request_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare req public.personnel_update_requests%rowtype;
begin
  if auth.uid() is null or not private.has_permission('personnel','update') then
    raise exception 'personnel update permission required' using errcode='42501';
  end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into req from public.personnel_update_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'pending request not found' using errcode='P0002'; end if;
  if p_decision='approve' then
    if (req.changes ? 'full_name' and length(trim(req.changes->>'full_name')) not between 2 and 200)
      or (req.changes ? 'position' and length(trim(req.changes->>'position')) not between 2 and 200)
      or (req.changes ? 'phone_public' and length(coalesce(req.changes->>'phone_public','')) > 50)
      or (req.changes ? 'bio' and length(coalesce(req.changes->>'bio','')) > 10000)
      or (req.changes ? 'department' and length(coalesce(req.changes->>'department','')) > 200)
      or (req.changes ? 'photo_url' and length(coalesce(req.changes->>'photo_url','')) > 2048)
      or (req.changes ? 'personal_website_url' and length(coalesce(req.changes->>'personal_website_url','')) > 2048) then
      raise exception 'invalid profile field length' using errcode='22023';
    end if;
    update public.personnel p set
      full_name=case when req.changes ? 'full_name' then req.changes->>'full_name' else p.full_name end,
      position=case when req.changes ? 'position' then req.changes->>'position' else p.position end,
      department=case when req.changes ? 'department' then nullif(req.changes->>'department','') else p.department end,
      bio=case when req.changes ? 'bio' then nullif(req.changes->>'bio','') else p.bio end,
      photo_url=case when req.changes ? 'photo_url' then nullif(req.changes->>'photo_url','') else p.photo_url end,
      phone_public=case when req.changes ? 'phone_public' then nullif(req.changes->>'phone_public','') else p.phone_public end,
      personal_website_url=case when req.changes ? 'personal_website_url' then nullif(req.changes->>'personal_website_url','') else p.personal_website_url end,
      social_links=case when req.changes ? 'social_links' then req.changes->'social_links' else p.social_links end,
      updated_at=now()
    where p.id=req.personnel_id;
  end if;
  update public.personnel_update_requests set
    status=case when p_decision='approve' then 'approved' else 'rejected' end,
    review_note=nullif(trim(coalesce(p_note,'')),''),
    reviewed_by=auth.uid(),reviewed_at=now()
  where id=req.id;
end;
$$;
revoke all on function private.review_personnel_update_request(uuid,text,text) from public, anon;
grant execute on function private.review_personnel_update_request(uuid,text,text) to authenticated;

create or replace function public.review_personnel_update_request(p_request_id uuid,p_decision text,p_note text default null)
returns void language sql security invoker set search_path = ''
as $$ select private.review_personnel_update_request(p_request_id,p_decision,p_note); $$;
revoke all on function public.review_personnel_update_request(uuid,text,text) from public, anon;
grant execute on function public.review_personnel_update_request(uuid,text,text) to authenticated;
