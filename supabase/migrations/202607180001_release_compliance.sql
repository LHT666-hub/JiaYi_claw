begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  service_updates boolean not null default true,
  followup_reminders boolean not null default true,
  content_updates boolean not null default false,
  sms_enabled boolean not null default false,
  wecom_enabled boolean not null default true,
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '08:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id),
  status text not null default 'pending'
    check (status in ('pending','cancelled','processing','completed','failed')),
  reason text,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '7 days'),
  cancelled_at timestamptz,
  processed_at timestamptz,
  processor_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_account_deletion_one_pending
  on public.account_deletion_requests(user_id)
  where status in ('pending','processing');
create index if not exists idx_account_deletion_due
  on public.account_deletion_requests(status, scheduled_for);

alter table public.notification_preferences enable row level security;
alter table public.account_deletion_requests enable row level security;

drop policy if exists notification_preferences_own_select on public.notification_preferences;
create policy notification_preferences_own_select on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notification_preferences_own_insert on public.notification_preferences;
create policy notification_preferences_own_insert on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists notification_preferences_own_update on public.notification_preferences;
create policy notification_preferences_own_update on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists account_deletion_own_select on public.account_deletion_requests;
create policy account_deletion_own_select on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.account_deletion_requests from authenticated;
grant select on public.account_deletion_requests to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create or replace function public.request_my_account_deletion(p_reason text default null)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles%rowtype;
  deletion_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into caller_profile from public.profiles where id = auth.uid() for update;
  if not found or caller_profile.account_status <> 'active' then
    raise exception 'ACCOUNT_UNAVAILABLE';
  end if;
  if caller_profile.role not in ('resident','family') then
    raise exception 'STAFF_OFFBOARDING_REQUIRED';
  end if;

  select * into deletion_request
  from public.account_deletion_requests
  where user_id = auth.uid() and status in ('pending','processing')
  order by requested_at desc limit 1;
  if found then return deletion_request; end if;

  insert into public.account_deletion_requests(user_id, organization_id, reason)
  values (auth.uid(), caller_profile.organization_id, nullif(trim(p_reason), ''))
  returning * into deletion_request;

  insert into public.audit_logs(actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'account_deletion_requested', 'account_deletion_requests', deletion_request.id,
    jsonb_build_object('scheduledFor', deletion_request.scheduled_for));
  return deletion_request;
end;
$$;

create or replace function public.cancel_my_account_deletion()
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  deletion_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into deletion_request
  from public.account_deletion_requests
  where user_id = auth.uid() and status = 'pending'
  order by requested_at desc limit 1 for update;
  if not found then raise exception 'NO_PENDING_DELETION'; end if;
  if deletion_request.scheduled_for <= now() then raise exception 'DELETION_ALREADY_PROCESSING'; end if;

  update public.account_deletion_requests
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = deletion_request.id
  returning * into deletion_request;

  insert into public.audit_logs(actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'account_deletion_cancelled', 'account_deletion_requests', deletion_request.id, '{}'::jsonb);
  return deletion_request;
end;
$$;

revoke all on function public.request_my_account_deletion(text) from public;
revoke all on function public.cancel_my_account_deletion() from public;
grant execute on function public.request_my_account_deletion(text) to authenticated;
grant execute on function public.cancel_my_account_deletion() to authenticated;

create or replace function public.begin_due_account_deletion(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deletion_request public.account_deletion_requests%rowtype;
  target_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  select * into deletion_request from public.account_deletion_requests
  where id = p_request_id and status in ('pending','failed') and scheduled_for <= now()
  for update;
  if not found then raise exception 'DELETION_NOT_DUE'; end if;
  target_user_id := deletion_request.user_id;
  if target_user_id is null then raise exception 'DELETION_USER_MISSING'; end if;

  update public.account_deletion_requests set status = 'processing', updated_at = now(), processor_note = null
  where id = p_request_id;

  delete from public.health_observations where resident_id = target_user_id or recorded_by = target_user_id;
  delete from public.clinical_briefs where resident_id = target_user_id;
  delete from public.intake_sessions where resident_id = target_user_id or created_by = target_user_id;
  delete from public.resident_fact_candidates where resident_id = target_user_id;
  delete from public.resident_care_bindings where resident_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.consents where user_id = target_user_id or resident_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.wechat_identities where user_id = target_user_id;
  delete from public.family_link_codes where resident_id = target_user_id or used_by = target_user_id;
  delete from public.resident_profiles where user_id = target_user_id;
  delete from public.ask_logs where user_id = target_user_id;
  delete from public.doctor_todos where resident_id = target_user_id;
  delete from public.contacts where resident_id = target_user_id or contact_user_id = target_user_id;
  delete from public.task_records where resident_id = target_user_id;
  delete from public.points_ledger where resident_id = target_user_id;
  delete from public.exchanges where resident_id = target_user_id;
  delete from public.course_views where resident_id = target_user_id;
  delete from public.leader_matches where resident_id = target_user_id;
  delete from public.group_messages where sender_id = target_user_id;
  update public.family_bindings set status = 'disabled', note = null, updated_at = now()
    where resident_id = target_user_id or family_id = target_user_id;
  update public.channel_members set resident_id = null, display_name = null, binding_status = 'revoked', bound_at = null, updated_at = now()
    where resident_id = target_user_id;
  update public.skill_runs set user_id = null, resident_id = null, source_refs = '[]'::jsonb, metadata = '{}'::jsonb
    where user_id = target_user_id or resident_id = target_user_id;
  update public.service_requests set title = '已注销账号服务记录', summary = '原始内容已按注销申请删除', payload = '{}'::jsonb
    where resident_id = target_user_id or requested_by = target_user_id;
  update public.service_request_events set note = null, metadata = '{}'::jsonb
    where service_request_id in (select id from public.service_requests where resident_id = target_user_id or requested_by = target_user_id);
  update public.appointment_details set
    preferred_doctor = null, preferred_dates = '{}', preferred_time = null, contact_phone = null,
    booking_reference = null, arrival_instructions = null, updated_at = now()
    where service_request_id in (select id from public.service_requests where resident_id = target_user_id or requested_by = target_user_id);
  delete from public.outbox_events where recipient_id = target_user_id;

  update public.profiles set
    display_name = '已注销用户', phone = null, avatar_url = null,
    account_status = 'disabled', onboarding_completed_at = null, updated_at = now()
  where id = target_user_id;

  insert into public.audit_logs(actor_id, action, target_table, target_id, detail)
  values (null, 'account_deletion_processing', 'account_deletion_requests', p_request_id,
    jsonb_build_object('userIdHash', encode(extensions.digest(target_user_id::text, 'sha256'), 'hex')));
  return target_user_id;
end;
$$;

revoke all on function public.begin_due_account_deletion(uuid) from public;
grant execute on function public.begin_due_account_deletion(uuid) to service_role;

commit;
