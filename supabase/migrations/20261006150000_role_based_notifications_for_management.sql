begin;

create or replace function public.notify_management(p_actor_id uuid,p_type text,p_title text,p_message text,p_entity_type text,p_entity_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id)
 select distinct ur.user_id,p_actor_id,p_type,p_title,p_message,p_entity_type,p_entity_id
 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where r.code in ('admin','director','deputy_director') and ur.user_id is distinct from p_actor_id;
end; $$;

create or replace function public.notify_document_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_title text; v_message text; v_type text;
begin
 if tg_op='INSERT' then
  v_type:=case when tg_table_name='incoming_documents' then 'incoming_document' else 'outgoing_document' end;
  v_title:=case when tg_table_name='incoming_documents' then 'มีหนังสือรับใหม่' else 'มีหนังสือส่งใหม่' end;
  if coalesce(new.priority,'normal')='most_urgent' then v_title:='🚨 ด่วนที่สุด — '||v_title;
  elsif coalesce(new.priority,'normal')='very_urgent' then v_title:='🔴 ด่วนมาก — '||v_title;
  elsif coalesce(new.priority,'normal')='urgent' then v_title:='🟠 ด่วน — '||v_title; end if;
  v_message:=coalesce(new.document_no,'')||' — '||coalesce(new.subject,'');
  perform public.notify_management(new.created_by,v_type,v_title,v_message,tg_table_name,new.id);
 end if; return new;
end; $$;

create or replace function public.notify_assignment_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_doc_no text; v_subject text; v_message text;
begin
 if tg_op='INSERT' then
  if new.incoming_document_id is not null then select document_no,subject into v_doc_no,v_subject from public.incoming_documents where id=new.incoming_document_id;
  elsif new.outgoing_document_id is not null then select document_no,subject into v_doc_no,v_subject from public.outgoing_documents where id=new.outgoing_document_id; end if;
  v_message:=coalesce(v_doc_no,'')||' — '||coalesce(v_subject,'');
  insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id) values(new.assigned_to,new.assigned_by,'assignment','มีการมอบหมายงานใหม่',v_message,'assignments',new.id);
  insert into public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id)
  select distinct ur.user_id,new.assigned_by,'assignment_management','มีการมอบหมายงานใหม่',v_message,'assignments',new.id
  from public.user_roles ur join public.roles r on r.id=ur.role_id
  where r.code in ('admin','director','deputy_director') and ur.user_id is distinct from new.assigned_by and ur.user_id is distinct from new.assigned_to;
 end if; return new;
end; $$;

revoke all on function public.notify_management(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.notify_management(uuid,text,text,text,text,uuid) to postgres;
revoke all on function public.notify_document_change() from public,anon,authenticated;
revoke all on function public.notify_assignment_change() from public,anon,authenticated;

commit;