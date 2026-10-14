-- Padel Vitals, part 9: push alerts to Adrian's phone (ntfy app, private topic).
-- New registrations, a club starting to pay, a failed payment. Safe to run more than once.

create extension if not exists pg_net with schema extensions;

create table if not exists public.platform_settings (
  key   text primary key,
  value text not null
);
alter table public.platform_settings enable row level security;
drop policy if exists ps_admin on public.platform_settings;
create policy ps_admin on public.platform_settings for all using (public.is_platform_admin()) with check (public.is_platform_admin());
insert into public.platform_settings(key, value) values ('ntfy_topic', 'padelvitals-e902d92a34e15404')
  on conflict (key) do nothing;

create or replace function public.alert_admin(p_title text, p_body text, p_tags text, p_click text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare topic text;
begin
  select value into topic from platform_settings where key = 'ntfy_topic';
  if topic is null or topic = '' then return; end if;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object('topic', topic, 'title', left(p_title, 120), 'message', left(p_body, 500),
                               'tags', string_to_array(coalesce(p_tags, ''), ','), 'click', p_click, 'priority', 4),
    headers := '{"Content-Type":"application/json"}'::jsonb);
exception when others then
  -- an alert must never block a registration or a payment
  null;
end $$;
revoke all on function public.alert_admin(text, text, text, text) from public, anon, authenticated;

create or replace function public.lead_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.alert_admin(
    'New club: ' || new.club_name,
    concat_ws(' · ', nullif(concat_ws(', ', nullif(new.city, ''), nullif(new.region, ''), nullif(new.country, '')), ''),
              coalesce(new.players, 0) || ' players', nullif(new.contact, '')),
    'tennis,tada', 'https://padelvitals.com/platform.html');
  return new;
end $$;
drop trigger if exists leads_alert on public.leads;
create trigger leads_alert after insert on public.leads for each row execute function public.lead_alert();

create or replace function public.billing_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.billing_status is distinct from old.billing_status then
    if new.billing_status = 'active' then
      perform public.alert_admin(new.name || ' is paying', 'PayPal subscription active · ' || new.plan || ' plan', 'moneybag', 'https://padelvitals.com/platform.html');
    elsif new.billing_status = 'past_due' then
      perform public.alert_admin('Payment failed: ' || new.name, 'PayPal could not charge the club. Check in with the owner.', 'warning', 'https://padelvitals.com/platform.html');
    elsif new.billing_status = 'cancelled' then
      perform public.alert_admin(new.name || ' cancelled', 'Their club is paused. The region is still held until you cancel it.', 'x', 'https://padelvitals.com/platform.html');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists clubs_billing_alert on public.clubs;
create trigger clubs_billing_alert after update of billing_status on public.clubs for each row execute function public.billing_alert();
