-- Padel Vitals database. Run once in the Supabase SQL editor.
-- Every club's data is fenced off by row level security: a person sees a club's rows
-- only through an active membership in that club, and what they can change depends
-- on their role there (owner, coach, staff, player). Platform admins see everything.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables

create table if not exists public.platform_admins (
  email text primary key
);

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text not null,              -- ISO code, e.g. US, ES
  region      text not null,              -- e.g. Florida, Madrid, or "Whole country"
  city        text,
  color       text default '#C8F542',
  logo_url    text,
  plan        text not null default 'club' check (plan in ('starter','club','academy','flagship')),
  status      text not null default 'trial' check (status in ('trial','active','paused','cancelled')),
  points_rules jsonb not null default '{"attended":50,"on_time":10,"camp":100,"drill":15,"friend":150,"tournament":200}',
  created_at  timestamptz not null default now()
);

-- one club per region: only one non-cancelled club may hold a territory
create unique index if not exists clubs_one_per_region
  on public.clubs (country, region) where status <> 'cancelled';

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null,
  days       text,
  created_at timestamptz not null default now()
);

-- A membership is a person in a club with a role. It is created by email (an invite);
-- user_id is filled in the first time that person signs in.
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  full_name   text not null default '',
  role        text not null check (role in ('owner','coach','staff','player')),
  group_id    uuid references public.groups(id) on delete set null,
  level       numeric(3,2) not null default 1.00,
  status      text not null default 'invited' check (status in ('invited','active','removed')),
  created_at  timestamptz not null default now(),
  unique (club_id, email)
);
create index if not exists members_user on public.members(user_id);
create index if not exists members_email on public.members(lower(email));

create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  group_id     uuid references public.groups(id) on delete set null,
  coach_id     uuid references public.members(id) on delete set null,
  kind         text not null default 'Group training',
  starts_at    timestamptz not null,
  duration_min int not null default 90,
  court        text,
  note         text,
  capacity     int not null default 8,
  points       int not null default 50,
  created_at   timestamptz not null default now()
);
create index if not exists sessions_club_time on public.sessions(club_id, starts_at);

