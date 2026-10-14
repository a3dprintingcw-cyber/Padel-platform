-- Padel Vitals, part 8: cosmetics bought with points, friends, head to head.
-- Safe to run more than once.

-- ------------------------------------------------------------------ cosmetics
alter table public.members add column if not exists equipped jsonb not null default '{}'::jsonb;

create table if not exists public.cosmetics_owned (
  member_id  uuid not null references public.members(id) on delete cascade,
  item       text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, item)
);
alter table public.cosmetics_owned enable row level security;
drop policy if exists co_read on public.cosmetics_owned;
create policy co_read on public.cosmetics_owned for select using (member_id = public.my_member(public.member_club(member_id)));

-- the price list lives here, so the app can't be talked into a cheaper one
create or replace function public.cosmetic_price(p_item text) returns int
language sql immutable as $$
  select case p_item
    when 'frame.ice' then 300 when 'frame.sunset' then 400 when 'frame.gold' then 800 when 'frame.neon' then 1200
    when 'theme.ice' then 500 when 'theme.sunset' then 500 when 'theme.violet' then 500 when 'theme.rose' then 500
    when 'badge.fire' then 200 when 'badge.target' then 300 when 'badge.bolt' then 300 when 'badge.crown' then 1000
    else null end
$$;

create or replace function public.buy_cosmetic(p_club uuid, p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid; price int; bal int;
begin
  me := public.my_member(p_club);
  if me is null then raise exception 'not allowed'; end if;
  price := public.cosmetic_price(p_item);
  if price is null then raise exception 'unknown item'; end if;
  if exists (select 1 from cosmetics_owned where member_id = me and item = p_item) then raise exception 'already yours'; end if;
  perform 1 from members where id = me for update;
  select coalesce(sum(amount), 0) into bal from points where member_id = me;
  if bal < price then raise exception 'not enough points'; end if;
  insert into cosmetics_owned(member_id, item) values (me, p_item);
  insert into points(club_id, member_id, amount, reason) values (p_club, me, -price, 'Shop: ' || p_item);
  return bal - price;
end $$;

create or replace function public.equip_cosmetic(p_club uuid, p_slot text, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := public.my_member(p_club);
  if me is null or p_slot not in ('frame','theme','badge') then raise exception 'not allowed'; end if;
  if p_item is not null and (split_part(p_item, '.', 1) <> p_slot
     or not exists (select 1 from cosmetics_owned where member_id = me and item = p_item)) then
    raise exception 'not yours yet';
  end if;
  update members set equipped = case when p_item is null then equipped - p_slot else jsonb_set(equipped, array[p_slot], to_jsonb(p_item)) end
   where id = me;
end $$;
grant execute on function public.buy_cosmetic(uuid, text) to authenticated;
grant execute on function public.equip_cosmetic(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ friends (inside the club)
create table if not exists public.friendships (
  member_id  uuid not null references public.members(id) on delete cascade,
  friend_id  uuid not null references public.members(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (member_id, friend_id),
  check (member_id <> friend_id)
);
alter table public.friendships enable row level security;
drop policy if exists fr_read on public.friendships;
create policy fr_read on public.friendships for select
  using (member_id = public.my_member(public.member_club(member_id)) or friend_id = public.my_member(public.member_club(friend_id)));

create or replace function public.add_friend(p_friend uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c uuid; me uuid;
begin
  c := public.member_club(p_friend);
  me := public.my_member(c);
  if me is null or me = p_friend then raise exception 'not allowed'; end if;
  -- they already asked me: that's a yes
  if exists (select 1 from friendships where member_id = p_friend and friend_id = me) then
    update friendships set status = 'accepted' where member_id = p_friend and friend_id = me;
    insert into notifications(club_id, member_id, kind, data)
    values (c, p_friend, 'friendok', jsonb_build_object('by', (select full_name from members where id = me)));
    return 'accepted';
  end if;
  insert into friendships(member_id, friend_id) values (me, p_friend) on conflict do nothing;
  insert into notifications(club_id, member_id, kind, data)
  values (c, p_friend, 'friendreq', jsonb_build_object('by', (select full_name from members where id = me), 'from', me));
  return 'pending';
end $$;

create or replace function public.remove_friend(p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := public.my_member(public.member_club(p_friend));
  delete from friendships where (member_id = me and friend_id = p_friend) or (member_id = p_friend and friend_id = me);
end $$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
                 and ((member_id = a and friend_id = b) or (member_id = b and friend_id = a)))
$$;

-- a friend's card: only between accepted friends (coaches see everyone anyway)
create or replace function public.friend_profile(p_friend uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c uuid; me uuid; out jsonb;
begin
  c := public.member_club(p_friend);
  me := public.my_member(c);
  if me is null or not (public.are_friends(me, p_friend) or public.is_coach(c)) then raise exception 'not friends yet'; end if;
  select jsonb_build_object(
    'id', m.id, 'name', m.full_name, 'level', m.level, 'equipped', m.equipped,
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', skill, 'score', score)) from (
                 select distinct on (skill) skill, score from ratings where player_id = m.id order by skill, created_at desc) s), '[]'::jsonb)
  ) into out from members m where m.id = p_friend;
  return out;
end $$;

-- my record against everyone I've played on the other side of the net
create or replace function public.head_to_head(p_club uuid)
returns table(opponent uuid, full_name text, played int, won int)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_member(p_club) as id),
  mine as (
    select mt.id, mp.team, mt.winner from matches mt join match_players mp on mp.match_id = mt.id
     where mt.club_id = p_club and mt.status = 'played' and mp.member_id = (select id from me)
  )
  select o.member_id, m.full_name, count(*)::int, count(*) filter (where mine.team = mine.winner)::int
    from mine join match_players o on o.match_id = mine.id and o.team is not null and o.team <> mine.team
    join members m on m.id = o.member_id
   group by o.member_id, m.full_name
$$;
grant execute on function public.add_friend(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.friend_profile(uuid) to authenticated;
grant execute on function public.head_to_head(uuid) to authenticated;
