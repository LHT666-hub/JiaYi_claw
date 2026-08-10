begin;

alter table public.wechat_subscription_grants
  drop constraint if exists wechat_subscription_grants_delivery_status_check;
alter table public.wechat_subscription_grants
  add constraint wechat_subscription_grants_delivery_status_check
  check (delivery_status in ('available','processing','sent','invalid','failed'));

create or replace function public.record_wechat_subscription_decisions(
  p_user_id uuid,
  p_rows jsonb,
  p_enabled boolean,
  p_trace_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_SUBSCRIPTION_DECISIONS';
  end if;

  insert into public.wechat_subscription_grants (
    user_id,
    template_key,
    template_id,
    decision,
    delivery_status,
    request_trace_id
  )
  select
    p_user_id,
    item->>'template_key',
    item->>'template_id',
    item->>'decision',
    case when item->>'decision' = 'accept' then 'available' else 'invalid' end,
    p_trace_id
  from jsonb_array_elements(p_rows) item;

  get diagnostics v_count = row_count;

  insert into public.notification_preferences (
    user_id,
    wechat_mini_enabled,
    updated_at
  ) values (
    p_user_id,
    p_enabled,
    now()
  )
  on conflict (user_id) do update set
    wechat_mini_enabled = excluded.wechat_mini_enabled,
    updated_at = excluded.updated_at;

  insert into public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    detail
  ) values (
    p_user_id,
    'wechat.subscription_decision_recorded',
    'wechat_subscription_grants',
    p_user_id,
    jsonb_build_object(
      'decisions', p_rows,
      'traceId', p_trace_id
    )
  );

  return v_count;
end;
$$;

create or replace function public.claim_wechat_subscription_grant(
  p_user_id uuid,
  p_template_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant_id uuid;
begin
  select id into v_grant_id
  from public.wechat_subscription_grants
  where user_id = p_user_id
    and template_id = p_template_id
    and decision = 'accept'
    and consumed_at is null
  order by requested_at
  for update skip locked
  limit 1;

  if v_grant_id is null then
    return null;
  end if;

  update public.wechat_subscription_grants
  set consumed_at = now(),
      delivery_status = 'processing',
      last_error = null
  where id = v_grant_id;

  return v_grant_id;
end;
$$;

revoke all on function public.record_wechat_subscription_decisions(uuid, jsonb, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_wechat_subscription_decisions(uuid, jsonb, boolean, text)
  to service_role;

revoke all on function public.claim_wechat_subscription_grant(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_wechat_subscription_grant(uuid, text)
  to service_role;

commit;
