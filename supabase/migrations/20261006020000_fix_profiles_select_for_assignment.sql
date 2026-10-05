drop policy if exists profiles_select_for_workflow on public.profiles;

create policy profiles_select_for_workflow
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.has_permission('documents.assign'))
  or (select private.has_permission('leave.approve'))
  or (select private.has_permission('users.manage'))
);