begin;

create or replace function public.notify_due_assignments() returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0; v_rows integer:=0;
begin
 insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id)
 select a.assigned_to,a.assigned_by,'assignment_due',
 case when a.due_date=current_date then '⏰ งานครบกำหนดวันนี้' else '⏰ งานใกล้ครบกำหนด' end,
 coalesce(d.document_no,'')||' — '||coalesce(d.subject,'')||' · ครบกำหนด '||to_char(a.due_date,'DD/MM/YYYY'),'assignments',a.id
 from public.assignments a left join public.incoming_documents d on d.id=a.incoming_document_id
 where a.due_date between current_date and current_date+1 and a.status in ('pending','accepted','in_progress')
 and not exists(select 1 from public.notifications n where n.recipient_id=a.assigned_to and n.type='assignment_due' and n.entity_type='assignments' and n.entity_id=a.id and n.created_at>=current_date);
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id)
 select distinct ur.user_id,a.assigned_by,'assignment_due_management',
 case when a.due_date=current_date then '⏰ งานครบกำหนดวันนี้' else '⏰ งานใกล้ครบกำหนด' end,
 coalesce(d.document_no,'')||' — '||coalesce(d.subject,'')||' · ผู้รับผิดชอบ: '||coalesce(p.full_name,'ผู้ใช้งาน')||' · ครบกำหนด '||to_char(a.due_date,'DD/MM/YYYY'),'assignments',a.id
 from public.assignments a left join public.incoming_documents d on d.id=a.incoming_document_id left join public.profiles p on p.id=a.assigned_to
 join public.user_roles ur on true join public.roles r on r.id=ur.role_id
 where a.due_date between current_date and current_date+1 and a.status in ('pending','accepted','in_progress')
 and r.code in ('admin','director','deputy_director') and ur.user_id is distinct from a.assigned_by and ur.user_id is distinct from a.assigned_to
 and not exists(select 1 from public.notifications n where n.recipient_id=ur.user_id and n.type='assignment_due_management' and n.entity_type='assignments' and n.entity_id=a.id and n.created_at>=current_date);
 get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
 return v_count;
end; $$;

revoke all on function public.notify_due_assignments() from public,anon;
grant execute on function public.notify_due_assignments() to authenticated;

commit;