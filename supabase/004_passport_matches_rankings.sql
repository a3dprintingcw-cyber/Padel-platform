-- Padel Vitals, part 4: level passport, match finder, club ladder, club vs club rankings.
-- Safe to run more than once.

-- ------------------------------------------------------------------ level passport
alter table public.members add column if not exists passport_code text;
alter table public.members add column if not exists passport_public boolean not null default false;
create unique index if not exists members_passport_code on public.members(passport_code) where passport_code is not null;

-- the player switches their passport on or off; one code follows them across every club
create or replace function public.set_passport(p_public boolean) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select passport_code into code from members
   where (user_id = auth.uid() or lower(email) = public.my_email()) and passport_code is not null limit 1;
  if code is null then
    loop
      code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      exit when length(code) = 8 and not exists (select 1 from members where passport_code = code);
    end loop;
  end if;
  update members set passport_code = code, passport_public = p_public
   where (user_id = auth.uid() or lower(email) = public.my_email()) and role = 'player';
  return code;
end $$;
grant execute on function public.set_passport(boolean) to authenticated;

-- what anyone with the link sees: only when the player switched it on
create or replace function public.passport(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select m.* from members m
     where m.passport_code = upper(p_code) and m.passport_public and m.status <> 'removed'
     order by m.level desc nulls last limit 1
  )
  select case when not exists (select 1 from me) then null else jsonb_build_object(
    'name', (select full_name from me),
    'level', (select level from me),
    'since', (select min(created_at) from members where passport_code = upper(p_code)),
    'clubs', (select jsonb_agg(jsonb_build_object('name', c.name, 'city', c.city, 'country', c.country))
                from members m join clubs c on c.id = m.club_id
               where m.passport_code = upper(p_code) and m.status <> 'removed'),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('skill', skill, 'score', score, 'at', created_at)), '[]'::jsonb) from (
                 select distinct on (r.skill) r.skill, r.score, r.created_at
                   from ratings r join members m on m.id = r.player_id
                  where m.passport_code = upper(p_code)
                  order by r.skill, r.created_at desc) s),
    'sessions90', (select count(*) from attendance a join members m on m.id = a.member_id
                    where m.passport_code = upper(p_code) and a.created_at > now() - interval '90 days'),
    'levels', (select coalesce(jsonb_agg(jsonb_build_object('level', h.level, 'at', h.created_at) order by h.created_at), '[]'::jsonb)
                 from level_history h join members m on m.id = h.member_id where m.passport_code = upper(p_code))
  ) end
$$;
grant execute on function public.passport(text) to anon, authenticated;

-- ------------------------------------------------------------------ match finder
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  created_by uuid references public.members(id) on delete set null,
  starts_at  timestamptz not null,
  level_min  numeric(4,2) not null default 0,
  level_max  numeric(4,2) not null default 7,
  note       text,
  status     text not null default 'open' check (status in ('open','full','played','cancelled')),
  score      text,
  winner     smallint check (winner in (1,2)),
  result_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists matches_club on public.matches(club_id, starts_at);
