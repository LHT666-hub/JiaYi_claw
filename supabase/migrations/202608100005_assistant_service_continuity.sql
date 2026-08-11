-- Privacy-preserving continuity for Claw. Raw prompts and model answers are
-- intentionally excluded; only fixed service activity categories are stored.

create table if not exists public.assistant_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  last_activity_type text not null check (last_activity_type in (
    'public_info_query','schedule_query','service_draft_prepared',
    'safety_guidance','general_guidance'
  )),
  last_service_type text check (last_service_type is null or last_service_type in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation',
    'referral_assistance','other'
  )),
  last_risk_level text not null default 'low' check (last_risk_level in ('low','medium','high','emergency')),
  last_source text not null default 'fallback' check (char_length(last_source) between 1 and 40),
  last_skill_ids text[] not null default '{}',
  last_channel text not null default 'web' check (last_channel in ('web','wechat','wecom')),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, resident_id)
);

create table if not exists public.assistant_activities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assistant_sessions(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'public_info_query','schedule_query','service_draft_prepared',
    'safety_guidance','general_guidance'
  )),
  service_type text check (service_type is null or service_type in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation',
    'referral_assistance','other'
  )),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','emergency')),
  source text not null default 'fallback' check (char_length(source) between 1 and 40),
  skill_ids text[] not null default '{}',
  knowledge_refs text[] not null default '{}',
  action_kinds text[] not null default '{}',
  trace_id text not null check (char_length(trace_id) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_assistant_sessions_actor_subject
  on public.assistant_sessions(created_by, resident_id, last_activity_at desc);
create index if not exists idx_assistant_activities_session_created
  on public.assistant_activities(session_id, created_at desc);

drop trigger if exists trg_assistant_sessions_updated_at on public.assistant_sessions;
create trigger trg_assistant_sessions_updated_at before update on public.assistant_sessions
for each row execute function public.set_updated_at();

alter table public.assistant_sessions enable row level security;
alter table public.assistant_activities enable row level security;

drop policy if exists "assistant_sessions_read_own" on public.assistant_sessions;
create policy "assistant_sessions_read_own" on public.assistant_sessions
for select to authenticated
using (
  created_by = auth.uid()
  and public.is_related_to_resident(resident_id)
);

drop policy if exists "assistant_sessions_delete_own" on public.assistant_sessions;
create policy "assistant_sessions_delete_own" on public.assistant_sessions
for delete to authenticated
using (
  created_by = auth.uid()
  and public.is_related_to_resident(resident_id)
);

drop policy if exists "assistant_activities_read_own" on public.assistant_activities;
create policy "assistant_activities_read_own" on public.assistant_activities
for select to authenticated
using (
  expires_at > now()
  and exists (
    select 1
    from public.assistant_sessions session
    where session.id = assistant_activities.session_id
      and session.created_by = auth.uid()
      and public.is_related_to_resident(session.resident_id)
  )
);

revoke all on public.assistant_sessions from anon, authenticated;
revoke all on public.assistant_activities from anon, authenticated;
grant select, delete on public.assistant_sessions to authenticated;
grant select on public.assistant_activities to authenticated;

create or replace function public.record_assistant_activity(
  p_resident_id uuid,
  p_activity_type text,
  p_service_type text,
  p_risk_level text,
  p_source text,
  p_skill_ids text[],
  p_knowledge_refs text[],
  p_action_kinds text[],
  p_trace_id text,
  p_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  resident_organization_id uuid;
  resident_community_id uuid;
  target_session_id uuid;
  target_activity_id uuid;
  recorded_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role not in ('resident','family') then
    raise exception 'ASSISTANT_ACTIVITY_FORBIDDEN';
  end if;
  if not public.is_related_to_resident(p_resident_id) then
    raise exception 'ASSISTANT_SUBJECT_FORBIDDEN';
  end if;

  select organization_id, community_id
    into resident_organization_id, resident_community_id
  from public.profiles where id = p_resident_id;
  if resident_organization_id is null then
    raise exception 'RESIDENT_TENANT_NOT_CONFIGURED';
  end if;

  if p_activity_type not in (
    'public_info_query','schedule_query','service_draft_prepared',
    'safety_guidance','general_guidance'
  ) then raise exception 'INVALID_ASSISTANT_ACTIVITY_TYPE'; end if;
  if p_service_type is not null and p_service_type not in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation',
    'referral_assistance','other'
  ) then raise exception 'INVALID_ASSISTANT_SERVICE_TYPE'; end if;
  if p_risk_level not in ('low','medium','high','emergency') then
    raise exception 'INVALID_ASSISTANT_RISK_LEVEL';
  end if;
  if p_channel not in ('web','wechat','wecom') then
    raise exception 'INVALID_ASSISTANT_CHANNEL';
  end if;
  if char_length(coalesce(p_source, '')) not between 1 and 40
    or char_length(coalesce(p_trace_id, '')) not between 1 and 100 then
    raise exception 'INVALID_ASSISTANT_METADATA';
  end if;

  insert into public.assistant_sessions (
    organization_id, community_id, resident_id, created_by,
    last_activity_type, last_service_type, last_risk_level, last_source,
    last_skill_ids, last_channel, last_activity_at, expires_at
  ) values (
    resident_organization_id, resident_community_id, p_resident_id, auth.uid(),
    p_activity_type, p_service_type, p_risk_level, p_source,
    coalesce(p_skill_ids, '{}'), p_channel, recorded_at,
    recorded_at + interval '30 days'
  )
  on conflict (created_by, resident_id) do update set
    organization_id = excluded.organization_id,
    community_id = excluded.community_id,
    last_activity_type = excluded.last_activity_type,
    last_service_type = excluded.last_service_type,
    last_risk_level = excluded.last_risk_level,
    last_source = excluded.last_source,
    last_skill_ids = excluded.last_skill_ids,
    last_channel = excluded.last_channel,
    last_activity_at = excluded.last_activity_at,
    expires_at = excluded.expires_at
  returning id into target_session_id;

  delete from public.assistant_activities
  where session_id = target_session_id and expires_at <= recorded_at;

  insert into public.assistant_activities (
    session_id, activity_type, service_type, risk_level, source,
    skill_ids, knowledge_refs, action_kinds, trace_id, created_at, expires_at
  ) values (
    target_session_id, p_activity_type, p_service_type, p_risk_level, p_source,
    coalesce(p_skill_ids, '{}'), coalesce(p_knowledge_refs, '{}'),
    coalesce(p_action_kinds, '{}'), p_trace_id, recorded_at,
    recorded_at + interval '30 days'
  ) returning id into target_activity_id;

  insert into public.audit_logs (
    actor_id, organization_id, community_id, action, target_table, target_id, detail
  ) values (
    auth.uid(), resident_organization_id, resident_community_id,
    'assistant.activity_recorded', 'assistant_activities', target_activity_id,
    jsonb_build_object(
      'activityType', p_activity_type,
      'serviceType', p_service_type,
      'traceId', p_trace_id,
      'rawTranscriptStored', false
    )
  );

  return jsonb_build_object(
    'sessionId', target_session_id,
    'activityId', target_activity_id,
    'occurredAt', recorded_at,
    'expiresAt', recorded_at + interval '30 days'
  );
end;
$$;

create or replace function public.clear_assistant_session(p_resident_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  resident_organization_id uuid;
  resident_community_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_related_to_resident(p_resident_id) then
    raise exception 'ASSISTANT_SUBJECT_FORBIDDEN';
  end if;

  select organization_id, community_id
    into resident_organization_id, resident_community_id
  from public.profiles where id = p_resident_id;

  delete from public.assistant_sessions
  where created_by = auth.uid() and resident_id = p_resident_id;
  get diagnostics deleted_count = row_count;

  insert into public.audit_logs (
    actor_id, organization_id, community_id, action, target_table, detail
  ) values (
    auth.uid(), resident_organization_id, resident_community_id,
    'assistant.session_cleared', 'assistant_sessions',
    jsonb_build_object('residentId', p_resident_id, 'deleted', deleted_count > 0)
  );

  return deleted_count > 0;
end;
$$;

revoke all on function public.record_assistant_activity(
  uuid,text,text,text,text,text[],text[],text[],text,text
) from public, anon;
grant execute on function public.record_assistant_activity(
  uuid,text,text,text,text,text[],text[],text[],text,text
) to authenticated;

revoke all on function public.clear_assistant_session(uuid) from public, anon;
grant execute on function public.clear_assistant_session(uuid) to authenticated;

comment on table public.assistant_sessions is
  'Claw continuity metadata. Never stores raw prompts or full model replies.';
comment on table public.assistant_activities is
  'Fixed-category assistant activity trail retained for 30 days; no transcript fields.';
