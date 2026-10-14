-- Padel Vitals, part 5: PayPal billing, and owners can no longer change what they pay for.
-- Safe to run more than once.

alter table public.clubs add column if not exists billing_status text not null default 'none';
alter table public.clubs drop constraint if exists clubs_billing_status_check;
alter table public.clubs add constraint clubs_billing_status_check
  check (billing_status in ('none','pending','active','past_due','cancelled'));
alter table public.clubs add column if not exists paypal_sub text;
alter table public.clubs add column if not exists paid_until timestamptz;
alter table public.clubs add column if not exists billing_updated timestamptz;

-- Owners may rename their club, change city, color, logo and points rules.
-- Plan, status, territory and billing only change through the platform team,
-- the functions below, or the PayPal webhook (service role).
create or replace function public.clubs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_admin()
     or coalesce(auth.role(), '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin')
     or current_setting('pv.trusted', true) = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status or new.plan is distinct from old.plan
     or new.country is distinct from old.country or new.region is distinct from old.region
     or new.billing_status is distinct from old.billing_status or new.paypal_sub is distinct from old.paypal_sub
     or new.paid_until is distinct from old.paid_until or new.billing_updated is distinct from old.billing_updated then
    raise exception 'Only the Padel Vitals team can change plan, status, region or billing';
  end if;
  return new;
end $$;
drop trigger if exists clubs_guard on public.clubs;
create trigger clubs_guard before update on public.clubs for each row execute function public.clubs_guard();

-- the owner links the PayPal subscription they just approved; the webhook confirms it
create or replace function public.attach_subscription(p_club uuid, p_sub text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_club) then raise exception 'not allowed'; end if;
  if p_sub !~ '^I-[A-Z0-9]{6,40}$' then raise exception 'not a PayPal subscription id'; end if;
  perform set_config('pv.trusted', 'on', true);
  update clubs set paypal_sub = p_sub,
                   billing_status = case when billing_status = 'active' then 'active' else 'pending' end,
                   billing_updated = now()
   where id = p_club;
end $$;
grant execute on function public.attach_subscription(uuid, text) to authenticated;

-- every PayPal event, for the platform team to look back on
create table if not exists public.billing_events (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete set null,
  kind       text not null,
  sub_id     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
drop policy if exists be_admin on public.billing_events;
create policy be_admin on public.billing_events for select using (public.is_platform_admin() or public.is_owner(club_id));
