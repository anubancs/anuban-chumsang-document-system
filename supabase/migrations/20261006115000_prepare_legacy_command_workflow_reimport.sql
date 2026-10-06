-- Prepare legacy Action=Command workflow rows for re-import.
-- These rows are not deleted or transformed automatically; they remain staged
-- so the import engine can preserve them as workflow history.
update public.legacy_import_records
set status = 'staged',
    error_message = null,
    target_table = null,
    target_id = null
where source_sheet = 'Workflow_Logs'
  and status = 'skipped'
  and coalesce(payload->>'Action','') = 'Command'
  and batch_id in (
    '4fd7d774-6b81-44c0-9562-8112c9972182',
    'c092ca70-107c-428b-a389-4866a103219b'
  );
