-- Real care-network, reviewed content, schedules and official channel integration.
create table if not exists public.care_networks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, community_id, name)
);

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  short_name text,
  institution_type text not null check (institution_type in ('community','secondary','tertiary','public_service')),
  level_label text,
  address text,
  service_phone text,
  official_url text,
  registration_url text,
  logo_url text,
  source_url text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.care_network_institutions (
  care_network_id uuid not null references public.care_networks(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  network_role text not null check (network_role in ('primary_care','referral','specialty_support','public_service')),
  sort_order integer not null default 0,
  active boolean not null default true,
  primary key (care_network_id, institution_id)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  description text,
  specialties text[] not null default '{}',
  service_phone text,
  official_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table if not exists public.practitioners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  title text,
  role_label text,
  specialties text[] not null default '{}',
  introduction text,
  avatar_url text,
  source_url text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practitioner_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_mode text not null default 'clinic' check (service_mode in ('clinic','phone','home_visit','online')),
  location text,
  registration_url text,
  status text not null default 'draft' check (status in ('draft','verified','cancelled','expired')),
  source_type text not null default 'manual' check (source_type in ('manual','structured_import','official_api')),
  source_url text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_practitioner_schedules_feed on public.practitioner_schedules (institution_id, starts_at, status);

create table if not exists public.referral_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  care_network_id uuid not null references public.care_networks(id) on delete cascade,
  from_institution_id uuid not null references public.institutions(id),
  to_institution_id uuid not null references public.institutions(id),
  to_department_id uuid references public.departments(id),
  name text not null,
  problem_tags text[] not null default '{}',
  instructions text,
  official_url text,
  requires_staff_review boolean not null default true,
  active boolean not null default true,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_institution_id <> to_institution_id)
);

create table if not exists public.resident_care_bindings (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  care_network_id uuid not null references public.care_networks(id) on delete cascade,
  community_id uuid not null references public.communities(id),
  primary_practitioner_id uuid references public.practitioners(id),
  status text not null default 'active' check (status in ('pending','active','revoked')),
  consented_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resident_id, care_network_id)
);

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id),
  institution_id uuid references public.institutions(id),
  name text not null,
  source_type text not null check (source_type in ('official_website','rss','wechat_article','open_api','manual')),
  source_url text not null,
  allowed_host text not null,
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_url)
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id),
  institution_id uuid references public.institutions(id),
  source_id uuid references public.content_sources(id) on delete set null,
  category text not null check (category in ('notice','activity','health_classroom','schedule_notice','policy')),
  title text not null,
  summary text not null,
  cover_url text,
  original_url text not null,
  source_name text not null,
  published_at timestamptz,
  effective_from timestamptz,
  expires_at timestamptz,
  status text not null default 'candidate' check (status in ('candidate','in_review','published','rejected','expired')),
  ingestion_method text not null default 'url_import' check (ingestion_method in ('url_import','rss','open_api','manual')),
  content_hash text not null,
  ingested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, original_url)
);
create index if not exists idx_content_feed on public.content_items (community_id, status, published_at desc);

create table if not exists public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('publish','reject','request_changes','expire')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.content_sources(id) on delete cascade,
  requested_by uuid references public.profiles(id),
  target_url text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  items_found integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id),
  channel_type text not null check (channel_type in ('wecom')),
  name text not null,
  corp_id text not null,
  agent_id text,
  secret_ref text,
  callback_token_ref text,
  encoding_aes_key_ref text,
  receive_capability text not null default 'outbound_only' check (receive_capability in ('outbound_only','callback','archive')),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel_type, corp_id)
);

create table if not exists public.channel_groups (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  community_id uuid references public.communities(id),
  external_group_id text not null,
  name text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  unique (channel_account_id, external_group_id)
);

create table if not exists public.channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_group_id uuid references public.channel_groups(id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  external_user_id text not null,
  resident_id uuid references public.profiles(id) on delete set null,
  display_name text,
  binding_status text not null default 'unbound' check (binding_status in ('unbound','pending','bound','revoked')),
  bound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_account_id, external_user_id)
);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_account_id uuid not null references public.channel_accounts(id) on delete cascade,
  channel_group_id uuid references public.channel_groups(id) on delete set null,
  channel_member_id uuid references public.channel_members(id) on delete set null,
  external_message_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null,
  encrypted_payload text not null,
  payload_hash text not null,
  safety_level text not null default 'low' check (safety_level in ('low','medium','high','emergency')),
  processing_status text not null default 'received' check (processing_status in ('received','processed','human_review','replied','failed')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (channel_account_id, external_message_id)
);

