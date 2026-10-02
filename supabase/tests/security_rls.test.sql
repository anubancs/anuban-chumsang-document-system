begin;

select plan(18);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
  13,
  'all 13 public tables have RLS enabled'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema='public' and grantee='anon'),
  0,
  'anon has no public table grants'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')),
  0,
  'anon cannot execute public functions'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  0,
  'authenticated cannot execute public functions directly'
);

select ok(not has_table_privilege('anon','public.incoming_documents','SELECT'),'anon cannot read incoming_documents');
select ok(not has_table_privilege('anon','public.outgoing_documents','SELECT'),'anon cannot read outgoing_documents');
select ok(not has_table_privilege('anon','public.profiles','SELECT'),'anon cannot read profiles');
select ok(not has_table_privilege('anon','public.audit_logs','SELECT'),'anon cannot read audit_logs');

select ok(has_table_privilege('authenticated','public.incoming_documents','SELECT'),'authenticated can read incoming_documents');
select ok(has_table_privilege('authenticated','public.incoming_documents','INSERT'),'authenticated can insert incoming_documents');
select ok(has_table_privilege('authenticated','public.incoming_documents','UPDATE'),'authenticated can update incoming_documents');
select ok(has_table_privilege('authenticated','public.incoming_documents','DELETE'),'authenticated can delete incoming_documents');

select ok(has_table_privilege('authenticated','public.outgoing_documents','SELECT'),'authenticated can read outgoing_documents');
select ok(has_table_privilege('authenticated','public.outgoing_documents','INSERT'),'authenticated can insert outgoing_documents');
select ok(has_table_privilege('authenticated','public.outgoing_documents','UPDATE'),'authenticated can update outgoing_documents');
select ok(has_table_privilege('authenticated','public.outgoing_documents','DELETE'),'authenticated can delete outgoing_documents');

select ok(not has_table_privilege('authenticated','public.document_sequences','SELECT'),'authenticated cannot read document_sequences');
select ok(not has_table_privilege('authenticated','public.document_sequences','UPDATE'),'authenticated cannot update document_sequences');

select * from finish();
rollback;
