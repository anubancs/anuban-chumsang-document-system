-- Allow only the first authenticated account to claim the admin role
create or replace function private.has_any_user_role()
returns boolean language sql stable security definer
set search_path=public,private,pg_catalog
as $$ select exists(select 1 from public.user_roles); $$;

revoke all on function private.has_any_user_role() from public;
grant execute on function private.has_any_user_role() to authenticated;

drop policy if exists user_roles_bootstrap_insert on public.user_roles;
create policy user_roles_bootstrap_insert on public.user_roles
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and role_id=(select id from public.roles where code='admin' limit 1)
  and not (select private.has_any_user_role())
);
