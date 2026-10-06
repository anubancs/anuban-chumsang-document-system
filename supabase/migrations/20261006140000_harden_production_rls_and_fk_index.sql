-- Production hardening: consolidate profile SELECT RLS, protect document sequences, index notification actor FK.
create index if not exists idx_notifications_actor_id on public.notifications(actor_id);

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_select_for_workflow on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or (select private.has_permission('users.manage'))
  or (
    department_id is not null
    and department_id = (select private.current_user_department_id())
    and is_active = true
  )
  or (select private.has_permission('documents.assign'))
  or (select private.has_permission('leave.approve'))
);

create policy document_sequences_select on public.document_sequences
for select to authenticated
using ((select private.has_permission('settings.manage')));

create policy document_sequences_insert on public.document_sequences
for insert to authenticated
with check ((select private.has_permission('settings.manage')));

create policy document_sequences_update on public.document_sequences
for update to authenticated
using ((select private.has_permission('settings.manage')))
with check ((select private.has_permission('settings.manage')));

create policy document_sequences_delete on public.document_sequences
for delete to authenticated
using ((select private.has_permission('settings.manage')));
