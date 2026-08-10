-- Production onboarding: keep public registration limited to resident/family
-- accounts and record each consent independently.

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists preferred_language text not null default 'zh-CN';

-- Accounts that predate this migration are already in active use. Only newly
-- created public accounts should enter onboarding with a null timestamp.
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, created_at, now());

drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
revoke update on public.profiles from anon, authenticated;

create or replace function public.complete_public_onboarding(
  p_display_name text,
  p_role text,
  p_community_id uuid,
  p_policy_version text,
  p_consents jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_profile public.profiles;
  selected_community public.communities;
  updated_profile public.profiles;
  consent_scope text;
  consent_granted boolean;
  now_at timestamptz := now();
begin
  if caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into current_profile
  from public.profiles
  where id = caller_id
  for update;

  if not found or current_profile.account_status <> 'active' then
    raise exception 'ACCOUNT_NOT_ACTIVE';
  end if;

  if current_profile.role not in ('resident', 'family') then
    raise exception 'PUBLIC_ONBOARDING_ROLE_FORBIDDEN';
  end if;

  if current_profile.onboarding_completed_at is not null
    and current_profile.role <> p_role then
    raise exception 'ONBOARDING_ROLE_LOCKED';
  end if;

  if p_role not in ('resident', 'family') then
    raise exception 'INVALID_PUBLIC_ROLE';
  end if;

  if length(trim(coalesce(p_display_name, ''))) < 2
    or length(trim(p_display_name)) > 40 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  if length(trim(coalesce(p_policy_version, ''))) < 1
    or length(trim(p_policy_version)) > 40 then
    raise exception 'INVALID_POLICY_VERSION';
  end if;

  if coalesce((p_consents ->> 'privacy')::boolean, false) is not true then
    raise exception 'PRIVACY_CONSENT_REQUIRED';
  end if;

  select * into selected_community
  from public.communities
  where id = p_community_id and status = 'active';

  if not found then
    raise exception 'COMMUNITY_NOT_AVAILABLE';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      role = p_role,
      organization_id = selected_community.organization_id,
      community_id = selected_community.id,
      onboarding_completed_at = now_at,
      preferred_language = 'zh-CN',
      updated_at = now_at
  where id = caller_id
  returning * into updated_profile;

  foreach consent_scope in array array['privacy', 'sensitive_health', 'ai_processing', 'notification']
  loop
    consent_granted := coalesce((p_consents ->> consent_scope)::boolean, false);
    insert into public.consents (
      user_id,
      resident_id,
      scope,
      policy_version,
      granted,
      granted_at,
      revoked_at,
      metadata
    ) values (
      caller_id,
      caller_id,
      consent_scope,
      trim(p_policy_version),
      consent_granted,
      case when consent_granted then now_at else null end,
      case when consent_granted then null else now_at end,
      jsonb_build_object('source', 'onboarding', 'role', p_role)
    )
    on conflict (user_id, resident_id, scope, policy_version)
    do update set
      granted = excluded.granted,
      granted_at = excluded.granted_at,
      revoked_at = excluded.revoked_at,
      metadata = excluded.metadata;
  end loop;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    caller_id,
    'onboarding.completed',
    'profiles',
    caller_id,
    jsonb_build_object(
      'role', p_role,
      'community_id', p_community_id,
      'policy_version', trim(p_policy_version),
      'consent_scopes', p_consents
    )
  );

  return updated_profile;
end;
$$;

revoke all on function public.complete_public_onboarding(text, text, uuid, text, jsonb) from public;
grant execute on function public.complete_public_onboarding(text, text, uuid, text, jsonb) to authenticated;

