begin;

drop policy if exists user_roles_bootstrap_insert on public.user_roles;
revoke insert on public.user_roles from authenticated;

drop policy if exists workflows_insert on public.workflows;
revoke insert on public.workflows from authenticated;

drop policy if exists files_insert on public.document_files;
revoke insert on public.document_files from authenticated;

drop policy if exists files_delete on public.document_files;
revoke delete on public.document_files from authenticated;

drop policy if exists profiles_self_or_admin_update on public.profiles;
revoke update on public.profiles from authenticated;

create or replace function private.prevent_assignment_identity_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to
     or new.assigned_by is distinct from old.assigned_by
     or new.incoming_document_id is distinct from old.incoming_document_id
     or new.outgoing_document_id is distinct from old.outgoing_document_id then
    raise exception 'Assignment identity fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_assignment_identity_changes on public.assignments;
create trigger trg_prevent_assignment_identity_changes
before update on public.assignments
for each row
execute function private.prevent_assignment_identity_changes();

revoke all on function private.prevent_assignment_identity_changes() from anon, authenticated;

commit;