create table if not exists public.resident_fact_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid references public.profiles(id) on delete cascade,
  source_message_id uuid not null references public.channel_messages(id) on delete cascade,
  fact_type text not null check (fact_type in ('appointment_intent','followup_intent','health_observation','medication','symptom','public_question')),
  structured_value jsonb not null,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','expired')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_group_id uuid not null references public.channel_groups(id) on delete cascade,
  content_item_id uuid references public.content_items(id),
  title text not null,
  body text not null,
  link_url text,
  scheduled_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed','cancelled')),
  created_by uuid not null references public.profiles(id),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_requests drop constraint if exists service_requests_service_type_check;
alter table public.service_requests add constraint service_requests_service_type_check check (service_type in (
  'clinic_registration','family_doctor_booking','refill_request','dispense_status_query',
  'followup_reminder','report_explanation','referral_assistance','other'
));
alter table public.service_requests add column if not exists referral_route_id uuid references public.referral_routes(id);
alter table public.service_requests add column if not exists entry_mode text not null default 'staff_assisted'
  check (entry_mode in ('official_link','staff_assisted','wecom','app'));
alter table public.service_requests add column if not exists external_url text;
alter table public.service_catalog drop constraint if exists service_catalog_service_type_check;
alter table public.service_catalog add constraint service_catalog_service_type_check check (service_type in (
  'clinic_registration','family_doctor_booking','refill_request','dispense_status_query',
  'followup_reminder','report_explanation','referral_assistance','other'
));

insert into public.care_networks (organization_id, community_id, name, description)
select c.organization_id, c.id, '海湾镇家医协作网络', '以社区首诊、家医协同和人工转诊为核心的试点网络。'
from public.communities c where c.slug = 'haiwan-town'
on conflict (organization_id, community_id, name) do nothing;

insert into public.institutions (
  organization_id, name, short_name, institution_type, level_label, address, service_phone, verified_at, status
)
select c.organization_id, '海湾镇社区卫生服务中心', '海湾镇社区中心', 'community', '社区卫生服务中心', c.address, c.service_phone, now(), 'active'
from public.communities c where c.slug = 'haiwan-town'
on conflict (organization_id, name) do nothing;

insert into public.care_network_institutions (care_network_id, institution_id, network_role, sort_order)
select n.id, i.id, 'primary_care', 0
from public.care_networks n
join public.institutions i on i.organization_id = n.organization_id and i.institution_type = 'community'
where n.name = '海湾镇家医协作网络' and i.name = '海湾镇社区卫生服务中心'
on conflict (care_network_id, institution_id) do nothing;

insert into public.resident_care_bindings (resident_id, care_network_id, community_id, status, consented_at, created_by)
select p.id, n.id, n.community_id, 'active', now(), p.id
from public.profiles p
join public.care_networks n on n.organization_id = p.organization_id and n.community_id = p.community_id
where p.role = 'resident'
on conflict (resident_id, care_network_id) do nothing;