create table if not exists public.rsvps (
  session_id uuid not null references public.sessions(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  status     text not null check (status in ('in','out')),
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
);

create table if not exists public.attendance (
  session_id uuid not null references public.sessions(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  checked_by uuid references public.members(id) on delete set null,
  on_time    boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (session_id, member_id)
);

-- every score a coach gives is kept, so progress over time is real history
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  player_id  uuid not null references public.members(id) on delete cascade,
  coach_id   uuid references public.members(id) on delete set null,
  skill      text not null,
  score      numeric(3,1) not null check (score between 0 and 10),
  created_at timestamptz not null default now()
);
create index if not exists ratings_player on public.ratings(player_id, skill, created_at desc);

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  player_id  uuid not null references public.members(id) on delete cascade,
  coach_id   uuid references public.members(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.drills (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  title      text not null,
  level      text not null default 'All levels',
  duration   text,
  kit        text,
  video_url  text,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.drill_done (
  drill_id   uuid not null references public.drills(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drill_id, member_id)
);

-- points are a ledger: balance is the sum, nothing is ever overwritten
create table if not exists public.points (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  amount     int not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists points_member on public.points(member_id);

create table if not exists public.rewards (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null,
  detail     text,
  icon       text,
  cost       int not null check (cost > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  reward_id    uuid references public.rewards(id) on delete set null,
  item         text not null,
  cost         int not null,
  code         text not null,
  status       text not null default 'pending' check (status in ('pending','confirmed','expired')),
  confirmed_by uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (club_id, code)
);

-- ------------------------------------------------------------------ helpers
-- security definer so policies can ask "who am I in this club" without recursing

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where lower(email) = public.my_email())
$$;

create or replace function public.my_member(club uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members
   where club_id = club and status = 'active'
     and (user_id = auth.uid() or lower(email) = public.my_email())
   limit 1
$$;

create or replace function public.my_role(club uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members
   where club_id = club and status = 'active'
     and (user_id = auth.uid() or lower(email) = public.my_email())
   limit 1
$$;

create or replace function public.is_member(club uuid) returns boolean
language sql stable as $$ select public.my_role(club) is not null or public.is_platform_admin() $$;

create or replace function public.is_staff(club uuid) returns boolean
language sql stable as $$ select public.my_role(club) in ('owner','coach','staff') or public.is_platform_admin() $$;

create or replace function public.is_coach(club uuid) returns boolean
language sql stable as $$ select public.my_role(club) in ('owner','coach') or public.is_platform_admin() $$;

create or replace function public.is_owner(club uuid) returns boolean
language sql stable as $$ select public.my_role(club) = 'owner' or public.is_platform_admin() $$;

-- the club a row belongs to, for tables that only know a member or session
create or replace function public.member_club(m uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from members where id = m $$;
create or replace function public.session_club(s uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from sessions where id = s $$;

-- ------------------------------------------------------------------ row level security

alter table public.platform_admins enable row level security;
alter table public.clubs        enable row level security;
alter table public.groups       enable row level security;
alter table public.members      enable row level security;
alter table public.sessions     enable row level security;
alter table public.rsvps        enable row level security;
alter table public.attendance   enable row level security;
alter table public.ratings      enable row level security;
alter table public.notes        enable row level security;
alter table public.drills       enable row level security;
alter table public.drill_done   enable row level security;
alter table public.points       enable row level security;
alter table public.rewards      enable row level security;
alter table public.redemptions  enable row level security;

-- platform admins: only readable by themselves
drop policy if exists pa_self on public.platform_admins;
create policy pa_self on public.platform_admins for select using (public.is_platform_admin());

-- clubs
drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select using (public.is_member(id));
drop policy if exists clubs_owner_update on public.clubs;
create policy clubs_owner_update on public.clubs for update using (public.is_owner(id)) with check (public.is_owner(id));
drop policy if exists clubs_admin_insert on public.clubs;
create policy clubs_admin_insert on public.clubs for insert with check (public.is_platform_admin());
drop policy if exists clubs_admin_delete on public.clubs;
create policy clubs_admin_delete on public.clubs for delete using (public.is_platform_admin());

-- groups: members read, coaches write
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select using (public.is_member(club_id));
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups for all using (public.is_coach(club_id)) with check (public.is_coach(club_id));

-- members: everyone in the club sees the roster (names, groups, levels for standings);
-- coaches add and edit players, only owners add or change coaches, staff and owners
drop policy if exists members_read on public.members;
create policy members_read on public.members for select
  using (public.is_member(club_id) or user_id = auth.uid() or lower(email) = public.my_email());
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert
  with check (public.is_owner(club_id) or (public.is_coach(club_id) and role = 'player'));
drop policy if exists members_update on public.members;
create policy members_update on public.members for update
  using (public.is_owner(club_id) or (public.is_coach(club_id) and role = 'player'))
  with check (public.is_owner(club_id) or (public.is_coach(club_id) and role = 'player'));
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete using (public.is_owner(club_id));

-- sessions: members read, coaches write
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select using (public.is_member(club_id));
drop policy if exists sessions_write on public.sessions;
create policy sessions_write on public.sessions for all using (public.is_coach(club_id)) with check (public.is_coach(club_id));

-- rsvps: a player answers for themself, staff see all in the club
drop policy if exists rsvps_read on public.rsvps;
create policy rsvps_read on public.rsvps for select
  using (member_id = public.my_member(public.session_club(session_id)) or public.is_staff(public.session_club(session_id)));
drop policy if exists rsvps_write on public.rsvps;
create policy rsvps_write on public.rsvps for all
  using (member_id = public.my_member(public.session_club(session_id)))
  with check (member_id = public.my_member(public.session_club(session_id)));

-- attendance: players read their own, staff check people in
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select
  using (member_id = public.my_member(public.session_club(session_id)) or public.is_staff(public.session_club(session_id)));
drop policy if exists att_write on public.attendance;
create policy att_write on public.attendance for all
  using (public.is_staff(public.session_club(session_id)))
  with check (public.is_staff(public.session_club(session_id)));

-- ratings and notes: a player reads their own, coaches read and write the club's
drop policy if exists ratings_read on public.ratings;
create policy ratings_read on public.ratings for select
  using (player_id = public.my_member(club_id) or public.is_coach(club_id));
drop policy if exists ratings_write on public.ratings;
create policy ratings_write on public.ratings for insert with check (public.is_coach(club_id));
drop policy if exists notes_read on public.notes;
create policy notes_read on public.notes for select
  using (player_id = public.my_member(club_id) or public.is_coach(club_id));
drop policy if exists notes_write on public.notes;
create policy notes_write on public.notes for all using (public.is_coach(club_id)) with check (public.is_coach(club_id));

-- drills: members read, coaches write; a player marks their own as done
drop policy if exists drills_read on public.drills;
create policy drills_read on public.drills for select using (public.is_member(club_id));
drop policy if exists drills_write on public.drills;
create policy drills_write on public.drills for all using (public.is_coach(club_id)) with check (public.is_coach(club_id));
drop policy if exists dd_read on public.drill_done;
create policy dd_read on public.drill_done for select
  using (member_id = public.my_member(public.member_club(member_id)) or public.is_coach(public.member_club(member_id)));

-- points: read your own, staff read the club's; writes only through the functions below
drop policy if exists points_read on public.points;
create policy points_read on public.points for select
  using (member_id = public.my_member(club_id) or public.is_staff(club_id));
drop policy if exists points_staff_write on public.points;
create policy points_staff_write on public.points for insert with check (public.is_coach(club_id));

-- rewards: members read the menu, owners and staff edit it
drop policy if exists rewards_read on public.rewards;
create policy rewards_read on public.rewards for select using (public.is_member(club_id));
drop policy if exists rewards_write on public.rewards;
create policy rewards_write on public.rewards for all
  using (public.my_role(club_id) in ('owner','staff') or public.is_platform_admin())
  with check (public.my_role(club_id) in ('owner','staff') or public.is_platform_admin());

-- redemptions: read your own, staff read the club's; created and confirmed through functions
drop policy if exists red_read on public.redemptions;
create policy red_read on public.redemptions for select
  using (member_id = public.my_member(club_id) or public.is_staff(club_id));

-- ------------------------------------------------------------------ actions
-- Anything that moves points goes through these, so a player can't award themself.

-- link invites to the signed in user; call once after every sign in
create or replace function public.claim_memberships() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update members set user_id = auth.uid(), status = 'active'
   where lower(email) = public.my_email() and status <> 'removed'
     and (user_id is null or user_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

-- coach checks a player in: attendance plus the session's points, once
create or replace function public.check_in(p_session uuid, p_member uuid, p_on_time boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid; pts int; rules jsonb;
begin
  select club_id, points into c, pts from sessions where id = p_session;
  if c is null or not public.is_staff(c) then raise exception 'not allowed'; end if;
  if public.member_club(p_member) <> c then raise exception 'wrong club'; end if;
  insert into attendance(session_id, member_id, checked_by, on_time)
    values (p_session, p_member, public.my_member(c), p_on_time)
    on conflict do nothing;
  if found then
    select points_rules into rules from clubs where id = c;
    insert into points(club_id, member_id, amount, reason) values (c, p_member, pts, 'Training attended');
    if p_on_time then
      insert into points(club_id, member_id, amount, reason)
        values (c, p_member, coalesce((rules->>'on_time')::int, 10), 'On time');
    end if;
  end if;
end $$;

-- undo a check in, and the points that came with it
create or replace function public.undo_check_in(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid; pts int; rules jsonb; a attendance%rowtype;
begin
  select club_id, points into c, pts from sessions where id = p_session;
  if c is null or not public.is_staff(c) then raise exception 'not allowed'; end if;
  delete from attendance where session_id = p_session and member_id = p_member returning * into a;
  if a.member_id is not null then
    select points_rules into rules from clubs where id = c;
    insert into points(club_id, member_id, amount, reason)
      values (c, p_member, -(pts + case when a.on_time then coalesce((rules->>'on_time')::int, 10) else 0 end), 'Check in undone');
  end if;
end $$;

-- a player finishes a home drill: recorded once, points once
create or replace function public.complete_drill(p_drill uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid; me uuid; rules jsonb;
begin
  select club_id into c from drills where id = p_drill;
  me := public.my_member(c);
  if me is null then raise exception 'not a member'; end if;
  insert into drill_done(drill_id, member_id) values (p_drill, me) on conflict do nothing;
  if found then
    select points_rules into rules from clubs where id = c;
    insert into points(club_id, member_id, amount, reason)
      values (c, me, coalesce((rules->>'drill')::int, 15), 'Home drill');
  end if;
end $$;

-- a player redeems a reward: balance checked, points taken, a 5 character code made
create or replace function public.redeem(p_reward uuid) returns table(code text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare r rewards%rowtype; me uuid; bal int; cd text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  select * into r from rewards where id = p_reward and active;
  if r.id is null then raise exception 'no such reward'; end if;
  me := public.my_member(r.club_id);
  if me is null then raise exception 'not a member'; end if;
  select coalesce(sum(amount),0) into bal from points where member_id = me;
  if bal < r.cost then raise exception 'not enough points'; end if;
  loop
    cd := '';
    for i in 1..5 loop cd := cd || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from redemptions x where x.club_id = r.club_id and x.code = cd);
  end loop;
  insert into points(club_id, member_id, amount, reason) values (r.club_id, me, -r.cost, 'Redeemed: ' || r.name);
  insert into redemptions(club_id, member_id, reward_id, item, cost, code)
    values (r.club_id, me, r.id, r.name, r.cost, cd);
  return query select cd, now();
end $$;

-- bar staff confirm a code; codes live ten minutes, an expired one gives the points back
create or replace function public.confirm_code(p_club uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x redemptions%rowtype; who text;
begin
  if not public.is_staff(p_club) then raise exception 'not allowed'; end if;
  select * into x from redemptions where club_id = p_club and code = upper(trim(p_code));
  if x.id is null then return jsonb_build_object('status','unknown'); end if;
  select full_name into who from members where id = x.member_id;
  if x.status = 'confirmed' then return jsonb_build_object('status','used','item',x.item,'player',who); end if;
  if x.status = 'expired' or x.created_at < now() - interval '10 minutes' then
    if x.status = 'pending' then
      update redemptions set status = 'expired' where id = x.id;
      insert into points(club_id, member_id, amount, reason) values (x.club_id, x.member_id, x.cost, 'Expired code refunded');
    end if;
    return jsonb_build_object('status','expired','item',x.item,'player',who);
  end if;
  update redemptions set status = 'confirmed', confirmed_by = public.my_member(p_club), confirmed_at = now() where id = x.id;
  return jsonb_build_object('status','confirmed','item',x.item,'player',who);
end $$;

-- platform admin: create a club and invite its owner in one step
create or replace function public.create_club(p_name text, p_country text, p_region text, p_city text,
                                              p_plan text, p_owner_email text, p_owner_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if not public.is_platform_admin() then raise exception 'not allowed'; end if;
  insert into clubs(name, country, region, city, plan) values (p_name, p_country, p_region, p_city, coalesce(p_plan,'club'))
    returning id into c;
  insert into members(club_id, email, full_name, role, status)
    values (c, lower(trim(p_owner_email)), coalesce(p_owner_name,''), 'owner', 'invited');
  insert into rewards(club_id, name, detail, icon, cost) values
    (c,'Water','Cold bottle','💧',40),(c,'Sports drink','From the bar','🥤',60),
    (c,'Smoothie','Fresh fruit','🍹',120),(c,'Overgrip','Any color','🎾',150),
    (c,'Tube of balls','3 match balls','🥫',400),(c,'Club cap','Club merch','🧢',600);
  return c;
end $$;

-- the website's regions page: which territories are taken, readable by anyone
create or replace view public.territories with (security_invoker = false) as
  select country, region,
         case when status = 'trial' then 'talks' else 'taken' end as status,
         case when status = 'active' then name end as club
    from public.clubs where status in ('trial','active','paused');
grant select on public.territories to anon, authenticated;

-- grants for the functions the app calls
grant execute on function public.claim_memberships() to authenticated;
grant execute on function public.check_in(uuid, uuid, boolean) to authenticated;
grant execute on function public.undo_check_in(uuid, uuid) to authenticated;
grant execute on function public.complete_drill(uuid) to authenticated;
grant execute on function public.redeem(uuid) to authenticated;
grant execute on function public.confirm_code(uuid, text) to authenticated;
grant execute on function public.create_club(text, text, text, text, text, text, text) to authenticated;

-- Adrian runs the platform
insert into public.platform_admins(email) values ('asccur@gmail.com'), ('a3dprinting.cw@gmail.com')
  on conflict do nothing;
