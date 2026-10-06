-- Mobile Web Push: automatic dispatch from notifications
-- Secrets are intentionally NOT stored in Git.
-- Production stores these values in Supabase Vault:
--   web_push_internal_secret
--   web_push_vapid_public_key
--   web_push_vapid_private_key
--   web_push_vapid_subject

create extension if not exists pg_net;

create or replace function public.get_web_push_secret(secret_name text)
returns text
language sql
security definer
set search_path='vault,pg_catalog'
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
    and name in (
      'web_push_internal_secret',
      'web_push_vapid_public_key',
      'web_push_vapid_private_key',
      'web_push_vapid_subject'
    )
  limit 1
$$;

revoke all on function public.get_web_push_secret(text) from public, anon, authenticated;
grant execute on function public.get_web_push_secret(text) to service_role;

create or replace function public.dispatch_notification_web_push()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  internal_secret text;
  request_id bigint;
begin
  select decrypted_secret into internal_secret
  from vault.decrypted_secrets
  where name='web_push_internal_secret'
  limit 1;

  if internal_secret is null then
    return new;
  end if;

  select net.http_post(
    url := 'https://uwebbofczidcfnjbvsqu.supabase.co/functions/v1/web-push-v2',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-push-secret',internal_secret
    ),
    body := jsonb_build_object(
      'user_id', new.recipient_id,
      'title', new.title,
      'message', new.message,
      'type', new.type,
      'entity_type', new.entity_type,
      'entity_id', new.entity_id,
      'notification_id', new.id
    )
  ) into request_id;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notifications_web_push on public.notifications;
create trigger notifications_web_push
after insert on public.notifications
for each row
execute function public.dispatch_notification_web_push();

revoke all on function public.dispatch_notification_web_push() from public;
