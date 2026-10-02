-- Least-privilege Data API grants for the document system.
-- RLS remains the row-level authorization layer.

revoke all privileges on all tables in schema public from anon, authenticated, public;

grant select, insert, update on table public.assignments to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.departments to authenticated;
grant select, insert, delete on table public.document_files to authenticated;
grant select, insert, update, delete on table public.incoming_documents to authenticated;
grant select, insert, update, delete on table public.outgoing_documents to authenticated;
grant select on table public.permissions to authenticated;
grant select, update on table public.profiles to authenticated;
grant select on table public.role_permissions to authenticated;
grant select on table public.roles to authenticated;
grant select, insert on table public.user_roles to authenticated;
grant select, insert on table public.workflows to authenticated;

-- Document sequence numbers are generated server-side only.
revoke all privileges on table public.document_sequences from anon, authenticated, public;

-- No public-schema database function is exposed to the browser API.
revoke all privileges on all functions in schema public from anon, authenticated, public;
