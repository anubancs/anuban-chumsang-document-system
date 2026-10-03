begin;

select plan(11);

-- Use the project's own auth.users trigger to create the profile and initial admin role.
-- Everything is inside the test transaction and is rolled back by pgTAP.
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
