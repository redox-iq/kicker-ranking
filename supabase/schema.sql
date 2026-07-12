create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_display_name_lower_idx
  on public.players (lower(display_name));

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null,
  team_a_score integer not null check (team_a_score >= 0),
  team_b_score integer not null check (team_b_score >= 0),
  note text check (note is null or char_length(note) <= 120),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_slots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  team text not null check (team in ('A', 'B')),
  role text not null check (role in ('defense', 'attack')),
  created_at timestamptz not null default now(),
  unique (match_id, team, role),
  unique (match_id, player_id)
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
before update on public.matches
for each row execute function public.touch_updated_at();

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_slots enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "public_read_players" on public.players;
create policy "public_read_players"
on public.players
for select
to anon, authenticated
using (
  active = true
  or exists (
    select 1
    from public.match_slots slot
    join public.matches match on match.id = slot.match_id
    where slot.player_id = players.id
      and match.is_deleted = false
  )
);

drop policy if exists "public_read_matches" on public.matches;
create policy "public_read_matches"
on public.matches
for select
to anon, authenticated
using (is_deleted = false);

drop policy if exists "public_read_match_slots" on public.match_slots;
create policy "public_read_match_slots"
on public.match_slots
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.matches match
    where match.id = match_slots.match_id
      and match.is_deleted = false
  )
);

create or replace function public.set_group_code(p_group_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_group_code is null or char_length(trim(p_group_code)) < 4 then
    raise exception 'Group code must be at least 4 characters long.';
  end if;

  insert into public.app_settings(key, value, updated_at)
  values ('group_code_hash', crypt(p_group_code, gen_salt('bf')), now())
  on conflict (key)
  do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.validate_group_code(p_group_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select crypt(p_group_code, value) = value
      from public.app_settings
      where key = 'group_code_hash'
    ),
    false
  );
$$;

create or replace function public.assert_group_code(p_group_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.validate_group_code(p_group_code) then
    raise exception 'Gruppen-Code ist falsch.';
  end if;
end;
$$;

create or replace function public.assert_match_payload(
  p_played_at timestamptz,
  p_team_a_score integer,
  p_team_b_score integer,
  p_note text,
  p_slots jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_count integer;
  v_distinct_players integer;
  v_invalid_slots integer;
  v_inactive_players integer;
begin
  if p_played_at is null then
    raise exception 'Spieldatum fehlt.';
  end if;

  if p_team_a_score is null or p_team_b_score is null or p_team_a_score < 0 or p_team_b_score < 0 then
    raise exception 'Spielstand ist ungueltig.';
  end if;

  if p_note is not null and char_length(p_note) > 120 then
    raise exception 'Notiz ist zu lang.';
  end if;

  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) <> 4 then
    raise exception 'Es muessen genau vier Rollenplaetze uebergeben werden.';
  end if;

  with slots as (
    select *
    from jsonb_to_recordset(p_slots) as slot(player_id uuid, team text, role text)
  )
  select count(*), count(distinct player_id)
  into v_slot_count, v_distinct_players
  from slots;

  if v_slot_count <> 4 or v_distinct_players <> 4 then
    raise exception 'Vier unterschiedliche Spieler sind erforderlich.';
  end if;

  with slots as (
    select *
    from jsonb_to_recordset(p_slots) as slot(player_id uuid, team text, role text)
  ),
  expected as (
    select team, role
    from (values ('A', 'defense'), ('A', 'attack'), ('B', 'defense'), ('B', 'attack')) as expected(team, role)
  )
  select count(*)
  into v_invalid_slots
  from expected
  left join slots on slots.team = expected.team and slots.role = expected.role
  where slots.player_id is null;

  if v_invalid_slots <> 0 then
    raise exception 'Jedes Team braucht Angriff und Abwehr.';
  end if;

  with slots as (
    select *
    from jsonb_to_recordset(p_slots) as slot(player_id uuid, team text, role text)
  )
  select count(*)
  into v_inactive_players
  from slots
  left join public.players player on player.id = slots.player_id and player.active = true
  where player.id is null;

  if v_inactive_players <> 0 then
    raise exception 'Alle Spieler muessen aktiv sein.';
  end if;
end;
$$;

create or replace function public.upsert_player(
  p_group_code text,
  p_player_id uuid,
  p_display_name text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
begin
  perform public.assert_group_code(p_group_code);

  if p_display_name is null or char_length(trim(p_display_name)) = 0 or char_length(trim(p_display_name)) > 40 then
    raise exception 'Spielername ist ungueltig.';
  end if;

  if p_player_id is null then
    insert into public.players(display_name, active)
    values (trim(p_display_name), coalesce(p_active, true))
    returning id into v_player_id;
  else
    update public.players
    set display_name = trim(p_display_name),
        active = coalesce(p_active, active)
    where id = p_player_id
    returning id into v_player_id;

    if v_player_id is null then
      raise exception 'Spieler wurde nicht gefunden.';
    end if;
  end if;

  return v_player_id;
end;
$$;

create or replace function public.submit_match(
  p_group_code text,
  p_played_at timestamptz,
  p_team_a_score integer,
  p_team_b_score integer,
  p_note text,
  p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  perform public.assert_group_code(p_group_code);
  perform public.assert_match_payload(p_played_at, p_team_a_score, p_team_b_score, p_note, p_slots);

  insert into public.matches(played_at, team_a_score, team_b_score, note)
  values (p_played_at, p_team_a_score, p_team_b_score, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_match_id;

  insert into public.match_slots(match_id, player_id, team, role)
  select v_match_id, player_id, team, role
  from jsonb_to_recordset(p_slots) as slot(player_id uuid, team text, role text);

  return v_match_id;
end;
$$;

create or replace function public.update_match(
  p_group_code text,
  p_match_id uuid,
  p_played_at timestamptz,
  p_team_a_score integer,
  p_team_b_score integer,
  p_note text,
  p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  perform public.assert_group_code(p_group_code);
  perform public.assert_match_payload(p_played_at, p_team_a_score, p_team_b_score, p_note, p_slots);

  update public.matches
  set played_at = p_played_at,
      team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_match_id
    and is_deleted = false
  returning id into v_match_id;

  if v_match_id is null then
    raise exception 'Spiel wurde nicht gefunden.';
  end if;

  delete from public.match_slots
  where match_id = p_match_id;

  insert into public.match_slots(match_id, player_id, team, role)
  select p_match_id, player_id, team, role
  from jsonb_to_recordset(p_slots) as slot(player_id uuid, team text, role text);

  return p_match_id;
end;
$$;

create or replace function public.delete_match(
  p_group_code text,
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_group_code(p_group_code);

  update public.matches
  set is_deleted = true,
      deleted_at = now()
  where id = p_match_id
    and is_deleted = false;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.players, public.matches, public.match_slots to anon, authenticated;
grant execute on function public.upsert_player(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.submit_match(text, timestamptz, integer, integer, text, jsonb) to anon, authenticated;
grant execute on function public.update_match(text, uuid, timestamptz, integer, integer, text, jsonb) to anon, authenticated;
grant execute on function public.delete_match(text, uuid) to anon, authenticated;

revoke all on public.app_settings from anon, authenticated;
revoke execute on function public.set_group_code(text) from anon, authenticated;
revoke execute on function public.validate_group_code(text) from anon, authenticated;
revoke execute on function public.assert_group_code(text) from anon, authenticated;
revoke execute on function public.assert_match_payload(timestamptz, integer, integer, text, jsonb) from anon, authenticated;

-- Run once after applying this schema, then replace the value whenever the shared code changes:
-- select public.set_group_code('dein-code');
