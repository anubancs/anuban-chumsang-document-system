-- Initial schema for Anuban Chumsang Document System
-- Actual files live in Google Drive. Supabase stores metadata only.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.departments (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 description text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.roles (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 description text, is_system boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.permissions (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 description text, created_at timestamptz not null default now()
);
create table if not exists public.role_permissions (
 role_id uuid not null references public.roles(id) on delete cascade,
 permission_id uuid not null references public.permissions(id) on delete cascade,
 primary key (role_id, permission_id)
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, employee_code text unique,
 full_name text not null, email text, phone text, department_id uuid references public.departments(id) on delete set null,
 position text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
 user_id uuid not null references public.profiles(id) on delete cascade,
 role_id uuid not null references public.roles(id) on delete cascade,
 assigned_at timestamptz not null default now(), assigned_by uuid references public.profiles(id) on delete set null,
 primary key (user_id, role_id)
);
create table if not exists public.incoming_documents (
 id uuid primary key default gen_random_uuid(), document_no text not null unique,
 received_date date not null default current_date, document_date date, subject text not null, sender text,
 recipient_department_id uuid references public.departments(id) on delete set null,
 priority text not null default 'normal' check (priority in ('normal','urgent','very_urgent')),
 status text not null default 'received' check (status in ('received','registered','assigned','in_progress','completed','archived','cancelled')),
 description text, created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.outgoing_documents (
 id uuid primary key default gen_random_uuid(), document_no text not null unique,
 document_date date not null default current_date, subject text not null, recipient text,
 sender_department_id uuid references public.departments(id) on delete set null,
 priority text not null default 'normal' check (priority in ('normal','urgent','very_urgent')),
 status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','archived','cancelled')),
 description text, created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.document_files (
 id uuid primary key default gen_random_uuid(), incoming_document_id uuid references public.incoming_documents(id) on delete cascade,
 outgoing_document_id uuid references public.outgoing_documents(id) on delete cascade, file_name text not null,
 mime_type text, file_size bigint, drive_file_id text not null unique, drive_web_url text, drive_parent_id text,
 uploaded_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
 constraint document_files_one_parent check ((incoming_document_id is not null)::int + (outgoing_document_id is not null)::int = 1)
);
create table if not exists public.workflows (
 id uuid primary key default gen_random_uuid(), incoming_document_id uuid references public.incoming_documents(id) on delete cascade,
 outgoing_document_id uuid references public.outgoing_documents(id) on delete cascade, from_status text, to_status text not null,
 action text not null, actor_id uuid not null references public.profiles(id) on delete restrict, comment text,
 created_at timestamptz not null default now(),
 constraint workflows_one_parent check ((incoming_document_id is not null)::int + (outgoing_document_id is not null)::int = 1)
);
create table if not exists public.assignments (
 id uuid primary key default gen_random_uuid(), incoming_document_id uuid references public.incoming_documents(id) on delete cascade,
 outgoing_document_id uuid references public.outgoing_documents(id) on delete cascade, assigned_to uuid not null references public.profiles(id) on delete restrict,
 assigned_by uuid not null references public.profiles(id) on delete restrict, due_date date,
 status text not null default 'pending' check (status in ('pending','accepted','in_progress','completed','cancelled')),
 note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint assignments_one_parent check ((incoming_document_id is not null)::int + (outgoing_document_id is not null)::int = 1)
);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null,
 action text not null, entity_type text not null, entity_id uuid, old_data jsonb, new_data jsonb,
 ip_address inet, user_agent text, created_at timestamptz not null default now()
);

create index if not exists idx_profiles_department on public.profiles(department_id);
create index if not exists idx_incoming_status_date on public.incoming_documents(status, received_date desc);
create index if not exists idx_incoming_department on public.incoming_documents(recipient_department_id);
create index if not exists idx_outgoing_status_date on public.outgoing_documents(status, document_date desc);
create index if not exists idx_files_incoming on public.document_files(incoming_document_id);
create index if not exists idx_files_outgoing on public.document_files(outgoing_document_id);
create index if not exists idx_assignments_assigned_to on public.assignments(assigned_to, status);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security invoker set search_path=public as $$
begin insert into public.profiles(id,full_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1),'ผู้ใช้งาน'),new.email) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.roles(code,name,description,is_system) values
('admin','ผู้ดูแลระบบ','จัดการระบบและสิทธิ์ทั้งหมด',true),('director','ผู้บริหาร','ตรวจสอบและอนุมัติเอกสาร',true),
('officer','เจ้าหน้าที่สารบรรณ','รับ-ส่ง ลงทะเบียน และติดตามเอกสาร',true),('staff','บุคลากร','รับผิดชอบและดำเนินการเอกสาร',true)
on conflict(code) do nothing;
insert into public.permissions(code,name,description) values
('documents.read','ดูเอกสาร','อ่านเอกสารที่มีสิทธิ์เข้าถึง'),('documents.create','สร้างเอกสาร','สร้างรายการเอกสาร'),
('documents.update','แก้ไขเอกสาร','แก้ไขรายการเอกสาร'),('documents.delete','ลบเอกสาร','ลบ/ยกเลิกเอกสาร'),
('documents.assign','มอบหมายเอกสาร','มอบหมายผู้รับผิดชอบ'),('documents.approve','อนุมัติเอกสาร','อนุมัติเอกสารออก'),
('users.manage','จัดการผู้ใช้','จัดการบัญชีและบทบาท'),('settings.manage','จัดการระบบ','จัดการข้อมูลตั้งค่าระบบ')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='admin' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='director' and p.code in ('documents.read','documents.create','documents.update','documents.assign','documents.approve') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='officer' and p.code in ('documents.read','documents.create','documents.update','documents.assign') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='staff' and p.code in ('documents.read','documents.create','documents.update') on conflict do nothing;

alter table public.departments enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.incoming_documents enable row level security;
alter table public.outgoing_documents enable row level security;
alter table public.document_files enable row level security;
alter table public.workflows enable row level security;
alter table public.assignments enable row level security;
alter table public.audit_logs enable row level security;

create or replace function private.has_permission(permission_code text) returns boolean language sql stable security definer set search_path=public,private as $$
select exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id where ur.user_id=(select auth.uid()) and p.code=permission_code); $$;
revoke all on function private.has_permission(text) from public;
grant execute on function private.has_permission(text) to authenticated;

