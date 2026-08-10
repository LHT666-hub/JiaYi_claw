-- 家医 Claw production platform: tenancy, consent, service workflow, knowledge and audit.
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  data_residency text not null default 'CN',
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  district text,
  address text,
  service_phone text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

insert into public.organizations (slug, name)
values ('fengxian-primary-care', '奉贤基层家医服务试点')
on conflict (slug) do nothing;

insert into public.communities (organization_id, slug, name, district)
select id, 'haiwan-town', '海湾镇社区', '上海市奉贤区'
from public.organizations where slug = 'fengxian-primary-care'
on conflict (organization_id, slug) do nothing;

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists community_id uuid references public.communities(id),
  add column if not exists account_status text not null default 'active'
    check (account_status in ('pending','active','disabled'));

update public.profiles p set
  organization_id = coalesce(p.organization_id, o.id),
  community_id = coalesce(p.community_id, c.id)
from public.organizations o
join public.communities c on c.organization_id = o.id and c.slug = 'haiwan-town'
where o.slug = 'fengxian-primary-care'
  and (p.organization_id is null or p.community_id is null);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_workbench_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('doctor','nurse','pharmacist','community','admin'), false)
$$;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.current_community_id()
returns uuid language sql stable security definer set search_path = public as $$
  select community_id from public.profiles where id = auth.uid() limit 1
$$;

create or replace function public.staff_can_access_tenant(target_organization_id uuid, target_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_workbench_role()
    and target_organization_id = public.current_organization_id()
    and (
      public.current_app_role() = 'admin'
      or public.current_community_id() is null
      or target_community_id is null
      or target_community_id = public.current_community_id()
    )
$$;

-- Never trust a role sent from public sign-up metadata. Only family/resident may self-register.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org uuid;
  default_community uuid;
  registration_role text;
begin
  select id into default_org from public.organizations where slug = 'fengxian-primary-care' limit 1;
  select id into default_community from public.communities where slug = 'haiwan-town' limit 1;
  registration_role := case
    when new.raw_user_meta_data ->> 'registration_role' = 'family' then 'family'
    else 'resident'
  end;

  insert into public.profiles (
    id, display_name, role, phone, organization_id, community_id, account_status
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(new.phone, ''), split_part(new.email, '@', 1), '新用户'),
    registration_role,
    new.phone,
    default_org,
    default_community,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id),
  phone text not null,
  display_name text not null,
  role text not null check (role in ('doctor','nurse','pharmacist','community','admin')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('privacy','sensitive_health','family_delegate','ai_processing','notification')),
  policy_version text not null,
  granted boolean not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, resident_id, scope, policy_version)
);

create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id),
  service_type text not null check (service_type in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation','other'
  )),
  name text not null,
  description text,
  owner_role text not null check (owner_role in ('doctor','nurse','pharmacist','community')),
  required_fields jsonb not null default '[]'::jsonb,
  service_hours text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, community_id, service_type)
);

insert into public.service_catalog (
  organization_id, community_id, service_type, name, description, owner_role, required_fields
)
select o.id, c.id, values_row.service_type, values_row.name, values_row.description,
  values_row.owner_role, values_row.required_fields::jsonb
from public.organizations o
join public.communities c on c.organization_id = o.id and c.slug = 'haiwan-town'
cross join (values
  ('clinic_registration', '门诊挂号协助', '团队核对号源并回写预约结果。', 'community', '["target","preferredDates","contactPhone"]'),
  ('family_doctor_booking', '家庭医生预约', '协调家庭医生服务时间。', 'nurse', '["target","preferredDates","contactPhone"]'),
  ('refill_request', '续方配药申请', '收集既往用药和剩余药量后交由医生、药师处理。', 'pharmacist', '["medication","remainingDays","contactPhone"]'),
  ('followup_reminder', '随访与复诊', '确认随访方式、时间和所需材料。', 'nurse', '["target","preferredDates"]')
) as values_row(service_type, name, description, owner_role, required_fields)
where o.slug = 'fengxian-primary-care'
on conflict (organization_id, community_id, service_type) do nothing;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  community_id uuid references public.communities(id),
  resident_id uuid not null references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  service_type text not null check (service_type in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation','other'
  )),
  title text not null,
  summary text not null,
  priority text not null default 'low' check (priority in ('low','medium','high','emergency')),
  status text not null default 'draft' check (status in (
    'draft','submitted','needs_info','accepted','checking_availability',
    'awaiting_user_confirmation','booked','waitlisted','failed','completed','cancelled'
  )),
  assigned_role text check (assigned_role in ('doctor','nurse','pharmacist','community')),
  assigned_to uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requested_by, idempotency_key)
);

