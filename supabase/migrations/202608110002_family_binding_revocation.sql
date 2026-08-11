create or replace function public.revoke_family_binding(p_binding_id uuid)
returns public.family_bindings
language plpgsql
security definer
set search_path = public
as $$
declare
  binding public.family_bindings;
  caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null then
    raise exception 'PROFILE_REQUIRED';
  end if;

  select * into binding
  from public.family_bindings
  where id = p_binding_id
  for update;

  if not found then
    raise exception 'FAMILY_BINDING_NOT_FOUND';
  end if;
  if auth.uid() <> binding.resident_id
    and auth.uid() <> binding.family_id
    and caller_role <> 'admin' then
    raise exception 'FAMILY_BINDING_FORBIDDEN';
  end if;

  if binding.status <> 'disabled' then
    update public.family_bindings
    set status = 'disabled', updated_at = now()
    where id = binding.id
    returning * into binding;

    if not exists (
      select 1 from public.family_bindings
      where resident_id = binding.resident_id
        and status = 'active'
    ) then
      update public.consents
      set granted = false, revoked_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'source', 'last_family_binding_revoked',
            'binding_id', binding.id
          )
      where user_id = binding.resident_id
        and resident_id = binding.resident_id
        and scope = 'family_delegate'
        and granted = true;
    end if;

    insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
    values (
      auth.uid(),
      'family_link.revoked',
      'family_bindings',
      binding.id,
      jsonb_build_object(
        'resident_id', binding.resident_id,
        'family_id', binding.family_id,
        'revoked_by_role', caller_role
      )
    );
  end if;

  return binding;
end;
$$;

revoke all on function public.revoke_family_binding(uuid) from public;
grant execute on function public.revoke_family_binding(uuid) to authenticated;