create table if not exists public.match_players (
  match_id  uuid not null references public.matches(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  team      smallint check (team in (1,2)),
  joined_at timestamptz not null default now(),
  primary key (match_id, member_id)
);
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

create or replace function public.match_club(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from matches where id = p $$;

drop policy if exists matches_read on public.matches;
create policy matches_read on public.matches for select using (public.is_member(club_id));
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert
  with check (created_by = public.my_member(club_id) and status = 'open' and score is null);
drop policy if exists matches_cancel on public.matches;
create policy matches_cancel on public.matches for update
  using (created_by = public.my_member(club_id) or public.is_coach(club_id))
  with check (created_by = public.my_member(club_id) or public.is_coach(club_id));
drop policy if exists mp_read on public.match_players;
create policy mp_read on public.match_players for select using (public.is_member(public.match_club(match_id)));

-- the person who posts a match is its first player
create or replace function public.match_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into match_players(match_id, member_id) values (new.id, new.created_by) on conflict do nothing;
  end if;
  -- tell players at that level, not the whole club
  insert into notifications(club_id, member_id, kind, data)
  select new.club_id, m.id, 'matchopen',
         jsonb_build_object('match', new.id, 'at', new.starts_at, 'by', (select full_name from members where id = new.created_by))
    from members m
   where m.club_id = new.club_id and m.role = 'player' and m.status = 'active' and m.id <> new.created_by
     and coalesce(m.level, 0) between new.level_min and new.level_max;
  return new;
end $$;
drop trigger if exists matches_created on public.matches;
create trigger matches_created after insert on public.matches for each row execute function public.match_created();

create or replace function public.join_match(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare mt matches; me uuid; n int;
begin
  select * into mt from matches where id = p_match for update;
  if mt.id is null then raise exception 'not found'; end if;
  me := public.my_member(mt.club_id);
  if me is null then raise exception 'not allowed'; end if;
  if mt.status <> 'open' then raise exception 'match is full'; end if;
  if mt.starts_at < now() then raise exception 'match already started'; end if;
  insert into match_players(match_id, member_id) values (p_match, me) on conflict do nothing;
  select count(*) into n from match_players where match_id = p_match;
  if n >= 4 then
    update matches set status = 'full' where id = p_match;
    insert into notifications(club_id, member_id, kind, data)
    select mt.club_id, mp.member_id, 'matchfull', jsonb_build_object('match', p_match, 'at', mt.starts_at)
      from match_players mp where mp.match_id = p_match;
    return 'full';
  end if;
  if mt.created_by is not null and mt.created_by <> me then
    insert into notifications(club_id, member_id, kind, data)
    values (mt.club_id, mt.created_by, 'matchjoin',
            jsonb_build_object('match', p_match, 'at', mt.starts_at, 'by', (select full_name from members where id = me), 'n', n));
  end if;
  return 'joined';
end $$;

create or replace function public.leave_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt matches; me uuid;
begin
  select * into mt from matches where id = p_match for update;
  me := public.my_member(mt.club_id);
  if me is null or mt.status in ('played','cancelled') then raise exception 'not allowed'; end if;
  delete from match_players where match_id = p_match and member_id = me;
  if not exists (select 1 from match_players where match_id = p_match) then
    update matches set status = 'cancelled' where id = p_match;
  elsif mt.status = 'full' then
    update matches set status = 'open' where id = p_match;
  end if;
end $$;

-- a player in the match (or a coach) records who played with whom and who won
create or replace function public.record_result(p_match uuid, p_team1 uuid[], p_team2 uuid[], p_score text, p_winner int)
returns void language plpgsql security definer set search_path = public as $$
declare mt matches; me uuid;
begin
  select * into mt from matches where id = p_match for update;
  me := public.my_member(mt.club_id);
  if not (public.is_coach(mt.club_id) or exists (select 1 from match_players where match_id = p_match and member_id = me)) then
    raise exception 'not allowed';
  end if;
  if coalesce(array_length(p_team1,1),0) <> 2 or coalesce(array_length(p_team2,1),0) <> 2 or p_winner not in (1,2) then
    raise exception 'two players per team and a winner';
  end if;
  update match_players set team = case when member_id = any(p_team1) then 1 when member_id = any(p_team2) then 2 else null end
   where match_id = p_match;
  update matches set score = left(p_score, 40), winner = p_winner, status = 'played', result_at = now() where id = p_match;
  insert into notifications(club_id, member_id, kind, data)
  select mt.club_id, mp.member_id, 'matchresult',
         jsonb_build_object('match', p_match, 'score', left(p_score, 40), 'won', mp.team = p_winner)
    from match_players mp where mp.match_id = p_match and mp.member_id <> me;
end $$;
grant execute on function public.join_match(uuid) to authenticated;
grant execute on function public.leave_match(uuid) to authenticated;
grant execute on function public.record_result(uuid, uuid[], uuid[], text, int) to authenticated;

-- ------------------------------------------------------------------ club ladder: this season's results
create or replace function public.club_ladder(p_club uuid)
returns table(member_id uuid, full_name text, level numeric, played int, wins int)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, m.level,
         count(mt.id)::int,
         count(mt.id) filter (where mp.team = mt.winner)::int
    from members m
    join match_players mp on mp.member_id = m.id
    join matches mt on mt.id = mp.match_id and mt.status = 'played' and mt.result_at >= date_trunc('year', now())
   where m.club_id = p_club and public.is_member(p_club)
   group by m.id, m.full_name, m.level
$$;
grant execute on function public.club_ladder(uuid) to authenticated;

-- ------------------------------------------------------------------ club vs club: aggregates only, no player data
create or replace function public.club_rankings()
returns table(club_id uuid, name text, city text, country text, players int, avg_level numeric,
              sessions_pp numeric, gain_90 numeric, ratings_30 int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.country,
         count(distinct m.id)::int,
         round(avg(m.level), 2),
         round(coalesce((select count(*) from attendance a join members m2 on m2.id = a.member_id
                          where m2.club_id = c.id and a.created_at > now() - interval '30 days'), 0)::numeric
               / greatest(count(distinct m.id), 1), 1),
         round(coalesce(avg(m.level - coalesce(
           (select h.level from level_history h where h.member_id = m.id and h.created_at <= now() - interval '90 days'
             order by h.created_at desc limit 1),
           (select h.level from level_history h where h.member_id = m.id order by h.created_at limit 1),
           m.level)), 0), 2),
         (select count(*) from ratings r where r.club_id = c.id and r.created_at > now() - interval '30 days')::int
    from clubs c join members m on m.club_id = c.id and m.role = 'player' and m.status = 'active'
   where c.status in ('trial','active')
   group by c.id, c.name, c.city, c.country
$$;
grant execute on function public.club_rankings() to anon, authenticated;
