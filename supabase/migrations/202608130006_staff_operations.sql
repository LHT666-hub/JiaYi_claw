create or replace function public.create_staff_invite(
  p_phone text,
  p_display_name text,
  p_role text,
  p_community_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns public.staff_invites
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  caller public.profiles;
  normalized_phone text;
  invite public.staff_invites;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role <> 'admin' or caller.account_status <> 'active' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_role not in ('doctor', 'nurse', 'pharmacist', 'community', 'admin') then
    raise exception 'INVALID_STAFF_ROLE';
  end if;

  if p_community_id is not null and not exists (
    select 1 from public.communities
    where id = p_community_id and organization_id = caller.organization_id
  ) then
    raise exception 'COMMUNITY_SCOPE_FORBIDDEN';
  end if;

  normalized_phone := public.normalize_cn_phone(p_phone);
  if normalized_phone !~ '^\+861[0-9]{10}$' then
    raise exception 'INVALID_CHINA_PHONE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller.organization_id::text || normalized_phone, 0));

  update public.staff_invites
  set status = 'expired'
  where organization_id = caller.organization_id
    and phone = normalized_phone
    and status = 'pending'
    and expires_at <= now();

  if exists (
    select 1 from public.staff_invites
    where organization_id = caller.organization_id
      and phone = normalized_phone
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'ACTIVE_INVITE_EXISTS';
  end if;

  insert into public.staff_invites (
    organization_id, community_id, phone, display_name, role,
    token_hash, expires_at, invited_by
  ) values (
    caller.organization_id, coalesce(p_community_id, caller.community_id),
    normalized_phone, trim(p_display_name), p_role,
    p_token_hash, p_expires_at, caller.id
  ) returning * into invite;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    caller.id, 'staff_invite.created', 'staff_invites', invite.id,
    jsonb_build_object('role', invite.role, 'community_id', invite.community_id, 'expires_at', invite.expires_at)
  );

  return invite;
end;
$$;

create or replace function public.revoke_staff_invite(p_invite_id uuid)
returns public.staff_invites
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  caller public.profiles;
  invite public.staff_invites;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role <> 'admin' or caller.account_status <> 'active' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.staff_invites
  set status = 'revoked'
  where id = p_invite_id
    and organization_id = caller.organization_id
    and status = 'pending'
  returning * into invite;

  if invite.id is null then raise exception 'INVITE_NOT_PENDING'; end if;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (caller.id, 'staff_invite.revoked', 'staff_invites', invite.id, jsonb_build_object('role', invite.role));

  return invite;
end;
$$;

create or replace function public.set_staff_account_status(p_profile_id uuid, p_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  caller public.profiles;
  target public.profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.role <> 'admin' or caller.account_status <> 'active' then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('active', 'disabled') then raise exception 'INVALID_ACCOUNT_STATUS'; end if;
  if p_profile_id = caller.id and p_status <> 'active' then raise exception 'CANNOT_SUSPEND_SELF'; end if;

  update public.profiles
  set account_status = p_status, updated_at = now()
  where id = p_profile_id
    and organization_id = caller.organization_id
    and role in ('doctor', 'nurse', 'pharmacist', 'community', 'admin')
  returning * into target;

  if target.id is null then raise exception 'STAFF_NOT_FOUND'; end if;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    caller.id,
    case when p_status = 'active' then 'staff_account.activated' else 'staff_account.suspended' end,
    'profiles', target.id, jsonb_build_object('role', target.role)
  );

  return target;
end;
$$;

revoke all on function public.create_staff_invite(text, text, text, uuid, text, timestamptz) from public;
revoke all on function public.revoke_staff_invite(uuid) from public;
revoke all on function public.set_staff_account_status(uuid, text) from public;
grant execute on function public.create_staff_invite(text, text, text, uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_staff_invite(uuid) to authenticated;
grant execute on function public.set_staff_account_status(uuid, text) to authenticated;

comment on function public.create_staff_invite(text, text, text, uuid, text, timestamptz) is
  'Atomically creates a tenant-scoped staff invite and its audit record.';
comment on function public.revoke_staff_invite(uuid) is
  'Atomically revokes a pending tenant-scoped staff invite and records the action.';
comment on function public.set_staff_account_status(uuid, text) is
  'Atomically suspends or restores a staff account without allowing self-lockout.';

create or replace function public.accept_staff_invite(p_token text)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth, extensions
set row_security = off
as $$
declare
  invite public.staff_invites;
  result public.profiles;
  current_phone text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select phone into current_phone from auth.users where id = auth.uid();
  if current_phone is null then raise exception 'PHONE_VERIFICATION_REQUIRED'; end if;

  select * into invite
  from public.staff_invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
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
    onboarding_completed_at = coalesce(onboarding_completed_at, now()),
    updated_at = now()
  where id = auth.uid()
  returning * into result;
  if result.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;

  update public.staff_invites set
    status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite.id;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'staff_invite.accepted', 'profiles', auth.uid(),
    jsonb_build_object('role', invite.role, 'invite_id', invite.id)
  );
  return result;
end;
$$;

revoke all on function public.accept_staff_invite(text) from public;
grant execute on function public.accept_staff_invite(text) to authenticated;

comment on function public.accept_staff_invite(text) is
  'Consumes a phone-bound one-time invite and atomically upgrades the authenticated profile into a staff role.';
