-- Harden first-admin bootstrap.
-- The auth.users trigger creates the profile and assigns the admin role only
-- when no user_roles exist yet. A transaction advisory lock prevents two
-- simultaneous first signups from both receiving the admin role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role_id uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email,''),'@',1),
      'ผู้ใช้งาน'
    ),
    new.email
  )
  on conflict (id) do nothing;

  perform pg_advisory_xact_lock(
    hashtextextended('anuban-chumsang:first-admin', 0)
  );

  if not exists (select 1 from public.user_roles) then
    select r.id
      into v_admin_role_id
    from public.roles r
    where r.code = 'admin'
    limit 1;

    if v_admin_role_id is not null then
      insert into public.user_roles (user_id, role_id, assigned_by)
      values (new.id, v_admin_role_id, new.id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, supabase_auth_admin;

drop function if exists public.ensure_first_admin();
