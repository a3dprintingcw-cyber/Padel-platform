-- Padel Vitals, part 6: sales pipeline, QR join, announcements, weekly challenges,
-- club feed with cheers, private lesson booking. Safe to run more than once.

-- ------------------------------------------------------------------ sales pipeline
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  club_name   text not null,
  country     text,
  region      text,
  city        text,
  contact     text,
  email       text,
  phone       text,
  players     int,
  coaches     int,
  plan        text,
  notes       text,
  lang        text,
  status      text not null default 'new' check (status in ('new','contacted','demo','won','lost')),
  follow_up   date,
  admin_notes text,
  created_at  timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists leads_admin on public.leads;
create policy leads_admin on public.leads for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- the website form can only add a new lead, with sane sizes, and read nothing back
create or replace function public.submit_lead(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p->>'club_name'), '') = '' then raise exception 'club name needed'; end if;
  insert into leads(club_name, country, region, city, contact, email, phone, players, coaches, plan, notes, lang)
  values (left(trim(p->>'club_name'), 120), left(p->>'country', 4), left(p->>'region', 80), left(p->>'city', 80),
          left(p->>'contact', 120), left(lower(p->>'email'), 160), left(p->>'phone', 40),
          least(greatest(coalesce(nullif(p->>'players','')::int, 0), 0), 100000),
          least(greatest(coalesce(nullif(p->>'coaches','')::int, 0), 0), 1000),
          left(p->>'plan', 20), left(p->>'notes', 2000), left(p->>'lang', 5));
end $$;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ join by QR code
alter table public.clubs add column if not exists join_code text;
create unique index if not exists clubs_join_code on public.clubs(join_code) where join_code is not null;

create table if not exists public.join_requests (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  status     text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);
alter table public.join_requests enable row level security;
drop policy if exists jr_read on public.join_requests;
create policy jr_read on public.join_requests for select using (user_id = auth.uid() or public.is_coach(club_id));

