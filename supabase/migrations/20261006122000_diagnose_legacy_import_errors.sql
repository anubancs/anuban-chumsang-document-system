-- Preserve the import engine behavior but expose PostgreSQL diagnostics when a legacy row fails.
-- This is intentionally additive: permission checks and transaction safety remain unchanged.

create or replace function public.execute_legacy_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_batch public.legacy_import_batches%rowtype;
  r record;
  v_target uuid;
  v_count int := 0;
  v_skipped int := 0;
  v_errors int := 0;
  v_action text;
  v_doc_status text;
  v_task_status text;
  v_ts timestamptz;
  v_file text;
  v_drive_id text;
  v_idx int;
  v_sqlstate text;
  v_detail text;
  v_hint text;
  v_context text;
begin
  if not private.has_permission('users.manage') then raise exception 'permission denied'; end if;
  select * into v_batch from public.legacy_import_batches where id=p_batch_id for update;
  if v_batch.id is null then raise exception 'batch not found'; end if;
  if v_batch.status in ('running','completed','completed_with_warnings') then raise exception 'batch already processed'; end if;

  perform public.validate_legacy_import(p_batch_id);
  if exists(select 1 from public.legacy_import_records where batch_id=p_batch_id and status='error') then
    raise exception 'batch has validation errors; fix mapping and validate again';
  end if;

  update public.legacy_import_batches set status='running' where id=p_batch_id;

  for r in select * from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Documents' and status='staged' order by legacy_id loop
    v_doc_status := case when coalesce(r.payload->>'Status','')='มอบหมายแล้ว' then 'assigned' else 'received' end;
    v_ts := nullif(r.payload->>'Timestamp','')::timestamptz;
    insert into public.incoming_documents(
      document_no,received_date,document_date,subject,sender,priority,status,description,
      created_by,created_at,updated_at,sender_document_no,handling_type
    )
    select
      'LEGACY/'||r.legacy_id,
      coalesce(nullif(r.payload->>'Date_In','')::date,current_date),
      nullif(r.payload->>'Date_In','')::date,
      coalesce(nullif(r.payload->>'Subject',''),'(ไม่มีชื่อเรื่อง)'),
      nullif(r.payload->>'From',''),'normal',v_doc_status,
      concat('นำเข้าจากระบบสารบรรณเดิม · Legacy DocID: ',r.legacy_id,
        case when nullif(r.payload->>'To','') is not null then ' · ถึง: '||r.payload->>'To' else '' end),
      m.current_user_id,coalesce(v_ts,now()),coalesce(v_ts,now()),
      nullif(r.payload->>'RefNo',''),'assignment'
    from public.legacy_identity_map m
    where m.batch_id=p_batch_id and m.legacy_user_id=r.payload->>'Created_By'
      and m.is_confirmed and m.current_user_id is not null
    returning id into v_target;
    if v_target is null then raise exception 'ไม่พบ created_by mapping สำหรับ Legacy DocID=%',r.legacy_id; end if;
    update public.legacy_import_records set status='imported',target_table='incoming_documents',target_id=v_target where id=r.id;
    v_count:=v_count+1;

    if nullif(r.payload->>'File_URL','') is not null then
      v_idx:=1;
      for v_file in select regexp_split_to_table(r.payload->>'File_URL',E'\s*,\s*') loop
        v_drive_id := (regexp_match(v_file,'/d/([A-Za-z0-9_-]+)'))[1];
        if v_drive_id is null then v_drive_id := (regexp_match(v_file,'[?&]id=([A-Za-z0-9_-]+)'))[1]; end if;
        if v_drive_id is not null then
          insert into public.document_files(incoming_document_id,file_name,mime_type,file_size,drive_file_id,drive_web_url,uploaded_by)
          values(v_target,'ไฟล์เดิม '||v_idx,null,null,v_drive_id,trim(v_file),v_batch.started_by);
          v_idx:=v_idx+1;
        end if;
      end loop;
    end if;
  end loop;

  for r in select * from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Tasks' and status='staged' order by legacy_id loop
    select target_id into v_target from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Documents' and legacy_id=r.payload->>'DocID' and status='imported';
    if v_target is null then update public.legacy_import_records set status='skipped',error_message='ไม่พบหนังสือแม่ที่นำเข้า' where id=r.id; v_skipped:=v_skipped+1; continue; end if;
    select current_user_id into v_target from public.legacy_identity_map where batch_id=p_batch_id and legacy_user_id=r.payload->>'AssigneeID' and is_confirmed and current_user_id is not null;
    if v_target is null then update public.legacy_import_records set status='skipped',error_message='ไม่พบผู้รับผิดชอบในระบบใหม่' where id=r.id; v_skipped:=v_skipped+1; continue; end if;
    v_task_status := case when coalesce(r.payload->>'Status','')='ดำเนินการแล้ว' then 'completed' else 'pending' end;
    insert into public.assignments(incoming_document_id,assigned_to,assigned_by,due_date,status,note,created_at,updated_at)
    values(
      (select target_id from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Documents' and legacy_id=r.payload->>'DocID' and status='imported'),
      v_target,v_batch.started_by,null,v_task_status,
      concat_ws(E'\n',nullif(r.payload->>'Report_Msg',''),case when nullif(r.payload->>'Report_File','') is not null then 'ไฟล์รายงานเดิม: '||r.payload->>'Report_File' end),
      coalesce(nullif(r.payload->>'Finish_Time','')::timestamptz,now()),coalesce(nullif(r.payload->>'Finish_Time','')::timestamptz,now())
    ) returning id into v_target;
    update public.legacy_import_records set status='imported',target_table='assignments',target_id=v_target where id=r.id;
    v_count:=v_count+1;
  end loop;

  for r in select * from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Workflow_Logs' and status='staged' order by legacy_id loop
    select target_id into v_target from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Documents' and legacy_id=r.payload->>'DocID' and status='imported';
    if v_target is null then update public.legacy_import_records set status='skipped',error_message='ไม่พบหนังสือแม่ที่นำเข้า' where id=r.id; v_skipped:=v_skipped+1; continue; end if;
    if not exists(select 1 from public.legacy_identity_map m where m.batch_id=p_batch_id and m.legacy_user_id=r.payload->>'ActorID' and m.is_confirmed and m.current_user_id is not null) then
      update public.legacy_import_records set status='skipped',error_message='ไม่พบผู้ดำเนินการเดิมในระบบใหม่' where id=r.id; v_skipped:=v_skipped+1; continue;
    end if;
    select current_user_id into v_target from public.legacy_identity_map where batch_id=p_batch_id and legacy_user_id=r.payload->>'ActorID' and is_confirmed and current_user_id is not null;
    v_action:=coalesce(r.payload->>'Action','Legacy');
    insert into public.workflows(incoming_document_id,from_status,to_status,action,actor_id,comment,created_at)
    values(
      (select target_id from public.legacy_import_records where batch_id=p_batch_id and source_sheet='Documents' and legacy_id=r.payload->>'DocID' and status='imported'),
      null,case v_action when 'Register' then 'registered' when 'Command' then 'assigned' when 'Review' then 'in_progress' else 'received' end,
      v_action,v_target,nullif(r.payload->>'Comment',''),coalesce(nullif(r.payload->>'Timestamp','')::timestamptz,now())
    ) returning id into v_target;
    update public.legacy_import_records set status='imported',target_table='workflows',target_id=v_target where id=r.id;
    v_count:=v_count+1;
  end loop;

  update public.legacy_import_batches
  set status=case when exists(select 1 from public.legacy_import_records where batch_id=p_batch_id and status in ('skipped','error')) then 'completed_with_warnings' else 'completed' end,
      imported_rows=(select count(*) from public.legacy_import_records where batch_id=p_batch_id and status='imported'),
      skipped_rows=(select count(*) from public.legacy_import_records where batch_id=p_batch_id and status='skipped'),
      error_rows=(select count(*) from public.legacy_import_records where batch_id=p_batch_id and status='error'),
      completed_at=now()
  where id=p_batch_id;

  return (select jsonb_build_object('batch_id',id,'status',status,'total_rows',total_rows,'imported_rows',imported_rows,'skipped_rows',skipped_rows,'error_rows',error_rows)
          from public.legacy_import_batches where id=p_batch_id);

exception when others then
  get stacked diagnostics v_sqlstate=returned_sqlstate,v_detail=pg_exception_detail,v_hint=pg_exception_hint,v_context=pg_exception_context;
  update public.legacy_import_batches set status='failed',completed_at=now() where id=p_batch_id;
  raise exception 'Legacy import failed [%]: % | detail=% | hint=% | context=%',v_sqlstate,sqlerrm,coalesce(v_detail,''),coalesce(v_hint,''),coalesce(v_context,'');
end
$function$;
