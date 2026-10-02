-- Harden SECURITY DEFINER functions against search_path hijacking.

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
  v_headers jsonb;
begin
  v_action := lower(tg_op);
  v_entity_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
  begin
    v_headers := pg_catalog.current_setting('request.headers', true)::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data, user_agent)
  values (
    v_actor, v_action, tg_table_name, v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    v_headers ->> 'user-agent'
  );
  return coalesce(new, old);
end;
$function$;

create or replace function private.bootstrap_first_admin()
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.user_roles limit 1) then return false; end if;
  select id into v_role_id from public.roles where code='admin' limit 1;
  if v_role_id is null then raise exception 'Admin role not found'; end if;
  insert into public.user_roles(user_id,role_id,assigned_by) values(v_uid,v_role_id,v_uid);
  return true;
end;
$function$;

create or replace function private.has_any_user_role()
returns boolean
language sql stable security definer
set search_path=''
as $function$
  select exists(select 1 from public.user_roles);
$function$;

create or replace function private.has_permission(permission_code text)
returns boolean
language sql stable security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id
    join public.permissions p on p.id=rp.permission_id
    where ur.user_id=(select auth.uid())
      and p.code=permission_code
  );
$function$;

create or replace function public.generate_document_no(p_document_type text, p_document_date date)
returns text
language plpgsql security definer set search_path=''
as $function$
declare
  v_year integer := extract(year from coalesce(p_document_date,current_date))::integer;
  v_next bigint;
  v_prefix text;
begin
  if p_document_type not in ('incoming','outgoing') then raise exception 'Invalid document type'; end if;
  v_prefix := case when p_document_type='incoming' then 'IN' else 'OUT' end;
  insert into public.document_sequences(document_type,year,last_number)
  values(p_document_type,v_year,1)
  on conflict(document_type,year)
  do update set last_number=public.document_sequences.last_number+1,updated_at=now()
  returning last_number into v_next;
  return format('%s-%s-%s',v_prefix,v_year,lpad(v_next::text,6,'0'));
end;
$function$;

create or replace function public.set_document_no()
returns trigger
language plpgsql security definer set search_path=''
as $function$
begin
  if new.document_no is null or btrim(new.document_no)='' then
    new.document_no := public.generate_document_no(
      case when tg_table_name='incoming_documents' then 'incoming' else 'outgoing' end,
      case when tg_table_name='incoming_documents' then new.received_date else new.document_date end
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.audit_row_changes() from public, anon, authenticated;
revoke all on function private.bootstrap_first_admin() from public, anon, authenticated;
revoke all on function private.has_any_user_role() from public, anon, authenticated;
revoke all on function private.has_permission(text) from public, anon, authenticated;
revoke all on function public.generate_document_no(text,date) from public, anon, authenticated;
revoke all on function public.set_document_no() from public, anon, authenticated;
