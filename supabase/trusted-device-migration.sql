begin;

create extension if not exists pg_cron;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.trusted_devices enable row level security;

-- Der bestehende Funktionsname bleibt aus Kompatibilitaetsgruenden erhalten.
-- Er akzeptiert weiterhin den Gruppen-Code oder einen gueltigen 30-Tage-Geraete-Token.
create or replace function public.assert_group_code(p_group_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_rows integer;
begin
  if p_group_code is not null and left(p_group_code, 7) = 'device_' then
    update public.trusted_devices
    set last_used_at = now()
    where token_hash = encode(extensions.digest(p_group_code, 'sha256'), 'hex')
      and revoked_at is null
      and expires_at > now();

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      raise exception 'Gerätefreigabe ist abgelaufen oder ungültig.';
    end if;
    return;
  end if;

  if not public.validate_group_code(p_group_code) then
    raise exception 'Gruppen-Code ist falsch.';
  end if;
end;
$$;

create or replace function public.register_trusted_device(p_group_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_expires_at timestamptz;
begin
  if not public.validate_group_code(p_group_code) then
    raise exception 'Gruppen-Code ist falsch.';
  end if;

  v_token := 'device_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';

  insert into public.trusted_devices(token_hash, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires_at);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.revoke_trusted_device(p_device_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_token is null or left(p_device_token, 7) <> 'device_' then
    return;
  end if;

  update public.trusted_devices
  set revoked_at = now()
  where token_hash = encode(extensions.digest(p_device_token, 'sha256'), 'hex')
    and revoked_at is null;
end;
$$;

create or replace function public.cleanup_expired_trusted_devices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_rows integer;
begin
  delete from public.trusted_devices
  where expires_at <= now()
     or revoked_at is not null;

  get diagnostics v_deleted_rows = row_count;
  return v_deleted_rows;
end;
$$;

revoke all on public.app_settings, public.trusted_devices from public, anon, authenticated;

revoke execute on function public.register_trusted_device(text) from public;
revoke execute on function public.revoke_trusted_device(text) from public;
revoke execute on function public.upsert_player(text, uuid, text, boolean) from public;
revoke execute on function public.submit_match(text, timestamptz, integer, integer, text, jsonb) from public;
revoke execute on function public.update_match(text, uuid, timestamptz, integer, integer, text, jsonb) from public;
revoke execute on function public.delete_match(text, uuid) from public;

grant execute on function public.register_trusted_device(text) to anon, authenticated;
grant execute on function public.revoke_trusted_device(text) to anon, authenticated;
grant execute on function public.upsert_player(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.submit_match(text, timestamptz, integer, integer, text, jsonb) to anon, authenticated;
grant execute on function public.update_match(text, uuid, timestamptz, integer, integer, text, jsonb) to anon, authenticated;
grant execute on function public.delete_match(text, uuid) to anon, authenticated;

revoke execute on function public.set_group_code(text) from public, anon, authenticated;
revoke execute on function public.validate_group_code(text) from public, anon, authenticated;
revoke execute on function public.assert_group_code(text) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_trusted_devices() from public, anon, authenticated;
revoke execute on function public.assert_match_payload(timestamptz, integer, integer, text, jsonb) from public, anon, authenticated;

select cron.schedule(
  'cleanup-expired-trusted-devices',
  '0 3 1 * *',
  $$select public.cleanup_expired_trusted_devices();$$
);

notify pgrst, 'reload schema';

commit;
