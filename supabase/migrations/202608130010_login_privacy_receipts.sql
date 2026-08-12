create or replace function public.record_login_privacy_consent(
  p_policy_version text,
  p_channel text
)
returns public.consents
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  caller_profile public.profiles%rowtype;
  receipt public.consents%rowtype;
  now_at timestamptz := now();
begin
  if caller_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if nullif(trim(p_policy_version), '') is null then
    raise exception 'POLICY_VERSION_REQUIRED';
  end if;

  if p_channel is null or p_channel not in ('sms', 'wechat_miniprogram') then
    raise exception 'INVALID_CONSENT_CHANNEL';
  end if;

  select * into caller_profile
  from public.profiles
  where id = caller_id;

  if caller_profile.id is null
    or caller_profile.account_status <> 'active'
    or caller_profile.role not in ('resident', 'family') then
    raise exception 'RESIDENT_ACCOUNT_REQUIRED';
  end if;

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
    'privacy',
    trim(p_policy_version),
    true,
    now_at,
    null,
    jsonb_build_object('source', 'login', 'channel', p_channel)
  )
  on conflict (user_id, resident_id, scope, policy_version)
  do update set
    granted = true,
    granted_at = excluded.granted_at,
    revoked_at = null,
    metadata = excluded.metadata
  returning * into receipt;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    caller_id,
    'consent.privacy_granted_at_login',
    'consents',
    receipt.id,
    jsonb_build_object(
      'scope', 'privacy',
      'policy_version', trim(p_policy_version),
      'channel', p_channel
    )
  );

  return receipt;
end;
$$;

revoke all on function public.record_login_privacy_consent(text, text) from public;
grant execute on function public.record_login_privacy_consent(text, text) to authenticated;

comment on function public.record_login_privacy_consent(text, text) is
  'Records the current resident or family account privacy receipt after an authenticated login.';
