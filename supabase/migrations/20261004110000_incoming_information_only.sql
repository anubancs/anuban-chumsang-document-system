-- หนังสือรับบางเรื่องเป็นเพียงแจ้งเพื่อทราบ ไม่ต้องมอบหมายผู้ปฏิบัติ
alter table public.incoming_documents
  add column if not exists handling_type text not null default 'assignment';

update public.incoming_documents
set handling_type = 'assignment'
where handling_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'incoming_documents_handling_type_check'
  ) then
    alter table public.incoming_documents
      add constraint incoming_documents_handling_type_check
      check (handling_type in ('assignment', 'for_information'));
  end if;
end $$;

create index if not exists incoming_documents_handling_type_idx
  on public.incoming_documents(handling_type);
