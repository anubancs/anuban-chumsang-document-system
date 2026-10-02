-- Enforce document workflow transitions and keep workflow/task state in sync.
create schema if not exists private;
create or replace function private.validate_incoming_status_transition() returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  if new.status is distinct from old.status and not (
    (old.status='received' and new.status in ('registered','assigned','in_progress','cancelled')) or
    (old.status='registered' and new.status in ('assigned','in_progress','cancelled')) or
    (old.status='assigned' and new.status in ('in_progress','cancelled')) or
    (old.status='in_progress' and new.status in ('completed','cancelled')) or
    (old.status='completed' and new.status='archived')
  ) then
    raise exception 'ไม่สามารถเปลี่ยนสถานะหนังสือรับจาก % เป็น %',old.status,new.status using errcode='23514';
  end if;
  return new;
end;
$function$;
create or replace function private.validate_outgoing_status_transition() returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  if new.status is distinct from old.status and not (
    (old.status='draft' and new.status in ('pending_approval','cancelled')) or
    (old.status='pending_approval' and new.status in ('approved','cancelled')) or
    (old.status='approved' and new.status in ('sent','cancelled')) or
    (old.status='sent' and new.status='archived')
  ) then
    raise exception 'ไม่สามารถเปลี่ยนสถานะหนังสือส่งจาก % เป็น %',old.status,new.status using errcode='23514';
  end if;
  return new;
end;
$function$;
create or replace function private.record_document_workflow() returns trigger language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_from text; v_action text;
begin
  v_actor:=coalesce(auth.uid(),new.created_by);
  if tg_op='INSERT' then v_from:=null; v_action:='register'; else v_from:=old.status; v_action:='status_change'; end if;
  if tg_table_name='incoming_documents' then
    insert into public.workflows(incoming_document_id,from_status,to_status,action,actor_id,comment) values(new.id,v_from,new.status,v_action,v_actor,null);
  elsif tg_table_name='outgoing_documents' then
    insert into public.workflows(outgoing_document_id,from_status,to_status,action,actor_id,comment) values(new.id,v_from,new.status,v_action,v_actor,null);
  end if;
  return new;
end;
$function$;
create or replace function private.sync_incoming_assignment() returns trigger language plpgsql security definer set search_path='' as $function$
declare v_doc_status text; v_next_status text;
begin
  if new.incoming_document_id is null then return new; end if;
  select status into v_doc_status from public.incoming_documents where id=new.incoming_document_id for update;
  if tg_op='INSERT' then
    if v_doc_status in ('received','registered') then update public.incoming_documents set status='assigned' where id=new.incoming_document_id; end if;
    return new;
  end if;
  if new.status in ('accepted','in_progress') then v_next_status:='in_progress';
  elsif new.status='completed' then
    if exists(select 1 from public.assignments a where a.incoming_document_id=new.incoming_document_id and a.id<>new.id and a.status in ('pending','accepted','in_progress')) then v_next_status:='in_progress'; else v_next_status:='completed'; end if;
  elsif new.status='cancelled' then
    if exists(select 1 from public.assignments a where a.incoming_document_id=new.incoming_document_id and a.id<>new.id and a.status in ('pending','accepted','in_progress')) then v_next_status:='assigned'; else v_next_status:='registered'; end if;
  else return new; end if;
  if v_doc_status is distinct from v_next_status then update public.incoming_documents set status=v_next_status where id=new.incoming_document_id; end if;
  return new;
end;
$function$;
revoke all on function private.validate_incoming_status_transition() from public,anon,authenticated;
revoke all on function private.validate_outgoing_status_transition() from public,anon,authenticated;
revoke all on function private.record_document_workflow() from public,anon,authenticated;
revoke all on function private.sync_incoming_assignment() from public,anon,authenticated;
create or replace trigger trg_validate_incoming_status before update of status on public.incoming_documents for each row execute function private.validate_incoming_status_transition();
create or replace trigger trg_validate_outgoing_status before update of status on public.outgoing_documents for each row execute function private.validate_outgoing_status_transition();
create or replace trigger trg_record_incoming_workflow after insert or update of status on public.incoming_documents for each row execute function private.record_document_workflow();
create or replace trigger trg_record_outgoing_workflow after insert or update of status on public.outgoing_documents for each row execute function private.record_document_workflow();
create or replace trigger trg_sync_incoming_assignment after insert or update of status on public.assignments for each row execute function private.sync_incoming_assignment();