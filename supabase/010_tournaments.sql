-- Padel Vitals, part 10: club tournaments.
-- The club opens a tournament, pairs sign up (or the owner adds them), the club starts it and
-- a single elimination bracket is drawn. Players in a match enter the score, the winner moves
-- on by itself, and the final crowns the champions. Safe to run more than once.

create table if not exists public.tournaments (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null,
  starts_on   date,
  level_min   numeric(4,2) not null default 0,
  level_max   numeric(4,2) not null default 7,
  max_teams   int not null default 16 check (max_teams between 2 and 64),
  note        text,
  status      text not null default 'open' check (status in ('open','live','done','cancelled')),
  champion    uuid,
  created_by  uuid references public.members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists tournaments_club on public.tournaments(club_id, created_at desc);

create table if not exists public.tournament_teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  p1            uuid not null references public.members(id) on delete cascade,
  p2            uuid not null references public.members(id) on delete cascade,
  seed          int,
  created_at    timestamptz not null default now(),
  check (p1 <> p2)
);
create index if not exists tteams_t on public.tournament_teams(tournament_id);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         int not null,
  slot          int not null,
  team1         uuid references public.tournament_teams(id) on delete set null,
  team2         uuid references public.tournament_teams(id) on delete set null,
  score         text,
  winner        smallint check (winner in (1,2)),
  reported_by   uuid references public.members(id) on delete set null,
  result_at     timestamptz,
  unique (tournament_id, round, slot)
);

alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_matches enable row level security;