create index if not exists idx_service_requests_queue
  on public.service_requests (organization_id, community_id, status, priority, created_at);
create index if not exists idx_service_requests_resident
  on public.service_requests (resident_id, created_at desc);

create table if not exists public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  old_status text,
  new_status text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  assigned_role text not null check (assigned_role in ('doctor','nurse','pharmacist','community')),
  assigned_to uuid references public.profiles(id),
  assigned_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_details (
  service_request_id uuid primary key references public.service_requests(id) on delete cascade,
  target text not null,
  department text,
  preferred_doctor text,
  preferred_dates text[] not null default '{}',
  preferred_time text,
  contact_phone text,
  accept_waitlist boolean not null default true,
  institution_name text,
  department_name text,
  clinician_name text,
  scheduled_at timestamptz,
  booking_reference text,
  booking_channel text not null default 'staff_assisted',
  arrival_instructions text,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_info_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  community_id uuid references public.communities(id),
  title text not null,
  category text not null,
  content text not null,
  keywords text[] not null default '{}',
  source_name text not null,
  source_url text not null,
  effective_from date,
  expires_at timestamptz,
  verified_at timestamptz not null,
  verified_by uuid references public.profiles(id),
  status text not null default 'draft' check (status in ('draft','published','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_public_info_published
  on public.public_info_entries (community_id, status, verified_at desc);

create table if not exists public.health_observations (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  recorded_by uuid not null references public.profiles(id),
  observation_type text not null check (observation_type in ('blood_pressure','blood_glucose','weight','steps')),
  value numeric not null,
  secondary_value numeric,
  unit text not null,
  measured_at timestamptz not null,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.intake_sessions (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  answers jsonb not null default '{}'::jsonb,
  entities jsonb not null default '{}'::jsonb,
  missing_information text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','complete','reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinical_briefs (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  summary text not null,
  structured_content jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  skill_id text not null,
  skill_version text not null,
  human_review_status text not null default 'pending' check (human_review_status in ('pending','reviewed','rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  resident_id uuid references public.profiles(id),
  skill_id text not null,
  skill_version text not null,
  model text,
  trace_id text not null,
  status text not null check (status in ('success','fallback','failed','human_review')),
  latency_ms integer,
  input_hash text,
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  recipient_id uuid references public.profiles(id),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead_letter')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create or replace function public.claim_outbox_events(p_limit integer default 20)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.outbox_events event set
    status = 'processing',
    attempts = event.attempts + 1
  from (
    select id from public.outbox_events
    where status in ('pending', 'failed') and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ) claimed
  where event.id = claimed.id
  returning event.*;
end;
$$;

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
drop trigger if exists trg_communities_updated_at on public.communities;
create trigger trg_communities_updated_at before update on public.communities
for each row execute function public.set_updated_at();
drop trigger if exists trg_service_catalog_updated_at on public.service_catalog;
create trigger trg_service_catalog_updated_at before update on public.service_catalog
for each row execute function public.set_updated_at();
drop trigger if exists trg_service_requests_updated_at on public.service_requests;
create trigger trg_service_requests_updated_at before update on public.service_requests
for each row execute function public.set_updated_at();
drop trigger if exists trg_public_info_updated_at on public.public_info_entries;
create trigger trg_public_info_updated_at before update on public.public_info_entries
for each row execute function public.set_updated_at();
drop trigger if exists trg_intake_sessions_updated_at on public.intake_sessions;
create trigger trg_intake_sessions_updated_at before update on public.intake_sessions
for each row execute function public.set_updated_at();
drop trigger if exists trg_clinical_briefs_updated_at on public.clinical_briefs;
create trigger trg_clinical_briefs_updated_at before update on public.clinical_briefs
for each row execute function public.set_updated_at();

create or replace function public.is_related_to_resident(target_resident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = target_resident_id
    or exists (
      select 1 from public.family_bindings
      where resident_id = target_resident_id
        and family_id = auth.uid()
        and status = 'active'
    )
$$;

create or replace function public.transition_service_request(
  p_request_id uuid,
  p_action text,
  p_note text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.service_requests;
  actor_role text;
  target_status text;
  old_status_value text;
  allowed boolean := false;
begin
  select * into req from public.service_requests where id = p_request_id for update;
  if req.id is null then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  old_status_value := req.status;
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is null then raise exception 'UNAUTHENTICATED'; end if;

  if actor_role in ('resident','family') then
    allowed := public.is_related_to_resident(req.resident_id)
      and p_action in ('submit','confirm_booking','cancel');
  else
    allowed := actor_role in ('doctor','nurse','pharmacist','community','admin')
      and public.staff_can_access_tenant(req.organization_id, req.community_id);
  end if;
  if not allowed then raise exception 'SERVICE_ACTION_FORBIDDEN'; end if;

  target_status := case
    when req.status = 'draft' and p_action = 'submit' then 'submitted'
    when req.status = 'needs_info' and p_action = 'submit' then 'submitted'
    when req.status = 'submitted' and p_action = 'request_info' then 'needs_info'
    when req.status = 'submitted' and p_action = 'accept' then 'accepted'
    when req.status = 'accepted' and p_action = 'request_info' then 'needs_info'
    when req.status = 'accepted' and p_action = 'check_availability' then 'checking_availability'
    when req.status in ('checking_availability','waitlisted') and p_action = 'propose_slot' then 'awaiting_user_confirmation'
    when req.status = 'checking_availability' and p_action = 'waitlist' then 'waitlisted'
    when req.status in ('checking_availability','waitlisted') and p_action = 'fail' then 'failed'
    when req.status = 'awaiting_user_confirmation' and p_action = 'confirm_booking' then 'booked'
    when req.status = 'awaiting_user_confirmation' and p_action = 'request_info' then 'needs_info'
    when req.status = 'booked' and p_action = 'complete' then 'completed'
    when req.status not in ('failed','completed','cancelled') and p_action = 'cancel' then 'cancelled'
    else null
  end;
  if target_status is null then raise exception 'INVALID_SERVICE_TRANSITION:%:%', req.status, p_action; end if;

  update public.service_requests set status = target_status where id = req.id returning * into req;

  if p_action in ('propose_slot','confirm_booking') then
    update public.appointment_details set
      scheduled_at = coalesce((p_details ->> 'scheduledAt')::timestamptz, scheduled_at),
      institution_name = coalesce(p_details ->> 'institutionName', institution_name),
      department_name = coalesce(p_details ->> 'departmentName', department_name),
      clinician_name = coalesce(p_details ->> 'clinicianName', clinician_name),
      booking_reference = coalesce(p_details ->> 'bookingReference', booking_reference),
      updated_at = now()
    where service_request_id = req.id;
  end if;

  insert into public.service_request_events (
    service_request_id, actor_id, action, old_status, new_status, note, metadata
  ) values (req.id, auth.uid(), p_action, old_status_value, target_status, p_note, p_details);

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'service_request.' || p_action, 'service_requests', req.id, jsonb_build_object('newStatus', target_status));

  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, recipient_id, payload)
  values ('service_request.status_changed', 'service_request', req.id, req.requested_by,
    jsonb_build_object('requestId', req.id, 'status', target_status, 'note', p_note));
  return req;
end;
$$;

create or replace function public.finalize_service_request_intake(
  p_request_id uuid,
  p_answers jsonb,
  p_entities jsonb,
  p_missing_information text[],
  p_summary text,
  p_structured_content jsonb,
  p_source_refs jsonb,
  p_skill_id text,
  p_skill_version text,
  p_trace_id text
)
returns public.clinical_briefs
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.service_requests;
  brief public.clinical_briefs;
begin
  select * into req from public.service_requests where id = p_request_id;
  if req.id is null then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  if req.requested_by <> auth.uid() or not public.is_related_to_resident(req.resident_id) then
    raise exception 'INTAKE_WRITE_FORBIDDEN';
  end if;

  insert into public.intake_sessions (
    service_request_id, resident_id, created_by, answers, entities,
    missing_information, status
  ) values (
    req.id, req.resident_id, auth.uid(), coalesce(p_answers, '{}'::jsonb),
    coalesce(p_entities, '{}'::jsonb), coalesce(p_missing_information, '{}'),
    case when cardinality(coalesce(p_missing_information, '{}')) > 0 then 'draft' else 'complete' end
  );

  insert into public.clinical_briefs (
    resident_id, service_request_id, summary, structured_content,
    source_refs, skill_id, skill_version
  ) values (
    req.resident_id, req.id, p_summary, coalesce(p_structured_content, '{}'::jsonb),
    coalesce(p_source_refs, '[]'::jsonb), p_skill_id, p_skill_version
  ) returning * into brief;

  insert into public.skill_runs (
    user_id, resident_id, skill_id, skill_version, trace_id,
    status, source_refs, metadata
  ) values (
    auth.uid(), req.resident_id, p_skill_id, p_skill_version, p_trace_id,
    'human_review', coalesce(p_source_refs, '[]'::jsonb), jsonb_build_object('serviceRequestId', req.id)
  );
  return brief;
end;
$$;

create or replace function public.normalize_cn_phone(input_phone text)
returns text language sql immutable as $$
  select case
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      then '+86' || regexp_replace(input_phone, '[^0-9]', '', 'g')
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') ~ '^861[0-9]{10}$'
      then '+' || regexp_replace(input_phone, '[^0-9]', '', 'g')
    else '+' || regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g')
  end
$$;

create or replace function public.accept_staff_invite(p_token text)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite public.staff_invites;
  result public.profiles;
  current_phone text;
begin
  select phone into current_phone from auth.users where id = auth.uid();
  if current_phone is null then raise exception 'PHONE_VERIFICATION_REQUIRED'; end if;

  select * into invite
  from public.staff_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now()
  for update;

  if invite.id is null then raise exception 'INVITE_INVALID_OR_EXPIRED'; end if;
  if public.normalize_cn_phone(invite.phone) <> public.normalize_cn_phone(current_phone) then
    raise exception 'INVITE_PHONE_MISMATCH';
  end if;

  update public.profiles set
    display_name = invite.display_name,
    role = invite.role,
    organization_id = invite.organization_id,
    community_id = invite.community_id,
    account_status = 'active',
    phone = current_phone,
    updated_at = now()
  where id = auth.uid()
  returning * into result;

  update public.staff_invites set
    status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite.id;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'staff_invite.accepted', 'profiles', auth.uid(), jsonb_build_object('role', invite.role));
  return result;
end;
$$;

alter table public.organizations enable row level security;
alter table public.communities enable row level security;
alter table public.staff_invites enable row level security;
alter table public.consents enable row level security;
alter table public.service_catalog enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;
alter table public.service_assignments enable row level security;
alter table public.appointment_details enable row level security;
alter table public.public_info_entries enable row level security;
alter table public.health_observations enable row level security;
alter table public.intake_sessions enable row level security;
alter table public.clinical_briefs enable row level security;
alter table public.skill_runs enable row level security;
alter table public.outbox_events enable row level security;

create policy "organizations_read_authenticated" on public.organizations for select to authenticated using (true);
create policy "communities_read_authenticated" on public.communities for select to authenticated using (true);
create policy "profiles_read_related_or_staff" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (public.is_workbench_role()
    and organization_id = public.current_organization_id()
    and (public.current_app_role() = 'admin' or public.current_community_id() is null or community_id = public.current_community_id()))
  or exists (
    select 1 from public.family_bindings
    where family_bindings.resident_id = profiles.id
      and family_bindings.family_id = auth.uid()
      and family_bindings.status = 'active'
  )
);
create policy "staff_invites_admin_manage" on public.staff_invites for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "consents_owner_manage" on public.consents for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "service_catalog_read_active" on public.service_catalog for select to authenticated using (active or public.is_admin());
create policy "service_catalog_admin_manage" on public.service_catalog for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "service_requests_read_related" on public.service_requests for select to authenticated
using (public.is_related_to_resident(resident_id) or public.staff_can_access_tenant(organization_id, community_id));
create policy "service_requests_insert_related" on public.service_requests for insert to authenticated
with check (
  requested_by = auth.uid() and public.is_related_to_resident(resident_id)
  and organization_id = public.current_organization_id()
  and (community_id is null or community_id = public.current_community_id())
);
create policy "service_requests_admin_update" on public.service_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "service_events_read_related" on public.service_request_events for select to authenticated
using (exists (select 1 from public.service_requests r where r.id = service_request_id and (public.is_related_to_resident(r.resident_id) or public.staff_can_access_tenant(r.organization_id, r.community_id))));
create policy "service_assignments_read_staff" on public.service_assignments for select to authenticated
using (exists (select 1 from public.service_requests r where r.id = service_request_id and public.staff_can_access_tenant(r.organization_id, r.community_id)));
create policy "service_assignments_admin_manage" on public.service_assignments for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "appointment_details_read_related" on public.appointment_details for select to authenticated
using (exists (select 1 from public.service_requests r where r.id = service_request_id and (public.is_related_to_resident(r.resident_id) or public.staff_can_access_tenant(r.organization_id, r.community_id))));
create policy "appointment_details_insert_related" on public.appointment_details for insert to authenticated
with check (exists (select 1 from public.service_requests r where r.id = service_request_id and r.requested_by = auth.uid()));

create policy "public_info_read_published" on public.public_info_entries for select to anon, authenticated
using (status = 'published' and (expires_at is null or expires_at > now()));
create policy "public_info_admin_manage" on public.public_info_entries for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "health_observations_read_related" on public.health_observations for select to authenticated
using (public.is_related_to_resident(resident_id) or exists (
  select 1 from public.profiles resident where resident.id = resident_id
    and public.staff_can_access_tenant(resident.organization_id, resident.community_id)
));
create policy "health_observations_insert_related" on public.health_observations for insert to authenticated
with check (recorded_by = auth.uid() and public.is_related_to_resident(resident_id));
create policy "intake_read_related" on public.intake_sessions for select to authenticated
using (public.is_related_to_resident(resident_id) or exists (
  select 1 from public.profiles resident where resident.id = resident_id
    and public.staff_can_access_tenant(resident.organization_id, resident.community_id)
));
create policy "intake_manage_related" on public.intake_sessions for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid() and public.is_related_to_resident(resident_id));
create policy "briefs_read_related" on public.clinical_briefs for select to authenticated
using (public.is_related_to_resident(resident_id) or exists (
  select 1 from public.profiles resident where resident.id = resident_id
    and public.staff_can_access_tenant(resident.organization_id, resident.community_id)
));
create policy "briefs_staff_manage" on public.clinical_briefs for all to authenticated
using (public.is_workbench_role()) with check (public.is_workbench_role());
create policy "skill_runs_staff_read" on public.skill_runs for select to authenticated using (public.is_workbench_role());
create policy "skill_runs_insert_own" on public.skill_runs for insert to authenticated with check (user_id = auth.uid());
create policy "outbox_admin_read" on public.outbox_events for select to authenticated using (public.is_admin());

grant execute on function public.transition_service_request(uuid, text, text, jsonb) to authenticated;
grant execute on function public.accept_staff_invite(text) to authenticated;
grant execute on function public.finalize_service_request_intake(uuid, jsonb, jsonb, text[], text, jsonb, jsonb, text, text, text) to authenticated;
revoke all on function public.claim_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer) to service_role;
