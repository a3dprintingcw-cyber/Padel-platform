-- Padel Vitals, part 11: anyone can sign up.
-- A new account with no club is a player at zero with everything locked. "Start training"
-- lets them pick a Padel Vitals club and send it a request with their WhatsApp number, so
-- every sign up becomes a lead for a club. When the club approves (or adds the email by hand)
-- the account switches on by itself. Safe to run more than once.

alter table public.join_requests add column if not exists phone  text;
alter table public.join_requests add column if not exists note   text;
alter table public.join_requests add column if not exists source text not null default 'code';

-- where the club is, so "Find my club" can list the closest first. Filled from the club's city
-- when the owner saves the club page; the app looks it up itself for clubs that have none yet.
alter table public.clubs add column if not exists lat double precision;
alter table public.clubs add column if not exists lng double precision;

-- the clubs someone can start training at: public facts only
drop function if exists public.open_clubs();
create or replace function public.open_clubs()
returns table(id uuid, name text, city text, region text, country text, logo_url text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.region, c.country, c.logo_url, c.lat, c.lng
    from clubs c where c.status in ('trial','active')
   order by c.country, c.region, c.name
$$;
grant execute on function public.open_clubs() to anon, authenticated;

create or replace function public.request_training(p_club uuid, p_name text, p_phone text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare c clubs; em text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into c from clubs where id = p_club and status in ('trial','active');
  if c.id is null then raise exception 'club not found'; end if;
  em := public.my_email();
  if exists (select 1 from members where club_id = c.id and lower(email) = em and status <> 'removed') then return 'member'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'add your WhatsApp number so the club can reach you'; end if;
  insert into join_requests(club_id, user_id, email, full_name, phone, note, source)
  values (c.id, auth.uid(), em, left(coalesce(p_name, ''), 120), left(trim(p_phone), 40), left(coalesce(p_note, ''), 300), 'start')
  on conflict (club_id, user_id) do update
    set status = 'pending', full_name = excluded.full_name, phone = excluded.phone, note = excluded.note,
        source = 'start', created_at = now()
    where join_requests.status <> 'approved';
  insert into notifications(club_id, member_id, kind, data)
  select c.id, m.id, 'joinreq', jsonb_build_object('name', coalesce(nullif(p_name, ''), em), 'train', true)
    from members m where m.club_id = c.id and m.role in ('owner','coach') and m.status = 'active';
  return 'pending';
end $$;
grant execute on function public.request_training(uuid, text, text, text) to authenticated;
