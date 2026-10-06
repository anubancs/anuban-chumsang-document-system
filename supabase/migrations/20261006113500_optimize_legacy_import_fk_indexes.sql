-- Performance indexes for legacy import foreign keys
create index if not exists idx_legacy_identity_map_current_user_id
  on public.legacy_identity_map(current_user_id);

create index if not exists idx_legacy_import_batches_started_by
  on public.legacy_import_batches(started_by);
