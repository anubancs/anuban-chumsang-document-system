create or replace function private.enforce_outgoing_approval()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status in ('approved','sent') and old.status is distinct from new.status then
    if not private.has_permission('documents.approve') then
      raise exception 'ผู้ใช้งานนี้ไม่มีสิทธิ์อนุมัติหนังสือส่ง' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_outgoing_approval() from public, anon, authenticated;

drop trigger if exists trg_enforce_outgoing_approval on public.outgoing_documents;

create trigger trg_enforce_outgoing_approval
before update of status on public.outgoing_documents
for each row
execute function private.enforce_outgoing_approval();
