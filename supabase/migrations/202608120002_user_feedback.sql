begin;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  community_id uuid references public.communities(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  resident_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('service','content','accessibility','privacy','bug','other')),
  content text not null check (char_length(content) between 8 and 1000),
  contact_allowed boolean not null default false,
  page_path text check (page_path is null or (char_length(page_path) <= 160 and page_path ~ '^/[A-Za-z0-9_./-]+$')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.user_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.user_feedback(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted','status_changed')),
  from_status text,
  to_status text not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_feedback_tenant_status
  on public.user_feedback(organization_id, community_id, status, created_at desc);
create index if not exists idx_user_feedback_user_created
  on public.user_feedback(user_id, created_at desc);
create index if not exists idx_user_feedback_events_feedback
  on public.user_feedback_events(feedback_id, created_at);

drop trigger if exists trg_user_feedback_updated_at on public.user_feedback;
create trigger trg_user_feedback_updated_at before update on public.user_feedback
for each row execute function public.set_updated_at();

alter table public.user_feedback enable row level security;
alter table public.user_feedback_events enable row level security;

drop policy if exists user_feedback_read_own on public.user_feedback;
create policy user_feedback_read_own on public.user_feedback for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_feedback_staff_read on public.user_feedback;
create policy user_feedback_staff_read on public.user_feedback for select to authenticated
using (public.staff_can_access_tenant(organization_id, community_id));

drop policy if exists user_feedback_events_read on public.user_feedback_events;
create policy user_feedback_events_read on public.user_feedback_events for select to authenticated
using (
  exists (
    select 1 from public.user_feedback feedback
    where feedback.id = feedback_id
      and (
        feedback.user_id = auth.uid()
        or public.staff_can_access_tenant(feedback.organization_id, feedback.community_id)
      )
  )
);

revoke insert, update, delete on public.user_feedback from authenticated;
revoke insert, update, delete on public.user_feedback_events from authenticated;
grant select on public.user_feedback, public.user_feedback_events to authenticated;

create or replace function public.update_user_feedback(
  p_feedback_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.user_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.user_feedback%rowtype;
  updated public.user_feedback%rowtype;
begin
  if public.current_app_role() not in ('admin','community') then raise exception 'FEEDBACK_ROLE_FORBIDDEN'; end if;
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'INVALID_FEEDBACK_STATUS'; end if;
  if p_status in ('resolved','closed') and coalesce(char_length(trim(p_resolution_note)), 0) < 2 then
    raise exception 'FEEDBACK_RESOLUTION_REQUIRED';
  end if;

  select * into previous from public.user_feedback where id = p_feedback_id for update;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if not public.staff_can_access_tenant(previous.organization_id, previous.community_id) then
    raise exception 'FEEDBACK_TENANT_FORBIDDEN';
  end if;

  update public.user_feedback
  set status = p_status,
      assigned_to = case when p_status = 'in_progress' then auth.uid() else assigned_to end,
      resolution_note = nullif(trim(p_resolution_note), ''),
      resolved_at = case when p_status in ('resolved','closed') then now() else null end
  where id = p_feedback_id
  returning * into updated;

  if previous.status is distinct from updated.status
     or previous.resolution_note is distinct from updated.resolution_note then
    insert into public.user_feedback_events(feedback_id, actor_id, action, from_status, to_status, note)
    values (updated.id, auth.uid(), 'status_changed', previous.status, updated.status, updated.resolution_note);
  end if;
  return updated;
end;
$$;

revoke all on function public.update_user_feedback(uuid, text, text) from public;
grant execute on function public.update_user_feedback(uuid, text, text) to authenticated;

create or replace function public.anonymize_feedback_on_account_disable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status = 'disabled' and old.account_status is distinct from new.account_status then
    update public.user_feedback
    set user_id = null,
        resident_id = null,
        content = '账号已注销，反馈正文已按隐私规则删除。',
        contact_allowed = false,
        page_path = null,
        idempotency_key = concat('anonymized:', id)
    where user_id = new.id or resident_id = new.id;
    update public.user_feedback_events set actor_id = null where actor_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_anonymize_feedback_on_account_disable on public.profiles;
create trigger trg_anonymize_feedback_on_account_disable
after update of account_status on public.profiles
for each row execute function public.anonymize_feedback_on_account_disable();

commit;