create policy departments_authenticated_read on public.departments for select to authenticated using(true);
create policy roles_authenticated_read on public.roles for select to authenticated using(true);
create policy permissions_authenticated_read on public.permissions for select to authenticated using(true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using((select private.has_permission('users.manage')));
create policy profiles_self_or_admin_select on public.profiles for select to authenticated using((select auth.uid())=id or (select private.has_permission('users.manage')));
create policy profiles_self_or_admin_update on public.profiles for update to authenticated using((select auth.uid())=id or (select private.has_permission('users.manage'))) with check((select auth.uid())=id or (select private.has_permission('users.manage')));
create policy user_roles_admin_select on public.user_roles for select to authenticated using((select auth.uid())=user_id or (select private.has_permission('users.manage')));
create policy incoming_read on public.incoming_documents for select to authenticated using((select private.has_permission('documents.read')));
create policy incoming_insert on public.incoming_documents for insert to authenticated with check((select private.has_permission('documents.create')) and (select auth.uid())=created_by);
create policy incoming_update on public.incoming_documents for update to authenticated using((select private.has_permission('documents.update'))) with check((select private.has_permission('documents.update')));
create policy incoming_delete on public.incoming_documents for delete to authenticated using((select private.has_permission('documents.delete')));
create policy outgoing_read on public.outgoing_documents for select to authenticated using((select private.has_permission('documents.read')));
create policy outgoing_insert on public.outgoing_documents for insert to authenticated with check((select private.has_permission('documents.create')) and (select auth.uid())=created_by);
create policy outgoing_update on public.outgoing_documents for update to authenticated using((select private.has_permission('documents.update'))) with check((select private.has_permission('documents.update')));
create policy outgoing_delete on public.outgoing_documents for delete to authenticated using((select private.has_permission('documents.delete')));
create policy files_read on public.document_files for select to authenticated using((select private.has_permission('documents.read')));
create policy files_insert on public.document_files for insert to authenticated with check((select private.has_permission('documents.create')) and (select auth.uid())=uploaded_by);
create policy files_delete on public.document_files for delete to authenticated using((select private.has_permission('documents.delete')));
create policy workflows_read on public.workflows for select to authenticated using((select private.has_permission('documents.read')));
create policy workflows_insert on public.workflows for insert to authenticated with check((select private.has_permission('documents.update')) and (select auth.uid())=actor_id);
create policy assignments_read on public.assignments for select to authenticated using(assigned_to=(select auth.uid()) or assigned_by=(select auth.uid()) or (select private.has_permission('documents.assign')));
create policy assignments_insert on public.assignments for insert to authenticated with check((select private.has_permission('documents.assign')) and (select auth.uid())=assigned_by);
create policy assignments_update on public.assignments for update to authenticated using(assigned_to=(select auth.uid()) or (select private.has_permission('documents.assign'))) with check(assigned_to=(select auth.uid()) or (select private.has_permission('documents.assign')));
create policy audit_read on public.audit_logs for select to authenticated using((select private.has_permission('users.manage')));