create table if not exists public.family_link_codes (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  expires_at timestamptz not null,
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists family_link_codes_resident_idx
  on public.family_link_codes (resident_id, status, expires_at desc);

alter table public.family_link_codes enable row level security;

create policy "family_link_codes_resident_read"
on public.family_link_codes for select to authenticated
using (resident_id = auth.uid() or public.is_admin());

create or replace function public.create_family_link_code(
  p_code_hash text,
  p_expires_at timestamptz,
  p_policy_version text
)
returns public.family_link_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles;
  created_code public.family_link_codes;
  now_at timestamptz := now();
begin
  select * into caller_profile from public.profiles where id = auth.uid();
  if not found or caller_profile.role <> 'resident' or caller_profile.account_status <> 'active' then
    raise exception 'RESIDENT_REQUIRED';
  end if;
  if length(coalesce(p_code_hash, '')) <> 64 or p_expires_at <= now_at or p_expires_at > now_at + interval '30 minutes' then
    raise exception 'INVALID_LINK_CODE';
  end if;

  update public.family_link_codes
  set status = 'revoked'
  where resident_id = auth.uid() and status = 'active';

  insert into public.family_link_codes (resident_id, code_hash, expires_at)
  values (auth.uid(), p_code_hash, p_expires_at)
  returning * into created_code;

  insert into public.consents (
    user_id, resident_id, scope, policy_version, granted, granted_at, revoked_at, metadata
  ) values (
    auth.uid(), auth.uid(), 'family_delegate', p_policy_version, true, now_at, null,
    jsonb_build_object('source', 'family_link_code', 'link_code_id', created_code.id)
  )
  on conflict (user_id, resident_id, scope, policy_version)
  do update set granted = true, granted_at = excluded.granted_at, revoked_at = null, metadata = excluded.metadata;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'family_link.created', 'family_link_codes', created_code.id, jsonb_build_object('expires_at', p_expires_at));

  return created_code;
end;
$$;

create or replace function public.redeem_family_link_code(
  p_code_hash text,
  p_relationship text
)
returns public.family_bindings
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles;
  resident_profile public.profiles;
  link_code public.family_link_codes;
  binding public.family_bindings;
  now_at timestamptz := now();
begin
  select * into caller_profile from public.profiles where id = auth.uid();
  if not found or caller_profile.role <> 'family' or caller_profile.account_status <> 'active' then
    raise exception 'FAMILY_ROLE_REQUIRED';
  end if;
  if length(trim(coalesce(p_relationship, ''))) < 1 or length(trim(p_relationship)) > 20 then
    raise exception 'INVALID_RELATIONSHIP';
  end if;

  select * into link_code
  from public.family_link_codes
  where code_hash = p_code_hash and status = 'active'
  for update;

  if not found or link_code.expires_at <= now_at then
    raise exception 'LINK_CODE_INVALID_OR_EXPIRED';
  end if;

  select * into resident_profile from public.profiles where id = link_code.resident_id;
  if not found or resident_profile.role <> 'resident'
    or resident_profile.organization_id is distinct from caller_profile.organization_id
    or resident_profile.community_id is distinct from caller_profile.community_id then
    raise exception 'FAMILY_LINK_SCOPE_FORBIDDEN';
  end if;

  insert into public.family_bindings (resident_id, family_id, relationship, is_primary, status)
  values (link_code.resident_id, auth.uid(), trim(p_relationship), true, 'active')
  on conflict (resident_id, family_id)
  do update set relationship = excluded.relationship, status = 'active', updated_at = now_at
  returning * into binding;

  update public.family_link_codes
  set status = 'used', used_by = auth.uid(), used_at = now_at
  where id = link_code.id;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'family_link.redeemed', 'family_bindings', binding.id, jsonb_build_object('resident_id', link_code.resident_id));

  return binding;
end;
$$;

revoke all on function public.create_family_link_code(text, timestamptz, text) from public;
revoke all on function public.redeem_family_link_code(text, text) from public;
grant execute on function public.create_family_link_code(text, timestamptz, text) to authenticated;
grant execute on function public.redeem_family_link_code(text, text) to authenticated;

create table if not exists public.wechat_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id text not null,
  open_id text not null,
  union_id text,
  phone text,
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, open_id),
  unique (app_id, user_id)
);

alter table public.wechat_identities enable row level security;

create policy "wechat_identities_owner_read"
on public.wechat_identities for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create or replace function public.find_auth_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where phone = p_phone limit 1
$$;

revoke all on function public.find_auth_user_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_phone(text) to service_role;

-- Local Auth uses the fixed OTP values from config.toml. Production config
-- replaces this Postgres hook with the HTTPS Tencent Cloud SMS hook.
create or replace function public.send_sms(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return '{}'::jsonb;
end;
$$;

revoke all on function public.send_sms(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.send_sms(jsonb) to supabase_auth_admin;

-- New phone registrations always begin as residents. Choosing family is an
-- explicit, audited onboarding action; staff roles still require an invite.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org uuid;
  default_community uuid;
begin
  select id into default_org from public.organizations where slug = 'fengxian-primary-care' limit 1;
  select id into default_community from public.communities where slug = 'haiwan-town' limit 1;

  insert into public.profiles (
    id, display_name, role, phone, organization_id, community_id, account_status,
    onboarding_completed_at
  ) values (
    new.id,
    coalesce(nullif(new.phone, ''), split_part(new.email, '@', 1), '新用户'),
    'resident',
    new.phone,
    default_org,
    default_community,
    'active',
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
