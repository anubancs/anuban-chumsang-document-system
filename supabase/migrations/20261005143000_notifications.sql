create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null, type text not null, title text not null, message text not null,
  entity_type text, entity_id uuid, read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(recipient_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using ((select auth.uid()) = recipient_id);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
end $$;
create or replace function public.notify_users_with_permission(p_permission text,p_actor_id uuid,p_type text,p_title text,p_message text,p_entity_type text,p_entity_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id)
select distinct ur.user_id,p_actor_id,p_type,p_title,p_message,p_entity_type,p_entity_id from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id where p.code=p_permission and ur.user_id is distinct from p_actor_id; end $$;
create or replace function public.notify_document_change() returns trigger language plpgsql security definer set search_path=public as $$
begin if tg_op='INSERT' then perform public.notify_users_with_permission('documents.read',new.created_by,case when tg_table_name='incoming_documents' then 'incoming_document' else 'outgoing_document' end,case when tg_table_name='incoming_documents' then 'มีหนังสือรับใหม่' else 'มีหนังสือส่งใหม่' end,coalesce(new.document_no,'')||' — '||coalesce(new.subject,''),tg_table_name,new.id); end if; return new; end $$;
drop trigger if exists notify_incoming_document on public.incoming_documents; create trigger notify_incoming_document after insert on public.incoming_documents for each row execute function public.notify_document_change();
drop trigger if exists notify_outgoing_document on public.outgoing_documents; create trigger notify_outgoing_document after insert on public.outgoing_documents for each row execute function public.notify_document_change();
create or replace function public.notify_assignment_change() returns trigger language plpgsql security definer set search_path=public as $$
declare v_doc_no text; v_subject text; begin if tg_op='INSERT' then
 if new.incoming_document_id is not null then select document_no,subject into v_doc_no,v_subject from public.incoming_documents where id=new.incoming_document_id;
 elsif new.outgoing_document_id is not null then select document_no,subject into v_doc_no,v_subject from public.outgoing_documents where id=new.outgoing_document_id; end if;
 insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id) values(new.assigned_to,new.assigned_by,'assignment','มีการมอบหมายงานใหม่',coalesce(v_doc_no,'')||' — '||coalesce(v_subject,''),'assignments',new.id); end if; return new; end $$;
drop trigger if exists notify_assignment on public.assignments; create trigger notify_assignment after insert on public.assignments for each row execute function public.notify_assignment_change();
create or replace function public.notify_leave_change() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_status text; begin if tg_op='INSERT' then
 select coalesce(full_name,email,'ผู้ใช้งาน') into v_name from public.profiles where id=new.requested_by;
 perform public.notify_users_with_permission('leave.approve',new.requested_by,'leave_request','มีคำขอลาใหม่',coalesce(v_name,'ผู้ใช้งาน')||' — '||coalesce(new.request_no,''),'leave_requests',new.id);
 elsif tg_op='UPDATE' and new.status is distinct from old.status then
 v_status=case new.status when 'approved' then 'อนุมัติ' when 'rejected' then 'ไม่อนุมัติ' when 'cancelled' then 'ยกเลิก' when 'pending' then 'รอดำเนินการ' else new.status end;
 insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id) values(new.requested_by,new.approver_id,'leave_status','สถานะการลาของคุณเปลี่ยนแปลง',coalesce(new.request_no,'')||' — '||v_status,'leave_requests',new.id); end if; return new; end $$;
drop trigger if exists notify_leave_request on public.leave_requests; create trigger notify_leave_request after insert or update of status on public.leave_requests for each row execute function public.notify_leave_change();
revoke all on function public.notify_users_with_permission(text,uuid,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.notify_document_change() from public,anon,authenticated;
revoke all on function public.notify_assignment_change() from public,anon,authenticated;
revoke all on function public.notify_leave_change() from public,anon,authenticated;