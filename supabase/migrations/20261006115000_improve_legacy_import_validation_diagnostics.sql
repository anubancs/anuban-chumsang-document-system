create or replace function public.validate_legacy_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_by uuid;
  v_total int := 0;
  v_ready int := 0;
  v_warn int := 0;
  v_error int := 0;
  v_unresolved_tasks int := 0;
  v_duplicate_docs int := 0;
  v_missing_parent int := 0;
  v_missing_creator int := 0;
  v_missing_assignee int := 0;
  v_missing_actor int := 0;
begin
  if not private.has_permission('users.manage') then raise exception 'permission denied'; end if;
  select started_by into v_started_by from public.legacy_import_batches where id=p_batch_id for update;
  if v_started_by is null then raise exception 'batch not found'; end if;
  select count(*) into v_total from public.legacy_import_records where batch_id=p_batch_id;
  select count(*) into v_missing_creator from public.legacy_import_records r where r.batch_id=p_batch_id and r.source_sheet='Documents' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'Created_By','') and m.is_confirmed and m.current_user_id is not null);
  select count(*) into v_missing_assignee from public.legacy_import_records r where r.batch_id=p_batch_id and r.source_sheet='Tasks' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'AssigneeID','') and m.is_confirmed and m.current_user_id is not null);
  select count(*) into v_missing_parent from public.legacy_import_records r where r.batch_id=p_batch_id and r.source_sheet='Tasks' and not exists (select 1 from public.legacy_import_records d where d.batch_id=p_batch_id and d.source_sheet='Documents' and d.legacy_id=coalesce(r.payload->>'DocID',''));
  select count(*) into v_missing_actor from public.legacy_import_records r where r.batch_id=p_batch_id and r.source_sheet='Workflow_Logs' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'ActorID','') and m.is_confirmed and m.current_user_id is not null);
  select count(*) into v_duplicate_docs from public.legacy_import_records r join public.incoming_documents d on d.document_no='LEGACY/'||r.legacy_id where r.batch_id=p_batch_id and r.source_sheet='Documents';
  update public.legacy_import_records r set
    status=case
      when r.source_sheet='Documents' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'Created_By','') and m.is_confirmed and m.current_user_id is not null) then 'error'
      when r.source_sheet='Documents' and exists (select 1 from public.incoming_documents d where d.document_no='LEGACY/'||r.legacy_id) then 'error'
      when r.source_sheet='Tasks' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'AssigneeID','') and m.is_confirmed and m.current_user_id is not null) then 'skipped'
      when r.source_sheet='Tasks' and not exists (select 1 from public.legacy_import_records d where d.batch_id=p_batch_id and d.source_sheet='Documents' and d.legacy_id=coalesce(r.payload->>'DocID','')) then 'skipped'
      when r.source_sheet='Workflow_Logs' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'ActorID','') and m.is_confirmed and m.current_user_id is not null) then 'skipped'
      else 'staged' end,
    error_message=case
      when r.source_sheet='Documents' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'Created_By','') and m.is_confirmed and m.current_user_id is not null) then 'ไม่พบผู้สร้างหนังสือเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      when r.source_sheet='Documents' and exists (select 1 from public.incoming_documents d where d.document_no='LEGACY/'||r.legacy_id) then 'พบหนังสือ LEGACY/'||r.legacy_id||' ในระบบแล้ว อาจเป็นข้อมูลซ้ำ'
      when r.source_sheet='Tasks' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'AssigneeID','') and m.is_confirmed and m.current_user_id is not null) then 'ไม่พบผู้รับผิดชอบเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      when r.source_sheet='Tasks' and not exists (select 1 from public.legacy_import_records d where d.batch_id=p_batch_id and d.source_sheet='Documents' and d.legacy_id=coalesce(r.payload->>'DocID','')) then 'ไม่พบหนังสือแม่ของงาน DocID='||coalesce(r.payload->>'DocID','')
      when r.source_sheet='Workflow_Logs' and not exists (select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=coalesce(r.payload->>'ActorID','') and m.is_confirmed and m.current_user_id is not null) then 'ไม่พบผู้ดำเนินการเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      else null end
  where r.batch_id=p_batch_id;
  select count(*) into v_error from public.legacy_import_records where batch_id=p_batch_id and status='error';
  select count(*) into v_warn from public.legacy_import_records where batch_id=p_batch_id and status='skipped';
  select count(*) into v_ready from public.legacy_import_records where batch_id=p_batch_id and status='staged';
  v_unresolved_tasks := v_missing_assignee + v_missing_parent;
  update public.legacy_import_batches set status='staged', total_rows=v_total, imported_rows=0, skipped_rows=v_warn, error_rows=v_error where id=p_batch_id;
  return jsonb_build_object('batch_id',p_batch_id,'total_rows',v_total,'ready_rows',v_ready,'warnings',v_warn,'errors',v_error,'unresolved_tasks',v_unresolved_tasks,'missing_creator',v_missing_creator,'missing_assignee',v_missing_assignee,'missing_parent',v_missing_parent,'missing_actor',v_missing_actor,'duplicate_documents',v_duplicate_docs);
end $$;