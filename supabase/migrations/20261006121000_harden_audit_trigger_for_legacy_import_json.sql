-- Prevent legacy import inserts from failing when request.headers is not valid JSON.
-- Audit user-agent is optional; keep the audit row even when no valid header JSON is available.

create or replace function private.audit_row_changes()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_entity_id uuid;
begin
  v_action := lower(tg_op);
  v_entity_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, old_data, new_data, user_agent
  )
  values (
    v_actor,
    v_action,
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    null
  );

  return coalesce(new, old);
end;
$function$;
