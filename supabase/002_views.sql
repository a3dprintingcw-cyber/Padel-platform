-- Padel Vitals, part 2: club-wide summaries a player may see without seeing other
-- players' private rows. Each returns aggregates only, for the caller's own club.

-- group average per skill, from every player's latest rating (for the hexagon)
create or replace function public.club_skill_averages(p_club uuid)
returns table(skill text, avg_score numeric)
language sql stable security definer set search_path = public as $$
  select skill, round(avg(score), 1)
    from (select distinct on (player_id, skill) player_id, skill, score
            from ratings where club_id = p_club
           order by player_id, skill, created_at desc) latest
   where public.is_member(p_club)
   group by skill
$$;

-- standings: points and attendance this season for every active player in the club
create or replace function public.club_standings(p_club uuid)
returns table(member_id uuid, full_name text, group_id uuid, level numeric, points int, sessions int)
language sql stable security definer set search_path = public as $$
  select m.id, m.full_name, m.group_id, m.level,
         coalesce((select sum(p.amount) from points p
                    where p.member_id = m.id and p.amount > 0
                      and p.created_at >= date_trunc('year', now())), 0)::int,
         (select count(*) from attendance a where a.member_id = m.id
             and a.created_at >= date_trunc('year', now()))::int
    from members m
   where m.club_id = p_club and m.role = 'player' and m.status <> 'removed'
     and public.is_member(p_club)
$$;

-- how many said yes to each upcoming session (spots left), without showing who
create or replace function public.session_counts(p_club uuid)
returns table(session_id uuid, going int)
language sql stable security definer set search_path = public as $$
  select s.id, (select count(*) from rsvps r where r.session_id = s.id and r.status = 'in')::int
    from sessions s
   where s.club_id = p_club and s.starts_at > now() - interval '1 day'
     and public.is_member(p_club)
$$;

-- pending codes at the bar, with the player's name, for staff
create or replace function public.pending_codes(p_club uuid)
returns table(code text, item text, cost int, created_at timestamptz, player text)
language sql stable security definer set search_path = public as $$
  select r.code, r.item, r.cost, r.created_at, m.full_name
    from redemptions r join members m on m.id = r.member_id
   where r.club_id = p_club and r.status = 'pending'
     and r.created_at > now() - interval '10 minutes'
     and public.is_staff(p_club)
   order by r.created_at desc
$$;

-- the player finishes their own profile on first sign in
create or replace function public.set_my_name(p_name text) returns void
language sql security definer set search_path = public as $$
  update members set full_name = trim(p_name)
   where (user_id = auth.uid() or lower(email) = public.my_email())
     and trim(coalesce(p_name,'')) <> ''
$$;

-- coach sets a player's overall level
create or replace function public.set_level(p_member uuid, p_level numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  c := public.member_club(p_member);
  if not public.is_coach(c) then raise exception 'not allowed'; end if;
  update members set level = greatest(0, least(7, p_level)) where id = p_member;
end $$;

grant execute on function public.club_skill_averages(uuid) to authenticated;
grant execute on function public.club_standings(uuid) to authenticated;
grant execute on function public.session_counts(uuid) to authenticated;
grant execute on function public.pending_codes(uuid) to authenticated;
grant execute on function public.set_my_name(text) to authenticated;
grant execute on function public.set_level(uuid, numeric) to authenticated;
