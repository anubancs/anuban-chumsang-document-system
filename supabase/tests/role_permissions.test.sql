begin;

-- Execute against the known bootstrap admin identity inside a transaction only.
-- Every role mutation is rolled back at the end.
select plan(11);
select set_config('request.jwt.claim.sub','55a76687-89ca-4bb7-800b-f227a5d970d6',true);

select is((select private.has_permission('documents.read')),true,'admin read');
select is((select private.has_permission('documents.delete')),true,'admin delete');
select is((select private.has_permission('documents.approve')),true,'admin approve');

update public.user_roles
set role_id=(select id from public.roles where code='director')
where user_id='55a76687-89ca-4bb7-800b-f227a5d970d6';
select is((select private.has_permission('documents.read')),true,'director read');
select is((select private.has_permission('documents.delete')),false,'director no delete');
select is((select private.has_permission('documents.approve')),true,'director approve');

update public.user_roles
set role_id=(select id from public.roles where code='officer')
where user_id='55a76687-89ca-4bb7-800b-f227a5d970d6';
select is((select private.has_permission('documents.read')),true,'officer read');
select is((select private.has_permission('documents.assign')),true,'officer assign');
select is((select private.has_permission('documents.approve')),false,'officer no approve');

update public.user_roles
set role_id=(select id from public.roles where code='staff')
where user_id='55a76687-89ca-4bb7-800b-f227a5d970d6';
select is((select private.has_permission('documents.read')),true,'staff read');
select is((select private.has_permission('documents.assign')),false,'staff no assign');

select * from finish();
rollback;
