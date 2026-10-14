-- Padel Vitals, part 3: focus goals, video clips on ratings, notifications, phone push.
-- Safe to run more than once.

-- ------------------------------------------------------------------ focus goals
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  player_id   uuid not null references public.members(id) on delete cascade,
  coach_id    uuid references public.members(id) on delete set null,
  skill       text not null,
  start_score numeric(3,1) not null default 0,
  target      numeric(3,1) not null check (target between 0 and 10),
  due         date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists goals_player on public.goals(player_id, created_at desc);
alter table public.goals enable row level security;
drop policy if exists goals_read on public.goals;
create policy goals_read on public.goals for select
  using (player_id = public.my_member(club_id) or public.is_coach(club_id));
drop policy if exists goals_write on public.goals;
create policy goals_write on public.goals for all
  using (public.is_coach(club_id)) with check (public.is_coach(club_id));

-- a goal is reached the moment a rating hits the target
create or replace function public.goal_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update goals set done_at = now()
   where player_id = new.player_id and skill = new.skill and done_at is null and new.score >= target;
  return new;
end $$;
drop trigger if exists ratings_goal_check on public.ratings;
create trigger ratings_goal_check after insert on public.ratings
  for each row execute function public.goal_check();

-- ------------------------------------------------------------------ video clips on ratings
alter table public.ratings add column if not exists video_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', false, 52428800, array['video/mp4','video/quicktime','video/webm','video/3gpp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- path: <club_id>/<player_member_id>/<file>
drop policy if exists clips_insert on storage.objects;
create policy clips_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and public.is_coach(((storage.foldername(name))[1])::uuid));
drop policy if exists clips_read on storage.objects;
create policy clips_read on storage.objects for select to authenticated
  using (bucket_id = 'clips' and (
    public.is_coach(((storage.foldername(name))[1])::uuid)
    or public.my_member(((storage.foldername(name))[1])::uuid) = ((storage.foldername(name))[2])::uuid));
drop policy if exists clips_delete on storage.objects;
create policy clips_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clips' and public.is_coach(((storage.foldername(name))[1])::uuid));

