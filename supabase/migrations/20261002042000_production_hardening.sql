-- Production hardening: document numbering, bootstrap and audit triggers

create table if not exists public.document_sequences (
  document_type text not null check (document_type in ('incoming','outgoing')),
  year integer not null,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (document_type, year)
);
alter table public.document_sequences disable row level security;
revoke all on public.document_sequences from anon, authenticated;

create or replace function public.generate_document_no(p_document_type text, p_document_date date)
returns text
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_year integer := extract(year from coalesce(p_document_date,current_date))::integer; v_next bigint; v_prefix text;
begin
  if p_document_type not in ('incoming','outgoing') then raise exception 'Invalid document type'; end if;
  v_prefix := case when p_document_type='incoming' then 'IN' else 'OUT' end;
  insert into public.document_sequences(document_type,year,last_number) values(p_document_type,v_year,1)
  on conflict(document_type,year) do update set last_number=public.document_sequences.last_number+1,updated_at=now()
  returning last_number into v_next;
  return format('%s-%s-%s',v_prefix,v_year,lpad(v_next::text,6,'0'));
end $$;
revoke all on function public.generate_document_no(text,date) from public,anon,authenticated;

create or replace function public.set_document_no()
returns trigger language plpgsql security definer set search_path=public,pg_catalog
as $$
begin
  if new.document_no is null or btrim(new.document_no)='' then
    new.document_no:=public.generate_document_no(
      case when tg_table_name='incoming_documents' then 'incoming' else 'outgoing' end,
      case when tg_table_name='incoming_documents' then new.received_date else new.document_date end);
  end if;
  return new;
end $$;
revoke all on function public.set_document_no() from public,anon,authenticated;

drop trigger if exists trg_incoming_document_no on public.incoming_documents;
create trigger trg_incoming_document_no before insert on public.incoming_documents for each row execute function public.set_document_no();
drop trigger if exists trg_outgoing_document_no on public.outgoing_documents;
create trigger trg_outgoing_document_no before insert on public.outgoing_documents for each row execute function public.set_document_no();

create unique index if not exists incoming_documents_document_no_uidx on public.incoming_documents(document_no);
create unique index if not exists outgoing_documents_document_no_uidx on public.outgoing_documents(document_no);

create or replace function private.bootstrap_first_admin()
returns boolean language plpgsql security definer set search_path=public,private,pg_catalog
as $$
declare v_uid uuid:=auth.uid(); v_role_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.user_roles limit 1) then return false; end if;
  select id into v_role_id from public.roles where code='admin' limit 1;
  if v_role_id is null then raise exception 'Admin role not found'; end if;
  insert into public.user_roles(user_id,role_id,assigned_by) values(v_uid,v_role_id,v_uid);
  return true;
end $$;
revoke all on function private.bootstrap_first_admin() from public;
grant execute on function private.bootstrap_first_admin() to authenticated;

create or replace function private.audit_row_changes()
returns trigger language plpgsql security definer set search_path=public,private,pg_catalog
as $$
declare v_actor uuid:=auth.uid(); v_headers jsonb:='{}'::jsonb; v_entity_id uuid;
begin
  v_entity_id:=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
  begin v_headers:=current_setting('request.headers',true)::jsonb; exception when others then null; end;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data,user_agent)
  values(v_actor,lower(tg_op),tg_table_name,v_entity_id,
    case when tg_op in('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in('INSERT','UPDATE') then to_jsonb(new) end,
    v_headers->>'user-agent');
  return coalesce(new,old);
end $$;
revoke all on function private.audit_row_changes() from public;

drop trigger if exists trg_audit_incoming on public.incoming_documents;
create trigger trg_audit_incoming after insert or update or delete on public.incoming_documents for each row execute function private.audit_row_changes();
drop trigger if exists trg_audit_outgoing on public.outgoing_documents;
create trigger trg_audit_outgoing after insert or update or delete on public.outgoing_documents for each row execute function private.audit_row_changes();
drop trigger if exists trg_audit_assignments on public.assignments;
create trigger trg_audit_assignments after insert or update or delete on public.assignments for each row execute function private.audit_row_changes();
drop trigger if exists trg_audit_user_roles on public.user_roles;
create trigger trg_audit_user_roles after insert or update or delete on public.user_roles for each row execute function private.audit_row_changes();
