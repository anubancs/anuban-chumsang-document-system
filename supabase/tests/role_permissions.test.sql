begin;

select plan(11);

-- Self-contained fixture: never depend on a real/production user.
-- Disable the production auth trigger only inside this transaction so the
-- fixture can provide its own profile row. The ALTER TABLE is rolled back too.
alter table auth.users disable trigger on_auth_user_created;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'rbac-test@example.invalid',
  now(), now(), now(),
  '{}'::jsonb, '{}'::jsonb
);

insert into public.profiles (id, full_name, email, is_active)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'RBAC Test User',
  'rbac-test@example.invalid',
  true
);

insert into public.user_roles (user_id, role_id)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  (select id from public.roles where code='admin')
);

alter table auth.users enable trigger on_auth_user_created;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select is((select private.has_permission('documents.read')),true,'admin read');
select is((select private.has_permission('documents.delete')),true,'admin delete');
select is((select private.has_permission('documents.approve')),true,'admin approve');

update public.user_roles
set role_id=(select id from public.roles where code='director')
where user_id='00000000-0000-0000-0000-000000000001'::uuid;
select is((select private.has_permission('documents.read')),true,'director read');
select is((select private.has_permission('documents.delete')),false,'director no delete');
select is((select private.has_permission('documents.approve')),true,'director approve');

update public.user_roles
set role_id=(select id from public.roles where code='officer')
where user_id='00000000-0000-0000-0000-000000000001'::uuid;
select is((select private.has_permission('documents.read')),true,'officer read');
select is((select private.has_permission('documents.assign')),true,'officer assign');
select is((select private.has_permission('documents.approve')),false,'officer no approve');

update public.user_roles
set role_id=(select id from public.roles where code='staff')
where user_id='00000000-0000-0000-0000-000000000001'::uuid;
select is((select private.has_permission('documents.read')),true,'staff read');
select is((select private.has_permission('documents.assign')),false,'staff no assign');

select * from finish();
rollback;
