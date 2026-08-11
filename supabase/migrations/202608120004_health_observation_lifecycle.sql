-- Manual resident-entered observations can be corrected, but never without
-- authorization and an audit trail. Imported or staff-confirmed sources remain
-- immutable through the resident API.
create or replace function public.delete_manual_health_observation(
  p_observation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  observation public.health_observations;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into observation
  from public.health_observations
  where id = p_observation_id
  for update;

  if not found then
    raise exception 'HEALTH_OBSERVATION_NOT_FOUND';
  end if;
  if observation.source <> 'manual' then
    raise exception 'HEALTH_OBSERVATION_IMMUTABLE';
  end if;
  if auth.uid() <> observation.resident_id
    and not (
      auth.uid() = observation.recorded_by
      and public.is_related_to_resident(observation.resident_id)
    ) then
    raise exception 'HEALTH_OBSERVATION_FORBIDDEN';
  end if;

  delete from public.health_observations where id = observation.id;

  insert into public.audit_logs (
    actor_id, action, target_table, target_id, detail
  ) values (
    auth.uid(),
    'health_observation.deleted',
    'health_observations',
    observation.id,
    jsonb_build_object(
      'residentId', observation.resident_id,
      'observationType', observation.observation_type,
      'measuredAt', observation.measured_at,
      'source', observation.source
    )
  );

  return true;
end;
$$;

revoke all on function public.delete_manual_health_observation(uuid) from public, anon;
grant execute on function public.delete_manual_health_observation(uuid) to authenticated;