-- owner (or coach) gets the club's code, made on first use
create or replace function public.club_join_code(p_club uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_coach(p_club) then raise exception 'not allowed'; end if;
  select join_code into c from clubs where id = p_club;
  if c is null then
    loop
      c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      exit when not exists (select 1 from clubs where join_code = c);
    end loop;
    perform set_config('pv.trusted', 'on', true);
    update clubs set join_code = c where id = p_club;
  end if;
  return c;
end $$;

-- what the join screen shows before asking: the club's name only
create or replace function public.club_by_code(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'city', city) from clubs
   where join_code = upper(p_code) and status in ('trial','active')
$$;

create or replace function public.request_join(p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare c clubs; em text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into c from clubs where join_code = upper(p_code) and status in ('trial','active');
  if c.id is null then raise exception 'unknown club code'; end if;
  em := public.my_email();
  if exists (select 1 from members where club_id = c.id and lower(email) = em and status <> 'removed') then return 'member'; end if;
  insert into join_requests(club_id, user_id, email, full_name)
  values (c.id, auth.uid(), em, left(coalesce(p_name, ''), 120))
  on conflict (club_id, user_id) do update set status = 'pending', full_name = excluded.full_name, created_at = now()
    where join_requests.status = 'declined';
  insert into notifications(club_id, member_id, kind, data)
  select c.id, m.id, 'joinreq', jsonb_build_object('name', coalesce(nullif(p_name, ''), em))
    from members m where m.club_id = c.id and m.role in ('owner','coach') and m.status = 'active';
  return 'pending';
end $$;

create or replace function public.answer_join(p_request uuid, p_ok boolean, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests;
begin
  select * into r from join_requests where id = p_request;
  if r.id is null or not public.is_coach(r.club_id) then raise exception 'not allowed'; end if;
  update join_requests set status = case when p_ok then 'approved' else 'declined' end where id = p_request;
  if p_ok then
    insert into members(club_id, user_id, email, full_name, role, group_id, status)
    values (r.club_id, r.user_id, lower(r.email), r.full_name, 'player', p_group, 'active')
    on conflict (club_id, email) do update set status = 'active', user_id = excluded.user_id,
      group_id = coalesce(excluded.group_id, members.group_id), full_name = coalesce(nullif(members.full_name, ''), excluded.full_name);
  end if;
end $$;
grant execute on function public.club_join_code(uuid) to authenticated;
grant execute on function public.club_by_code(text) to anon, authenticated;
grant execute on function public.request_join(text, text) to authenticated;
grant execute on function public.answer_join(uuid, boolean, uuid) to authenticated;

-- ------------------------------------------------------------------ announcements to players
create or replace function public.announce(p_club uuid, p_group uuid, p_title text, p_body text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; by_name text;
begin
  if not public.is_coach(p_club) then raise exception 'not allowed'; end if;
  select full_name into by_name from members where id = public.my_member(p_club);
  insert into notifications(club_id, member_id, kind, data)
  select p_club, m.id, 'announce', jsonb_build_object('title', left(p_title, 120), 'body', left(p_body, 600), 'by', by_name)
    from members m
   where m.club_id = p_club and m.status <> 'removed' and m.role in ('player','coach','staff')
     and (p_group is null or m.group_id = p_group);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.announce(uuid, uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ weekly challenges
create table if not exists public.challenge_claims (
  member_id  uuid not null references public.members(id) on delete cascade,
  week       date not null,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, week, key)
);
alter table public.challenge_claims enable row level security;
drop policy if exists cc_read on public.challenge_claims;
create policy cc_read on public.challenge_claims for select using (member_id = public.my_member(public.member_club(member_id)));

-- the rules live here so nobody can award themselves points
create or replace function public.my_challenges(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid; wk date; tr int; dr int; mt int; streak int := 0; d date;
begin
  me := public.my_member(p_club);
  if me is null then return null; end if;
  wk := date_trunc('week', now())::date;
  select count(*) into tr from attendance where member_id = me and created_at >= wk;
  select count(*) into dr from drill_done where member_id = me and created_at >= wk;
  select count(*) into mt from match_players mp join matches m on m.id = mp.match_id
   where mp.member_id = me and m.status = 'played' and m.starts_at >= wk;
  -- streak: weeks in a row with at least one training, counting back from this week (or last, if this one is still empty)
  d := wk;
  if tr = 0 then d := wk - 7; end if;
  loop
    exit when not exists (select 1 from attendance where member_id = me and created_at >= d and created_at < d + 7);
    streak := streak + 1; d := d - 7;
    exit when streak > 104;
  end loop;
  return jsonb_build_object('week', wk, 'streak', streak, 'items', jsonb_build_array(
    jsonb_build_object('key','train3','target',3,'progress',tr,'points',50,
                       'claimed', exists(select 1 from challenge_claims where member_id = me and week = wk and key = 'train3')),
    jsonb_build_object('key','drills2','target',2,'progress',dr,'points',30,
                       'claimed', exists(select 1 from challenge_claims where member_id = me and week = wk and key = 'drills2')),
    jsonb_build_object('key','match1','target',1,'progress',mt,'points',30,
                       'claimed', exists(select 1 from challenge_claims where member_id = me and week = wk and key = 'match1'))));
end $$;

create or replace function public.claim_challenge(p_club uuid, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid; st jsonb; it jsonb; wk date;
begin
  me := public.my_member(p_club);
  if me is null then raise exception 'not allowed'; end if;
  st := public.my_challenges(p_club);
  wk := (st->>'week')::date;
  select x into it from jsonb_array_elements(st->'items') x where x->>'key' = p_key;
  if it is null then raise exception 'unknown challenge'; end if;
  if (it->>'claimed')::boolean then raise exception 'already claimed'; end if;
  if (it->>'progress')::int < (it->>'target')::int then raise exception 'not done yet'; end if;
  insert into challenge_claims(member_id, week, key) values (me, wk, p_key);
  insert into points(club_id, member_id, amount, reason) values (p_club, me, (it->>'points')::int, 'Weekly challenge');
  return (it->>'points')::int;
end $$;
grant execute on function public.my_challenges(uuid) to authenticated;
grant execute on function public.claim_challenge(uuid, text) to authenticated;

-- ------------------------------------------------------------------ club feed and cheers
create table if not exists public.club_feed (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists feed_club on public.club_feed(club_id, created_at desc);
create table if not exists public.cheers (
  feed_id    uuid not null references public.club_feed(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  emoji      text not null check (emoji in ('fire','clap','muscle')),
  created_at timestamptz not null default now(),
  primary key (feed_id, member_id)
);
alter table public.club_feed enable row level security;
alter table public.cheers enable row level security;
drop policy if exists feed_read on public.club_feed;
create policy feed_read on public.club_feed for select using (public.is_member(club_id));
create or replace function public.feed_club(f uuid) returns uuid
language sql stable security definer set search_path = public as $$ select club_id from club_feed where id = f $$;
drop policy if exists cheers_read on public.cheers;
create policy cheers_read on public.cheers for select using (public.is_member(public.feed_club(feed_id)));

create or replace function public.cheer(p_feed uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare f club_feed; me uuid;
begin
  select * into f from club_feed where id = p_feed;
  me := public.my_member(f.club_id);
  if me is null then raise exception 'not allowed'; end if;
  if p_emoji is null then delete from cheers where feed_id = p_feed and member_id = me; return; end if;
  insert into cheers(feed_id, member_id, emoji) values (p_feed, me, p_emoji)
  on conflict (feed_id, member_id) do update set emoji = excluded.emoji;
  if f.member_id <> me and not exists (
      select 1 from notifications where member_id = f.member_id and kind = 'cheer' and data->>'feed' = p_feed::text
        and data->>'from' = me::text) then
    insert into notifications(club_id, member_id, kind, data)
    values (f.club_id, f.member_id, 'cheer', jsonb_build_object('feed', p_feed, 'from', me, 'emoji', p_emoji,
            'by', (select full_name from members where id = me), 'what', f.kind));
  end if;
end $$;
grant execute on function public.cheer(uuid, text) to authenticated;

-- feed entries come from things that already happen
create or replace function public.feed_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'player' and new.level > coalesce(old.level, 0) then
    insert into club_feed(club_id, member_id, kind, data) values (new.club_id, new.id, 'levelup', jsonb_build_object('level', new.level));
  end if;
  return new;
end $$;
drop trigger if exists members_feed on public.members;
create trigger members_feed after update of level on public.members for each row execute function public.feed_level();

create or replace function public.feed_goal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done_at is not null and old.done_at is null then
    insert into club_feed(club_id, member_id, kind, data) values (new.club_id, new.player_id, 'goal', jsonb_build_object('skill', new.skill, 'target', new.target));
  end if;
  return new;
end $$;
drop trigger if exists goals_feed on public.goals;
create trigger goals_feed after update on public.goals for each row execute function public.feed_goal();

create or replace function public.feed_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played' and old.status <> 'played' then
    insert into club_feed(club_id, member_id, kind, data)
    select new.club_id, mp.member_id, 'matchwin', jsonb_build_object('score', new.score, 'match', new.id)
      from match_players mp where mp.match_id = new.id and mp.team = new.winner;
  end if;
  return new;
end $$;
drop trigger if exists matches_feed on public.matches;
create trigger matches_feed after update on public.matches for each row execute function public.feed_match();

-- ------------------------------------------------------------------ private lessons
create table if not exists public.lesson_slots (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  coach_id   uuid not null references public.members(id) on delete cascade,
  starts_at  timestamptz not null,
  minutes    int not null default 60 check (minutes between 15 and 240),
  price      text,
  note       text,
  booked_by  uuid references public.members(id) on delete set null,
  booked_at  timestamptz,
  status     text not null default 'open' check (status in ('open','booked','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists slots_club on public.lesson_slots(club_id, starts_at);
alter table public.lesson_slots enable row level security;
drop policy if exists slots_read on public.lesson_slots;
create policy slots_read on public.lesson_slots for select using (public.is_member(club_id));
drop policy if exists slots_coach on public.lesson_slots;
create policy slots_coach on public.lesson_slots for insert
  with check (public.is_coach(club_id) and coach_id = public.my_member(club_id) and status = 'open' and booked_by is null);
drop policy if exists slots_coach_del on public.lesson_slots;
create policy slots_coach_del on public.lesson_slots for delete
  using (coach_id = public.my_member(club_id) and booked_by is null);

create or replace function public.book_lesson(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s lesson_slots; me uuid;
begin
  select * into s from lesson_slots where id = p_slot for update;
  me := public.my_member(s.club_id);
  if me is null then raise exception 'not allowed'; end if;
  if s.status <> 'open' or s.starts_at < now() then raise exception 'slot taken'; end if;
  update lesson_slots set status = 'booked', booked_by = me, booked_at = now() where id = p_slot;
  insert into notifications(club_id, member_id, kind, data)
  values (s.club_id, s.coach_id, 'lessonbooked', jsonb_build_object('slot', p_slot, 'at', s.starts_at, 'by', (select full_name from members where id = me)));
end $$;

-- the player can cancel up to 24 hours before; the coach any time
create or replace function public.cancel_lesson(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s lesson_slots; me uuid;
begin
  select * into s from lesson_slots where id = p_slot for update;
  me := public.my_member(s.club_id);
  if me is null then raise exception 'not allowed'; end if;
  if s.coach_id = me then
    update lesson_slots set status = 'cancelled' where id = p_slot;
    if s.booked_by is not null then
      insert into notifications(club_id, member_id, kind, data)
      values (s.club_id, s.booked_by, 'lessoncancel', jsonb_build_object('slot', p_slot, 'at', s.starts_at, 'by', (select full_name from members where id = me)));
    end if;
  elsif s.booked_by = me then
    if s.starts_at < now() + interval '24 hours' then raise exception 'less than 24 hours: message your coach'; end if;
    update lesson_slots set status = 'open', booked_by = null, booked_at = null where id = p_slot;
    insert into notifications(club_id, member_id, kind, data)
    values (s.club_id, s.coach_id, 'lessoncancel', jsonb_build_object('slot', p_slot, 'at', s.starts_at, 'by', (select full_name from members where id = me)));
  else
    raise exception 'not allowed';
  end if;
end $$;
grant execute on function public.book_lesson(uuid) to authenticated;
grant execute on function public.cancel_lesson(uuid) to authenticated;
