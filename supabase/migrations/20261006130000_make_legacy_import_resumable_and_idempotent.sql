-- Make legacy import resumable after a partial import.
-- Existing LEGACY/<DocID> documents are reused; existing assignments/workflows are reused when identifiable.
-- Keep the users.manage permission gate intact.

CREATE OR REPLACE FUNCTION public.validate_legacy_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
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
BEGIN
  IF NOT private.has_permission('users.manage') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT started_by INTO v_started_by FROM public.legacy_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_started_by IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;

  SELECT count(*) INTO v_total FROM public.legacy_import_records WHERE batch_id=p_batch_id;

  SELECT count(*) INTO v_missing_creator
  FROM public.legacy_import_records r
  WHERE r.batch_id=p_batch_id AND r.source_sheet='Documents'
    AND NOT EXISTS (
      SELECT 1 FROM public.legacy_identity_map m
      WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'Created_By','')
        AND m.is_confirmed AND m.current_user_id IS NOT NULL
    );

  SELECT count(*) INTO v_missing_assignee
  FROM public.legacy_import_records r
  WHERE r.batch_id=p_batch_id AND r.source_sheet='Tasks'
    AND NOT EXISTS (
      SELECT 1 FROM public.legacy_identity_map m
      WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'AssigneeID','')
        AND m.is_confirmed AND m.current_user_id IS NOT NULL
    );

  SELECT count(*) INTO v_missing_parent
  FROM public.legacy_import_records r
  WHERE r.batch_id=p_batch_id AND r.source_sheet='Tasks'
    AND NOT EXISTS (
      SELECT 1 FROM public.legacy_import_records d
      WHERE d.batch_id=p_batch_id AND d.source_sheet='Documents'
        AND d.legacy_id=coalesce(r.payload->>'DocID','')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.incoming_documents d2
      WHERE d2.document_no='LEGACY/'||coalesce(r.payload->>'DocID','')
    );

  SELECT count(*) INTO v_missing_actor
  FROM public.legacy_import_records r
  WHERE r.batch_id=p_batch_id AND r.source_sheet='Workflow_Logs'
    AND NOT EXISTS (
      SELECT 1 FROM public.legacy_identity_map m
      WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'ActorID','')
        AND m.is_confirmed AND m.current_user_id IS NOT NULL
    );

  SELECT count(*) INTO v_duplicate_docs
  FROM public.legacy_import_records r
  JOIN public.incoming_documents d ON d.document_no='LEGACY/'||r.legacy_id
  WHERE r.batch_id=p_batch_id AND r.source_sheet='Documents';

  UPDATE public.legacy_import_records r
  SET
    status=CASE
      WHEN r.source_sheet='Documents' AND EXISTS (
        SELECT 1 FROM public.incoming_documents d WHERE d.document_no='LEGACY/'||r.legacy_id
      ) THEN 'imported'
      WHEN r.source_sheet='Documents' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'Created_By','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'error'
      WHEN r.source_sheet='Tasks' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'AssigneeID','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'skipped'
      WHEN r.source_sheet='Tasks' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_import_records d
        WHERE d.batch_id=p_batch_id AND d.source_sheet='Documents'
          AND d.legacy_id=coalesce(r.payload->>'DocID','')
      ) AND NOT EXISTS (
        SELECT 1 FROM public.incoming_documents d2
        WHERE d2.document_no='LEGACY/'||coalesce(r.payload->>'DocID','')
      ) THEN 'skipped'
      WHEN r.source_sheet='Workflow_Logs' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'ActorID','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'skipped'
      ELSE 'staged'
    END,
    target_table=CASE
      WHEN r.source_sheet='Documents' AND EXISTS (
        SELECT 1 FROM public.incoming_documents d WHERE d.document_no='LEGACY/'||r.legacy_id
      ) THEN 'incoming_documents'
      ELSE NULL
    END,
    target_id=CASE
      WHEN r.source_sheet='Documents' THEN (
        SELECT d.id FROM public.incoming_documents d
        WHERE d.document_no='LEGACY/'||r.legacy_id LIMIT 1
      )
      ELSE NULL
    END,
    error_message=CASE
      WHEN r.source_sheet='Documents' AND EXISTS (
        SELECT 1 FROM public.incoming_documents d WHERE d.document_no='LEGACY/'||r.legacy_id
      ) THEN NULL
      WHEN r.source_sheet='Documents' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'Created_By','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'ไม่พบผู้สร้างหนังสือเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      WHEN r.source_sheet='Tasks' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'AssigneeID','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'ไม่พบผู้รับผิดชอบเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      WHEN r.source_sheet='Tasks' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_import_records d
        WHERE d.batch_id=p_batch_id AND d.source_sheet='Documents'
          AND d.legacy_id=coalesce(r.payload->>'DocID','')
      ) AND NOT EXISTS (
        SELECT 1 FROM public.incoming_documents d2
        WHERE d2.document_no='LEGACY/'||coalesce(r.payload->>'DocID','')
      ) THEN 'ไม่พบหนังสือแม่ของงาน DocID='||coalesce(r.payload->>'DocID','')
      WHEN r.source_sheet='Workflow_Logs' AND NOT EXISTS (
        SELECT 1 FROM public.legacy_identity_map m
        WHERE m.batch_id=p_batch_id AND m.legacy_user_id=coalesce(r.payload->>'ActorID','')
          AND m.is_confirmed AND m.current_user_id IS NOT NULL
      ) THEN 'ไม่พบผู้ดำเนินการเดิมในระบบใหม่ หรือยังไม่ได้ยืนยัน Identity Mapping'
      ELSE NULL
    END
  WHERE r.batch_id=p_batch_id;

  SELECT count(*) INTO v_error FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='error';
  SELECT count(*) INTO v_warn FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='skipped';
  SELECT count(*) INTO v_ready FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='staged';

  v_unresolved_tasks := v_missing_assignee + v_missing_parent;

  UPDATE public.legacy_import_batches
  SET status='staged',
      total_rows=v_total,
      imported_rows=(SELECT count(*) FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='imported'),
      skipped_rows=v_warn,
      error_rows=v_error
  WHERE id=p_batch_id;

  RETURN jsonb_build_object(
    'batch_id',p_batch_id,'total_rows',v_total,'ready_rows',v_ready,
    'warnings',v_warn,'errors',v_error,'unresolved_tasks',v_unresolved_tasks,
    'missing_creator',v_missing_creator,'missing_assignee',v_missing_assignee,
    'missing_parent',v_missing_parent,'missing_actor',v_missing_actor,
    'duplicate_documents',v_duplicate_docs
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.execute_legacy_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_batch public.legacy_import_batches%rowtype;
  r record;
  v_target uuid;
  v_parent_id uuid;
  v_existing uuid;
  v_count int := 0;
  v_skipped int := 0;
  v_errors int := 0;
  v_doc_status text;
  v_task_status text;
  v_action text;
  v_ts timestamptz;
  v_file text;
  v_drive_id text;
  v_idx int;
  v_sqlstate text;
  v_detail text;
  v_hint text;
  v_context text;
BEGIN
  IF NOT private.has_permission('users.manage') THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_batch FROM public.legacy_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF v_batch.status IN ('running','completed','completed_with_warnings') THEN RAISE EXCEPTION 'batch already processed'; END IF;

  PERFORM public.validate_legacy_import(p_batch_id);

  IF EXISTS (SELECT 1 FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='error') THEN
    RAISE EXCEPTION 'batch has validation errors; fix mapping and validate again';
  END IF;

  UPDATE public.legacy_import_batches SET status='running' WHERE id=p_batch_id;

  FOR r IN
    SELECT id,legacy_id,payload FROM public.legacy_import_records
    WHERE batch_id=p_batch_id AND source_sheet='Documents' AND status='staged'
    ORDER BY legacy_id
  LOOP
    v_doc_status := CASE WHEN coalesce(r.payload->>'Status','')='มอบหมายแล้ว' THEN 'assigned' ELSE 'received' END;
    v_ts := nullif(r.payload->>'Timestamp','')::timestamptz;

    INSERT INTO public.incoming_documents(
      document_no,received_date,document_date,subject,sender,priority,status,description,
      created_by,created_at,updated_at,sender_document_no,handling_type
    )
    SELECT
      'LEGACY/'||r.legacy_id,
      coalesce(nullif(r.payload->>'Date_In','')::date,current_date),
      nullif(r.payload->>'Date_In','')::date,
      coalesce(nullif(r.payload->>'Subject',''),'(ไม่มีชื่อเรื่อง)'),
      nullif(r.payload->>'From',''),'normal',v_doc_status,
      concat('นำเข้าจากระบบสารบรรณเดิม · Legacy DocID: ',r.legacy_id,
        CASE WHEN nullif(r.payload->>'To','') IS NOT NULL THEN ' · ถึง: '||(r.payload->>'To') ELSE '' END),
      m.current_user_id,coalesce(v_ts,now()),coalesce(v_ts,now()),
      nullif(r.payload->>'RefNo',''),'assignment'
    FROM public.legacy_identity_map m
    WHERE m.batch_id=p_batch_id AND m.legacy_user_id=r.payload->>'Created_By'
      AND m.is_confirmed AND m.current_user_id IS NOT NULL
    RETURNING id INTO v_target;

    IF v_target IS NULL THEN RAISE EXCEPTION 'ไม่พบ created_by mapping สำหรับ Legacy DocID=%',r.legacy_id; END IF;

    UPDATE public.legacy_import_records
    SET status='imported',target_table='incoming_documents',target_id=v_target,error_message=NULL
    WHERE id=r.id;
    v_count:=v_count+1;

    IF nullif(r.payload->>'File_URL','') IS NOT NULL THEN
      v_idx:=1;
      FOR v_file IN SELECT regexp_split_to_table(r.payload->>'File_URL',E'\s*,\s*') LOOP
        v_drive_id := (regexp_match(v_file,'/d/([A-Za-z0-9_-]+)'))[1];
        IF v_drive_id IS NULL THEN v_drive_id := (regexp_match(v_file,'[?&]id=([A-Za-z0-9_-]+)'))[1]; END IF;
        IF v_drive_id IS NOT NULL THEN
          INSERT INTO public.document_files(
            incoming_document_id,file_name,mime_type,file_size,drive_file_id,drive_web_url,uploaded_by
          ) VALUES (v_target,'ไฟล์เดิม '||v_idx,NULL,NULL,v_drive_id,trim(v_file),v_batch.started_by);
          v_idx:=v_idx+1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR r IN
    SELECT id,legacy_id,payload FROM public.legacy_import_records
    WHERE batch_id=p_batch_id AND source_sheet='Tasks' AND status='staged'
    ORDER BY legacy_id
  LOOP
    SELECT target_id INTO v_parent_id
    FROM public.legacy_import_records
    WHERE batch_id=p_batch_id AND source_sheet='Documents'
      AND legacy_id=r.payload->>'DocID' AND status='imported' LIMIT 1;

    IF v_parent_id IS NULL THEN
      SELECT d.id INTO v_parent_id FROM public.incoming_documents d
      WHERE d.document_no='LEGACY/'||coalesce(r.payload->>'DocID','') LIMIT 1;
    END IF;

    IF v_parent_id IS NULL THEN
      UPDATE public.legacy_import_records SET status='skipped',error_message='ไม่พบหนังสือแม่ที่นำเข้า' WHERE id=r.id;
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;

    SELECT current_user_id INTO v_target
    FROM public.legacy_identity_map
    WHERE batch_id=p_batch_id AND legacy_user_id=r.payload->>'AssigneeID'
      AND is_confirmed AND current_user_id IS NOT NULL LIMIT 1;

    IF v_target IS NULL THEN
      UPDATE public.legacy_import_records SET status='skipped',error_message='ไม่พบผู้รับผิดชอบในระบบใหม่' WHERE id=r.id;
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;

    v_task_status := CASE WHEN coalesce(r.payload->>'Status','')='ดำเนินการแล้ว' THEN 'completed' ELSE 'pending' END;

    v_existing := NULL;
    SELECT a.id INTO v_existing
    FROM public.assignments a
    WHERE a.incoming_document_id=v_parent_id AND a.assigned_to=v_target
      AND coalesce(a.note,'')=coalesce(
        concat_ws(E'\n',nullif(r.payload->>'Report_Msg',''),
          CASE WHEN nullif(r.payload->>'Report_File','') IS NOT NULL THEN 'ไฟล์รายงานเดิม: '||(r.payload->>'Report_File') END),'')
    ORDER BY a.created_at LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.legacy_import_records
      SET status='imported',target_table='assignments',target_id=v_existing,error_message=NULL WHERE id=r.id;
      v_count:=v_count+1; CONTINUE;
    END IF;

    INSERT INTO public.assignments(
      incoming_document_id,assigned_to,assigned_by,due_date,status,note,created_at,updated_at
    ) VALUES (
      v_parent_id,v_target,v_batch.started_by,NULL,v_task_status,
      concat_ws(E'\n',nullif(r.payload->>'Report_Msg',''),
        CASE WHEN nullif(r.payload->>'Report_File','') IS NOT NULL THEN 'ไฟล์รายงานเดิม: '||(r.payload->>'Report_File') END),
      coalesce(nullif(r.payload->>'Finish_Time','')::timestamptz,now()),
      coalesce(nullif(r.payload->>'Finish_Time','')::timestamptz,now())
    )
    RETURNING id INTO v_target;

    UPDATE public.legacy_import_records
    SET status='imported',target_table='assignments',target_id=v_target,error_message=NULL WHERE id=r.id;
    v_count:=v_count+1;
  END LOOP;

  FOR r IN
    SELECT id,legacy_id,payload FROM public.legacy_import_records
    WHERE batch_id=p_batch_id AND source_sheet='Workflow_Logs' AND status='staged'
    ORDER BY legacy_id
  LOOP
    SELECT target_id INTO v_parent_id
    FROM public.legacy_import_records
    WHERE batch_id=p_batch_id AND source_sheet='Documents'
      AND legacy_id=r.payload->>'DocID' AND status='imported' LIMIT 1;

    IF v_parent_id IS NULL THEN
      SELECT d.id INTO v_parent_id FROM public.incoming_documents d
      WHERE d.document_no='LEGACY/'||coalesce(r.payload->>'DocID','') LIMIT 1;
    END IF;

    IF v_parent_id IS NULL THEN
      UPDATE public.legacy_import_records SET status='skipped',error_message='ไม่พบหนังสือแม่ที่นำเข้า' WHERE id=r.id;
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;

    SELECT current_user_id INTO v_target
    FROM public.legacy_identity_map
    WHERE batch_id=p_batch_id AND legacy_user_id=r.payload->>'ActorID'
      AND is_confirmed AND current_user_id IS NOT NULL LIMIT 1;

    IF v_target IS NULL THEN
      UPDATE public.legacy_import_records SET status='skipped',error_message='ไม่พบผู้ดำเนินการเดิมในระบบใหม่' WHERE id=r.id;
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;

    v_action:=coalesce(r.payload->>'Action','Legacy');
    v_existing:=NULL;

    IF v_action='Register' THEN
      SELECT w.id INTO v_existing
      FROM public.workflows w
      WHERE w.incoming_document_id=v_parent_id AND lower(w.action)='register' AND w.actor_id=v_target
      ORDER BY w.created_at LIMIT 1;
    ELSE
      SELECT w.id INTO v_existing
      FROM public.workflows w
      WHERE w.incoming_document_id=v_parent_id AND w.action=v_action AND w.actor_id=v_target
        AND coalesce(w.comment,'')=coalesce(nullif(r.payload->>'Comment',''),'')
        AND w.created_at=coalesce(nullif(r.payload->>'Timestamp','')::timestamptz,now())
      ORDER BY w.created_at LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
      UPDATE public.legacy_import_records
      SET status='imported',target_table='workflows',target_id=v_existing,error_message=NULL WHERE id=r.id;
      v_count:=v_count+1; CONTINUE;
    END IF;

    INSERT INTO public.workflows(
      incoming_document_id,from_status,to_status,action,actor_id,comment,created_at
    ) VALUES (
      v_parent_id,NULL,
      CASE v_action WHEN 'Register' THEN 'registered' WHEN 'Command' THEN 'assigned'
        WHEN 'Review' THEN 'in_progress' ELSE 'received' END,
      v_action,v_target,nullif(r.payload->>'Comment',''),
      coalesce(nullif(r.payload->>'Timestamp','')::timestamptz,now())
    )
    RETURNING id INTO v_target;

    UPDATE public.legacy_import_records
    SET status='imported',target_table='workflows',target_id=v_target,error_message=NULL WHERE id=r.id;
    v_count:=v_count+1;
  END LOOP;

  UPDATE public.legacy_import_batches
  SET status=CASE WHEN EXISTS (
        SELECT 1 FROM public.legacy_import_records
        WHERE batch_id=p_batch_id AND status IN ('skipped','error')
      ) THEN 'completed_with_warnings' ELSE 'completed' END,
      imported_rows=(SELECT count(*) FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='imported'),
      skipped_rows=(SELECT count(*) FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='skipped'),
      error_rows=(SELECT count(*) FROM public.legacy_import_records WHERE batch_id=p_batch_id AND status='error'),
      completed_at=now()
  WHERE id=p_batch_id;

  RETURN (
    SELECT jsonb_build_object('batch_id',id,'status',status,'total_rows',total_rows,
      'imported_rows',imported_rows,'skipped_rows',skipped_rows,'error_rows',error_rows)
    FROM public.legacy_import_batches WHERE id=p_batch_id
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_sqlstate=returned_sqlstate,v_detail=pg_exception_detail,
    v_hint=pg_exception_hint,v_context=pg_exception_context;
  UPDATE public.legacy_import_batches SET status='failed',completed_at=now() WHERE id=p_batch_id;
  RAISE EXCEPTION 'Legacy import failed [%]: % | detail=% | hint=% | context=%',
    v_sqlstate,sqlerrm,coalesce(v_detail,''),coalesce(v_hint,''),coalesce(v_context,'');
END
$function$;