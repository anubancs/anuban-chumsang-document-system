drop policy if exists profiles_department_select on public.profiles;
drop policy if exists profiles_self_or_admin_select on public.profiles;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.has_permission('users.manage'))
  or (
    department_id is not null
    and department_id = (select private.current_user_department_id())
    and is_active = true
  )
);
