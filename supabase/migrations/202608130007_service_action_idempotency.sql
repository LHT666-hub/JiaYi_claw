create table if not exists public.service_request_action_idempotency (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  action text not null,
  created_at timestamptz not null default now(),
  unique (service_request_id, actor_id, idempotency_key)
);

alter table public.service_request_action_idempotency enable row level security;
revoke all on public.service_request_action_idempotency from anon, authenticated;

create or replace function public.transition_service_request_idempotent(
  p_request_id uuid,
  p_action text,
  p_note text default null,
  p_details jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  existing_action text;
  result public.service_requests;
begin
  if actor is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text || actor::text || trim(p_idempotency_key), 0));

  select action into existing_action
  from public.service_request_action_idempotency
  where service_request_id = p_request_id
    and actor_id = actor
    and idempotency_key = trim(p_idempotency_key);

  if existing_action is not null then
    if existing_action <> p_action then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    select * into result from public.service_requests where id = p_request_id;
    if result.id is null then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
    return result;
  end if;

  result := public.transition_service_request(p_request_id, p_action, p_note, p_details);
  insert into public.service_request_action_idempotency (
    service_request_id, actor_id, idempotency_key, action
  ) values (p_request_id, actor, trim(p_idempotency_key), p_action);
  return result;
end;
$$;

revoke all on function public.transition_service_request_idempotent(uuid, text, text, jsonb, text) from public;
grant execute on function public.transition_service_request_idempotent(uuid, text, text, jsonb, text) to authenticated;

comment on function public.transition_service_request_idempotent(uuid, text, text, jsonb, text) is
  'Executes a service request transition once per actor-scoped idempotency key.';