create or replace function public.attach_default_care_network()
returns trigger language plpgsql security definer set search_path = public as $$
declare network_id uuid;
begin
  if new.role <> 'resident' then return new; end if;
  select id into network_id from public.care_networks
  where organization_id = new.organization_id and community_id = new.community_id and status = 'active'
  order by created_at limit 1;
  if network_id is not null then
    insert into public.resident_care_bindings (resident_id, care_network_id, community_id, status, consented_at, created_by)
    values (new.id, network_id, new.community_id, 'active', now(), new.id)
    on conflict (resident_id, care_network_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_attach_care_network on public.profiles;
create trigger trg_profiles_attach_care_network after insert or update of role, organization_id, community_id on public.profiles
for each row execute function public.attach_default_care_network();

create or replace function public.current_care_network_id()
returns uuid language sql stable security definer set search_path = public as $$
  select b.care_network_id from public.resident_care_bindings b
  where b.resident_id = auth.uid() and b.status = 'active'
  order by b.created_at limit 1
$$;

create or replace function public.can_read_care_network(target_network_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resident_care_bindings b
    where b.care_network_id = target_network_id and b.status = 'active'
      and (public.is_related_to_resident(b.resident_id) or public.is_workbench_role())
  )
$$;

create or replace function public.review_fact_candidate(p_candidate_id uuid, p_decision text, p_structured_value jsonb default null)
returns public.resident_fact_candidates
language plpgsql security definer set search_path = public as $$
declare
  candidate public.resident_fact_candidates;
  resident public.profiles;
  request_id uuid;
begin
  if not public.is_workbench_role() then raise exception 'WORKBENCH_ROLE_REQUIRED'; end if;
  if p_decision not in ('confirmed','rejected') then raise exception 'INVALID_FACT_DECISION'; end if;
  select * into candidate from public.resident_fact_candidates where id = p_candidate_id for update;
  if candidate.id is null or candidate.organization_id <> public.current_organization_id() then raise exception 'FACT_NOT_FOUND'; end if;
  update public.resident_fact_candidates set
    status = p_decision,
    structured_value = coalesce(p_structured_value, structured_value),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = candidate.id returning * into candidate;

  if p_decision = 'confirmed' then
    if candidate.resident_id is null then raise exception 'BOUND_RESIDENT_REQUIRED'; end if;
    select * into resident from public.profiles where id = candidate.resident_id;
    if candidate.fact_type = 'health_observation' then
      insert into public.health_observations (
        resident_id, recorded_by, observation_type, value, secondary_value, unit, measured_at, note, source
      ) values (
        candidate.resident_id, auth.uid(), candidate.structured_value ->> 'observationType',
        (candidate.structured_value ->> 'value')::numeric,
        nullif(candidate.structured_value ->> 'secondaryValue', '')::numeric,
        candidate.structured_value ->> 'unit',
        coalesce((candidate.structured_value ->> 'measuredAt')::timestamptz, now()),
        '由企业微信群消息提取并经家医确认。', 'wecom_confirmed'
      );
    elsif candidate.fact_type in ('appointment_intent','followup_intent') then
      insert into public.service_requests (
        organization_id, community_id, resident_id, requested_by, service_type,
        title, summary, priority, status, assigned_role, payload, idempotency_key, source, entry_mode
      ) values (
        candidate.organization_id, resident.community_id, candidate.resident_id, candidate.resident_id,
        case when candidate.fact_type = 'appointment_intent' then 'clinic_registration' else 'followup_reminder' end,
        coalesce(candidate.structured_value ->> 'title', case when candidate.fact_type = 'appointment_intent' then '微信群预约协助' else '微信群随访协助' end),
        coalesce(candidate.structured_value ->> 'summary', '居民通过企业微信群提出服务诉求。'),
        'low', 'submitted', case when candidate.fact_type = 'appointment_intent' then 'community' else 'nurse' end,
        jsonb_build_object('factCandidateId', candidate.id, 'confirmedBy', auth.uid()),
        'wecom:' || candidate.id::text, 'wecom', 'wecom'
      ) returning id into request_id;
      insert into public.service_request_events (service_request_id, actor_id, action, old_status, new_status, note, metadata)
      values (request_id, auth.uid(), 'confirm_group_fact', null, 'submitted', '家医确认群聊服务事实后创建。', jsonb_build_object('candidateId', candidate.id));
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'resident_fact.' || p_decision, 'resident_fact_candidates', candidate.id, jsonb_build_object('factType', candidate.fact_type));
  return candidate;
end;
$$;

create or replace function public.purge_expired_channel_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from public.channel_messages where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.bind_channel_member(p_account_id uuid, p_external_user_id text, p_resident_id uuid)
returns public.channel_members
language plpgsql security definer set search_path = public as $$
declare member public.channel_members; account public.channel_accounts;
begin
  if not public.is_related_to_resident(p_resident_id) then raise exception 'RESIDENT_SCOPE_FORBIDDEN'; end if;
  select * into account from public.channel_accounts where id = p_account_id and status = 'active';
  if account.id is null or account.organization_id <> public.current_organization_id() then raise exception 'CHANNEL_ACCOUNT_NOT_FOUND'; end if;
  update public.channel_members set resident_id = p_resident_id, binding_status = 'bound', bound_at = now(), updated_at = now()
  where channel_account_id = p_account_id and external_user_id = p_external_user_id
  returning * into member;
  if member.id is null then raise exception 'CHANNEL_MEMBER_NOT_FOUND'; end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'channel_member.bound', 'channel_members', member.id, jsonb_build_object('residentId', p_resident_id));
  return member;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'care_networks','institutions','care_network_institutions','departments','practitioners',
    'practitioner_schedules','referral_routes','resident_care_bindings','content_sources',
    'content_items','content_reviews','ingestion_jobs','channel_accounts','channel_groups',
    'channel_members','channel_messages','resident_fact_candidates','scheduled_broadcasts'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

