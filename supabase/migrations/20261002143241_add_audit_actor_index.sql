-- Reconciliation migration: this index is already present in production.
create index if not exists idx_audit_actor on public.audit_logs (actor_id);