create or replace function public.tournament_club(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from tournaments where id = p $$;

drop policy if exists t_read on public.tournaments;
create policy t_read on public.tournaments for select using (public.is_member(club_id));
drop policy if exists t_write on public.tournaments;
create policy t_write on public.tournaments for insert with check (public.is_coach(club_id) and status = 'open');
drop policy if exists t_update on public.tournaments;
create policy t_update on public.tournaments for update using (public.is_coach(club_id)) with check (public.is_coach(club_id));
drop policy if exists t_delete on public.tournaments;
create policy t_delete on public.tournaments for delete using (public.is_coach(club_id));
drop policy if exists tt_read on public.tournament_teams;
create policy tt_read on public.tournament_teams for select using (public.is_member(public.tournament_club(tournament_id)));
drop policy if exists tm_read on public.tournament_matches;
create policy tm_read on public.tournament_matches for select using (public.is_member(public.tournament_club(tournament_id)));

-- ------------------------------------------------------------------ signing up a pair
-- a player signs up with a partner from the same club, or a coach adds any two players
create or replace function public.add_tournament_team(p_tournament uuid, p_p1 uuid, p_p2 uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare tr tournaments; me uuid; tid uuid; n int;
begin
  select * into tr from tournaments where id = p_tournament for update;
  if tr.id is null then raise exception 'not found'; end if;
  me := public.my_member(tr.club_id);
  if not (public.is_coach(tr.club_id) or (me is not null and p_p1 = me)) then raise exception 'not allowed'; end if;
  if tr.status <> 'open' then raise exception 'sign up is closed'; end if;
  if p_p1 = p_p2 then raise exception 'pick a partner'; end if;
  if (select count(*) from members where id in (p_p1, p_p2) and club_id = tr.club_id and role = 'player' and status <> 'removed') <> 2 then
    raise exception 'both players must be in the club';
  end if;
  if exists (select 1 from tournament_teams where tournament_id = p_tournament
              and (p1 in (p_p1, p_p2) or p2 in (p_p1, p_p2))) then
    raise exception 'already signed up';
  end if;
  select count(*) into n from tournament_teams where tournament_id = p_tournament;
  if n >= tr.max_teams then raise exception 'tournament is full'; end if;
  insert into tournament_teams(tournament_id, p1, p2) values (p_tournament, p_p1, p_p2) returning id into tid;
  -- the partner hears about it
  insert into notifications(club_id, member_id, kind, data)
  select tr.club_id, x, 'tsignup', jsonb_build_object('t', tr.id, 'name', tr.name, 'by', (select full_name from members where id = coalesce(me, p_p1)))
    from unnest(array[p_p1, p_p2]) x where x is distinct from me;
  return tid;
end $$;

create or replace function public.remove_tournament_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tt tournament_teams; tr tournaments; me uuid;
begin
  select * into tt from tournament_teams where id = p_team;
  select * into tr from tournaments where id = tt.tournament_id;
  me := public.my_member(tr.club_id);
  if not (public.is_coach(tr.club_id) or me in (tt.p1, tt.p2)) then raise exception 'not allowed'; end if;
  if tr.status <> 'open' then raise exception 'tournament already started'; end if;
  delete from tournament_teams where id = p_team;
end $$;

-- ------------------------------------------------------------------ the draw
-- seeds by the pair's combined level; top seeds get the byes and meet as late as possible
create or replace function public.start_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tr tournaments; n int; sz int := 2; rounds int := 1; ord int[] := array[1,2]; nxt int[]; s int; r int; i int;
        teams uuid[]; a uuid; b uuid; m record;
begin
  select * into tr from tournaments where id = p_tournament for update;
  if tr.id is null then raise exception 'not found'; end if;
  if not public.is_coach(tr.club_id) then raise exception 'not allowed'; end if;
  if tr.status <> 'open' then raise exception 'already started'; end if;

  select array_agg(t.id order by coalesce(m1.level,0) + coalesce(m2.level,0) desc, t.created_at), count(*)
    into teams, n
    from tournament_teams t join members m1 on m1.id = t.p1 join members m2 on m2.id = t.p2
   where t.tournament_id = p_tournament;
  if coalesce(n, 0) < 2 then raise exception 'at least two pairs are needed'; end if;

  while sz < n loop sz := sz * 2; rounds := rounds + 1; end loop;
  -- bracket order: 1 v 8, 4 v 5, 2 v 7, 3 v 6 and so on
  while array_length(ord, 1) < sz loop
    nxt := array[]::int[];
    foreach s in array ord loop nxt := nxt || s || (array_length(ord, 1) * 2 + 1 - s); end loop;
    ord := nxt;
  end loop;

  for i in 1..n loop update tournament_teams set seed = i where id = teams[i]; end loop;
  delete from tournament_matches where tournament_id = p_tournament;
  for r in 1..rounds loop
    for i in 0..(sz / (2 ^ r))::int - 1 loop
      insert into tournament_matches(tournament_id, round, slot) values (p_tournament, r, i);
    end loop;
  end loop;
  for i in 0..sz/2 - 1 loop
    a := case when ord[2*i+1] <= n then teams[ord[2*i+1]] end;
    b := case when ord[2*i+2] <= n then teams[ord[2*i+2]] end;
    update tournament_matches set team1 = a, team2 = b where tournament_id = p_tournament and round = 1 and slot = i;
  end loop;
  update tournaments set status = 'live' where id = p_tournament;

  -- byes go straight through
  for m in select * from tournament_matches where tournament_id = p_tournament and round = 1 and (team1 is null or team2 is null) loop
    perform public.tournament_advance(m.id, case when m.team1 is null then 2 else 1 end, 'bye', null);
  end loop;

  insert into notifications(club_id, member_id, kind, data)
  select tr.club_id, x, 'tstart', jsonb_build_object('t', tr.id, 'name', tr.name)
    from tournament_teams t, unnest(array[t.p1, t.p2]) x where t.tournament_id = p_tournament;
end $$;

-- internal: record a winner and move them into the next round (not callable by the app)
create or replace function public.tournament_advance(p_match uuid, p_winner int, p_score text, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mt tournament_matches; tr tournaments; wteam uuid; last int; pts int;
begin
  select * into mt from tournament_matches where id = p_match for update;
  select * into tr from tournaments where id = mt.tournament_id;
  wteam := case when p_winner = 1 then mt.team1 else mt.team2 end;
  update tournament_matches set winner = p_winner, score = left(p_score, 40), reported_by = p_by, result_at = now() where id = p_match;
  select max(round) into last from tournament_matches where tournament_id = mt.tournament_id;
  if mt.round = last then
    update tournaments set status = 'done', champion = wteam where id = tr.id;
    pts := coalesce((select (points_rules->>'tournament')::int from clubs where id = tr.club_id), 200);
    if pts > 0 then
      insert into points(club_id, member_id, amount, reason)
      select tr.club_id, x, pts, 'Club tournament' from tournament_teams t, unnest(array[t.p1, t.p2]) x where t.tournament_id = tr.id;
    end if;
    insert into notifications(club_id, member_id, kind, data)
    select tr.club_id, x, 'tdone', jsonb_build_object('t', tr.id, 'name', tr.name, 'won', t.id = wteam,
             'champs', (select m1.full_name || ' & ' || m2.full_name from tournament_teams c join members m1 on m1.id = c.p1 join members m2 on m2.id = c.p2 where c.id = wteam))
      from tournament_teams t, unnest(array[t.p1, t.p2]) x where t.tournament_id = tr.id;
  else
    if mt.slot % 2 = 0 then
      update tournament_matches set team1 = wteam where tournament_id = mt.tournament_id and round = mt.round + 1 and slot = mt.slot / 2;
    else
      update tournament_matches set team2 = wteam where tournament_id = mt.tournament_id and round = mt.round + 1 and slot = mt.slot / 2;
    end if;
  end if;
end $$;
revoke execute on function public.tournament_advance(uuid, int, text, uuid) from public, anon, authenticated;

-- a player in the match (or a coach) enters the score. A coach can fix a result
-- as long as the next round has not been played yet.
create or replace function public.report_tournament_score(p_match uuid, p_score text, p_winner int) returns void
language plpgsql security definer set search_path = public as $$
declare mt tournament_matches; tr tournaments; me uuid; nx tournament_matches; coach boolean;
begin
  select * into mt from tournament_matches where id = p_match for update;
  if mt.id is null then raise exception 'not found'; end if;
  select * into tr from tournaments where id = mt.tournament_id;
  me := public.my_member(tr.club_id);
  coach := public.is_coach(tr.club_id);
  if not (coach or exists (select 1 from tournament_teams where id in (mt.team1, mt.team2) and me in (p1, p2))) then
    raise exception 'not allowed';
  end if;
  if tr.status <> 'live' and not (coach and tr.status = 'done') then raise exception 'tournament is not running'; end if;
  if mt.team1 is null or mt.team2 is null then raise exception 'waiting for the other pair'; end if;
  if p_winner not in (1,2) or coalesce(trim(p_score), '') = '' then raise exception 'score and winner please'; end if;
  if mt.winner is not null then
    if not coach then raise exception 'score already in, ask a coach to change it'; end if;
    select * into nx from tournament_matches where tournament_id = mt.tournament_id and round = mt.round + 1 and slot = mt.slot / 2;
    if nx.id is not null and nx.winner is not null then raise exception 'next round already played'; end if;
    if tr.status = 'done' then
      update tournaments set status = 'live', champion = null where id = tr.id;
      delete from points where club_id = tr.club_id and reason = 'Club tournament'
        and member_id in (select x from tournament_teams t, unnest(array[t.p1, t.p2]) x where t.tournament_id = tr.id);
    end if;
  end if;
  perform public.tournament_advance(p_match, p_winner, trim(p_score), me);
end $$;

grant execute on function public.add_tournament_team(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_tournament_team(uuid) to authenticated;
grant execute on function public.start_tournament(uuid) to authenticated;
grant execute on function public.report_tournament_score(uuid, text, int) to authenticated;
