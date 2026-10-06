-- Fix legacy EDMS import: split multiple Google Drive URLs correctly
-- and pin SECURITY DEFINER functions to an empty search_path.

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.execute_legacy_import(uuid)'::regprocedure);
  v_def := replace(v_def, E'\\\\s*,\\\\s*', E'\\s*,\\s*');
  execute v_def;
end $$;

alter function public.execute_legacy_import(uuid) set search_path = '';
alter function public.validate_legacy_import(uuid) set search_path = '';
