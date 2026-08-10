begin;

alter table public.notification_preferences
  add column if not exists wechat_mini_enabled boolean not null default false;

create unique index if not exists idx_profiles_phone_unique
  on public.profiles(phone) where phone is not null;

alter table public.outbox_events
  add column if not exists delivery_results jsonb not null default '{}'::jsonb;

create table if not exists public.wechat_subscription_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_key text not null,
  template_id text not null,
  decision text not null check (decision in ('accept','reject','ban')),
  delivery_status text check (delivery_status in ('available','sent','invalid','failed')),
  consumed_at timestamptz,
  last_error text,
  request_trace_id text not null,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_wechat_subscription_grants_available
  on public.wechat_subscription_grants(user_id, template_id, requested_at)
  where decision = 'accept' and consumed_at is null;

alter table public.wechat_subscription_grants enable row level security;

drop policy if exists wechat_subscription_grants_own_select
  on public.wechat_subscription_grants;
create policy wechat_subscription_grants_own_select
  on public.wechat_subscription_grants for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.wechat_subscription_grants
  from anon, authenticated;
grant select on public.wechat_subscription_grants to authenticated;

create or replace function public.clear_wechat_subscription_grants_on_disable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.account_status is distinct from new.account_status
     and new.account_status = 'disabled' then
    delete from public.wechat_subscription_grants where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_clear_wechat_subscriptions on public.profiles;
create trigger trg_profiles_clear_wechat_subscriptions
after update of account_status on public.profiles
for each row execute function public.clear_wechat_subscription_grants_on_disable();

commit;