-- ------------------------------------------------------------------ notifications
-- kind + data only; the app writes the sentence in the reader's language
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notif_member on public.notifications(member_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select using (member_id = public.my_member(club_id));
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update
  using (member_id = public.my_member(club_id)) with check (member_id = public.my_member(club_id));

create or replace function public.notify_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare by_name text; recent uuid;
begin
  select full_name into by_name from members where id = new.coach_id;
  -- several shots rated in one sitting become one notification
  select id into recent from notifications
   where member_id = new.player_id and kind = 'rating' and read_at is null
     and created_at > now() - interval '30 minutes'
   order by created_at desc limit 1;
  if recent is not null then
    update notifications
       set data = jsonb_set(data, '{shots}', coalesce(data->'shots','[]'::jsonb) ||
                  jsonb_build_array(jsonb_build_object('skill', new.skill, 'score', new.score))),
           created_at = now()
     where id = recent;
  else
    insert into notifications(club_id, member_id, kind, data)
    values (new.club_id, new.player_id, 'rating',
            jsonb_build_object('by', by_name, 'video', new.video_path is not null,
                               'shots', jsonb_build_array(jsonb_build_object('skill', new.skill, 'score', new.score))));
  end if;
  return new;
end $$;
drop trigger if exists ratings_notify on public.ratings;
create trigger ratings_notify after insert on public.ratings for each row execute function public.notify_rating();

create or replace function public.notify_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(club_id, member_id, kind, data)
  select new.club_id, new.player_id, 'note', jsonb_build_object('by', m.full_name, 'body', left(new.body, 140))
    from members m where m.id = new.coach_id;
  return new;
end $$;
drop trigger if exists notes_notify on public.notes;
create trigger notes_notify after insert on public.notes for each row execute function public.notify_note();

create or replace function public.notify_drill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(club_id, member_id, kind, data)
  select new.club_id, m.id, 'drill', jsonb_build_object('title', new.title)
    from members m where m.club_id = new.club_id and m.role = 'player' and m.status <> 'removed';
  return new;
end $$;
drop trigger if exists drills_notify on public.drills;
create trigger drills_notify after insert on public.drills for each row execute function public.notify_drill();

create or replace function public.notify_goal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications(club_id, member_id, kind, data)
    values (new.club_id, new.player_id, 'goal', jsonb_build_object('skill', new.skill, 'target', new.target));
  elsif new.done_at is not null and old.done_at is null then
    insert into notifications(club_id, member_id, kind, data)
    values (new.club_id, new.player_id, 'goaldone', jsonb_build_object('skill', new.skill, 'target', new.target));
  end if;
  return new;
end $$;
drop trigger if exists goals_notify on public.goals;
create trigger goals_notify after insert or update on public.goals for each row execute function public.notify_goal();

-- level up: remember every change so the player gets a card and the report shows the climb
create table if not exists public.level_history (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  level      numeric(4,2) not null,
  created_at timestamptz not null default now()
);
alter table public.level_history enable row level security;
drop policy if exists lh_read on public.level_history;
create policy lh_read on public.level_history for select
  using (member_id = public.my_member(club_id) or public.is_coach(club_id));

create or replace function public.level_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level is distinct from old.level then
    insert into level_history(club_id, member_id, level) values (new.club_id, new.id, new.level);
    if new.level > coalesce(old.level, 0) and new.role = 'player' then
      insert into notifications(club_id, member_id, kind, data)
      values (new.club_id, new.id, 'levelup', jsonb_build_object('level', new.level, 'from', old.level));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists members_level on public.members;
create trigger members_level after update of level on public.members for each row execute function public.level_changed();

-- ------------------------------------------------------------------ phone push subscriptions
create table if not exists public.push_subs (
  endpoint   text primary key,
  member_id  uuid not null references public.members(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all
  using (member_id = public.my_member(club_id)) with check (member_id = public.my_member(club_id));

-- ------------------------------------------------------------------ report: one player's month for coaches, owners and the player
create or replace function public.player_report(p_member uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c uuid; out jsonb;
begin
  c := public.member_club(p_member);
  if not (public.is_coach(c) or public.my_member(c) = p_member) then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'player', (select jsonb_build_object('name', m.full_name, 'email', m.email, 'level', m.level,
                 'group', (select name from groups g where g.id = m.group_id)) from members m where m.id = p_member),
    'club', (select jsonb_build_object('name', name, 'city', city, 'color', color) from clubs where id = c),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('skill', skill, 'score', score, 'at', created_at) order by created_at)
                  from ratings where player_id = p_member and created_at < p_to), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'at', n.created_at,
                  'by', (select full_name from members where id = n.coach_id)) order by n.created_at desc)
                  from notes n where n.player_id = p_member and n.created_at between p_from and p_to), '[]'::jsonb),
    'attended', (select count(*) from attendance where member_id = p_member and created_at between p_from and p_to),
    'offered', (select count(*) from sessions s, members m where m.id = p_member and s.club_id = c
                  and (s.group_id is null or s.group_id = m.group_id) and s.starts_at between p_from and p_to),
    'points', (select coalesce(sum(amount),0) from points where member_id = p_member and amount > 0 and created_at between p_from and p_to),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('skill', skill, 'target', target, 'start', start_score, 'done', done_at))
                  from goals where player_id = p_member), '[]'::jsonb),
    'levels', coalesce((select jsonb_agg(jsonb_build_object('level', level, 'at', created_at) order by created_at)
                  from level_history where member_id = p_member), '[]'::jsonb)
  ) into out;
  return out;
end $$;
grant execute on function public.player_report(uuid, timestamptz, timestamptz) to authenticated;
