begin;
select plan(16);

select is((select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code='admin'), 8::bigint, 'admin has 8 permissions');
select is((select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code='director'), 5::bigint, 'director has 5 permissions');
select is((select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code='officer'), 4::bigint, 'officer has 4 permissions');
select is((select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code='staff'), 3::bigint, 'staff has 3 permissions');

select ok(not has_table_privilege('authenticated','public.profiles','UPDATE'), 'authenticated cannot directly update profiles');
select ok(not has_table_privilege('authenticated','public.user_roles','INSERT'), 'authenticated cannot directly insert user_roles');
select ok(not has_table_privilege('authenticated','public.workflows','INSERT'), 'authenticated cannot directly insert workflows');
select ok(not has_table_privilege('authenticated','public.document_files','INSERT'), 'authenticated cannot directly insert document_files');
select ok(not has_table_privilege('authenticated','public.document_files','DELETE'), 'authenticated cannot directly delete document_files');

select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles_bootstrap_insert'), 'bootstrap user_roles insert policy removed');
select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='workflows' and policyname='workflows_insert'), 'workflow insert policy removed');
select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='document_files' and policyname='files_insert'), 'document file insert policy removed');
select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='document_files' and policyname='files_delete'), 'document file delete policy removed');
select ok(not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_or_admin_update'), 'profile self-update policy removed');

select ok(exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.oid='public.assignments'::regclass and t.tgname='trg_prevent_assignment_identity_changes'), 'assignment identity protection trigger exists');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='prevent_assignment_identity_changes' and p.prosecdef=false), 'assignment protection function is invoker-security');

select * from finish();
rollback;
