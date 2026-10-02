begin;

-- Allow each authenticated user to read their own role assignment so the
-- frontend can resolve the existing canonical role -> permission mapping.
create policy "user_roles_self_select"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Read the caller's department without recursively evaluating profiles RLS.
create or replace function private.current_user_department_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select p.department_id
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.current_user_department_id() from public, anon, authenticated;
grant execute on function private.current_user_department_id() to authenticated;

-- Department staff may see active colleagues for assignment pickers.
create policy "profiles_department_select"
  on public.profiles
  for select
  to authenticated
  using (
    department_id is not null
    and department_id = (select private.current_user_department_id())
    and is_active = true
  );

commit;