create policy "care_network_read_bound" on public.care_networks for select to authenticated
using (public.can_read_care_network(id) or public.staff_can_access_tenant(organization_id, community_id));
create policy "care_network_admin_manage" on public.care_networks for all to authenticated
using (public.is_admin() and organization_id = public.current_organization_id()) with check (public.is_admin() and organization_id = public.current_organization_id());
create policy "institutions_read_network" on public.institutions for select to authenticated
using (exists (select 1 from public.care_network_institutions ni where ni.institution_id = id and ni.active and public.can_read_care_network(ni.care_network_id)) or public.staff_can_access_tenant(organization_id, null));
create policy "institutions_admin_manage" on public.institutions for all to authenticated
using (public.is_admin() and organization_id = public.current_organization_id()) with check (public.is_admin() and organization_id = public.current_organization_id());
create policy "network_institutions_read" on public.care_network_institutions for select to authenticated
using (public.can_read_care_network(care_network_id) or public.is_workbench_role());
create policy "network_institutions_admin" on public.care_network_institutions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "departments_read" on public.departments for select to authenticated using (active and exists (select 1 from public.institutions i where i.id = institution_id and (public.staff_can_access_tenant(i.organization_id, null) or exists (select 1 from public.care_network_institutions ni where ni.institution_id = i.id and public.can_read_care_network(ni.care_network_id)))));
create policy "departments_admin" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "practitioners_read" on public.practitioners for select to authenticated using (active and (public.staff_can_access_tenant(organization_id, null) or exists (select 1 from public.care_network_institutions ni where ni.institution_id = institution_id and public.can_read_care_network(ni.care_network_id))));
create policy "practitioners_staff_manage" on public.practitioners for all to authenticated
using (public.staff_can_access_tenant(organization_id, null)) with check (public.staff_can_access_tenant(organization_id, null));
create policy "schedules_read_verified" on public.practitioner_schedules for select to authenticated
using ((status = 'verified' and ends_at > now() and exists (select 1 from public.care_network_institutions ni where ni.institution_id = institution_id and public.can_read_care_network(ni.care_network_id))) or public.staff_can_access_tenant(organization_id, null));
create policy "schedules_staff_manage" on public.practitioner_schedules for all to authenticated
using (public.staff_can_access_tenant(organization_id, null)) with check (public.staff_can_access_tenant(organization_id, null));
create policy "referral_routes_read" on public.referral_routes for select to authenticated
using ((active and public.can_read_care_network(care_network_id)) or public.staff_can_access_tenant(organization_id, null));
create policy "referral_routes_staff" on public.referral_routes for all to authenticated
using (public.staff_can_access_tenant(organization_id, null)) with check (public.staff_can_access_tenant(organization_id, null));
create policy "care_bindings_read" on public.resident_care_bindings for select to authenticated
using (public.is_related_to_resident(resident_id) or exists (select 1 from public.care_networks n where n.id = care_network_id and public.staff_can_access_tenant(n.organization_id, n.community_id)));
create policy "care_bindings_admin" on public.resident_care_bindings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "content_sources_staff" on public.content_sources for all to authenticated
using (public.staff_can_access_tenant(organization_id, community_id)) with check (public.staff_can_access_tenant(organization_id, community_id));
create policy "content_items_public_read" on public.content_items for select to anon, authenticated
using (status = 'published' and (expires_at is null or expires_at > now()));
create policy "content_items_staff_manage" on public.content_items for all to authenticated
using (public.staff_can_access_tenant(organization_id, community_id)) with check (public.staff_can_access_tenant(organization_id, community_id));
create policy "content_reviews_staff" on public.content_reviews for all to authenticated using (exists (select 1 from public.content_items i where i.id = content_item_id and public.staff_can_access_tenant(i.organization_id, i.community_id))) with check (public.is_workbench_role());
create policy "ingestion_jobs_staff" on public.ingestion_jobs for all to authenticated using (exists (select 1 from public.content_sources s where s.id = source_id and public.staff_can_access_tenant(s.organization_id, s.community_id))) with check (public.is_workbench_role());
create policy "channel_accounts_admin" on public.channel_accounts for all to authenticated
using (public.is_admin() and organization_id = public.current_organization_id()) with check (public.is_admin() and organization_id = public.current_organization_id());
create policy "channel_groups_staff" on public.channel_groups for all to authenticated using (exists (select 1 from public.channel_accounts a where a.id = channel_account_id and public.staff_can_access_tenant(a.organization_id, a.community_id))) with check (public.is_workbench_role());
create policy "channel_members_staff" on public.channel_members for all to authenticated using (exists (select 1 from public.channel_accounts a where a.id = channel_account_id and public.staff_can_access_tenant(a.organization_id, a.community_id))) with check (public.is_workbench_role());
create policy "channel_members_read_bound" on public.channel_members for select to authenticated using (resident_id is not null and public.is_related_to_resident(resident_id));
create policy "channel_messages_staff" on public.channel_messages for select to authenticated using (exists (select 1 from public.channel_accounts a where a.id = channel_account_id and public.staff_can_access_tenant(a.organization_id, a.community_id)));
create policy "fact_candidates_staff" on public.resident_fact_candidates for select to authenticated
using (public.staff_can_access_tenant(organization_id, null));
create policy "broadcasts_staff" on public.scheduled_broadcasts for all to authenticated
using (public.staff_can_access_tenant(organization_id, null)) with check (public.staff_can_access_tenant(organization_id, null));

grant execute on function public.review_fact_candidate(uuid, text, jsonb) to authenticated;
grant execute on function public.bind_channel_member(uuid, text, uuid) to authenticated;
revoke all on function public.purge_expired_channel_messages() from public, anon, authenticated;
grant execute on function public.purge_expired_channel_messages() to service_role;
