-- Allow authenticated clients to evaluate the RBAC helper used by RLS policies.
grant usage on schema private to authenticated;
grant execute on function private.has_permission(text) to authenticated;
