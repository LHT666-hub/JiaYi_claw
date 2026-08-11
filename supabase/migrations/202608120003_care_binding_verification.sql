begin;

alter table public.resident_care_bindings
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists verification_note text;

alter table public.resident_care_bindings alter column status set default 'pending';

update public.resident_care_bindings
set verified_at = coalesce(verified_at, consented_at, created_at),
    verification_note = coalesce(verification_note, '历史有效签约关系自动回填')
where status = 'active' and verified_at is null;

create index if not exists idx_care_bindings_review_queue
  on public.resident_care_bindings (community_id, status, created_at);

create or replace function public.attach_default_care_network()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  network_id uuid;
begin
  if new.role <> 'resident' or new.organization_id is null or new.community_id is null then
    return new;
  end if;

  select id into network_id
  from public.care_networks
  where organization_id = new.organization_id
    and community_id = new.community_id
    and status = 'active'
  order by created_at
  limit 1;

  if network_id is not null then
    update public.resident_care_bindings
    set status = 'revoked',
        verification_note = '居民重新选择了服务社区',
        updated_at = now()
    where resident_id = new.id
      and care_network_id <> network_id
      and status in ('pending', 'active');

    insert into public.resident_care_bindings (
      resident_id,
      care_network_id,
      community_id,
      status,
      consented_at,
      created_by
    ) values (
      new.id,
      network_id,
      new.community_id,
      'pending',
      now(),
      new.id
    )
    on conflict (resident_id, care_network_id) do update
    set community_id = excluded.community_id,
        status = case
          when public.resident_care_bindings.status = 'active' then 'active'
          else 'pending'
        end,
        consented_at = coalesce(public.resident_care_bindings.consented_at, excluded.consented_at),
        updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.review_resident_care_binding(
  p_binding_id uuid,
  p_decision text,
  p_note text default null
)
returns public.resident_care_bindings
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  binding public.resident_care_bindings;
  network public.care_networks;
begin
  if public.current_app_role() not in ('doctor', 'nurse', 'community', 'admin') then
    raise exception 'CARE_BINDING_REVIEW_ROLE_REQUIRED';
  end if;

  if p_decision not in ('active', 'pending', 'revoked') then
    raise exception 'INVALID_CARE_BINDING_DECISION';
  end if;

  if length(coalesce(p_note, '')) > 500 then
    raise exception 'CARE_BINDING_NOTE_TOO_LONG';
  end if;

  select * into binding
  from public.resident_care_bindings
  where id = p_binding_id
  for update;

  if not found then
    raise exception 'CARE_BINDING_NOT_FOUND';
  end if;

  select * into network from public.care_networks where id = binding.care_network_id;
  if not found
    or not public.staff_can_access_tenant(network.organization_id, network.community_id)
    or not public.can_staff_access_profile(binding.resident_id) then
    raise exception 'CARE_BINDING_SCOPE_FORBIDDEN';
  end if;

  update public.resident_care_bindings
  set status = p_decision,
      verified_at = case when p_decision = 'active' then now() else null end,
      verified_by = case when p_decision = 'active' then auth.uid() else null end,
      verification_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = p_binding_id
  returning * into binding;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(),
    'care_binding.' || p_decision,
    'resident_care_bindings',
    binding.id,
    jsonb_build_object(
      'residentId', binding.resident_id,
      'careNetworkId', binding.care_network_id,
      'note', binding.verification_note
    )
  );

  insert into public.notifications (user_id, actor_id, type, title, content, link_url, metadata)
  values (
    binding.resident_id,
    auth.uid(),
    'system',
    case
      when p_decision = 'active' then '家医签约关系已核验'
      when p_decision = 'revoked' then '家医签约关系已停止'
      else '家医签约关系待补充核验'
    end,
    case
      when p_decision = 'active' then '预约协助和健康记录功能现已开放。'
      when p_decision = 'revoked' then '如有疑问，请联系所属社区卫生服务中心。'
      else '工作人员正在核对您的社区与家医团队信息。'
    end,
    '/services',
    jsonb_build_object('bindingId', binding.id, 'status', p_decision)
  );

  return binding;
end;
$$;

revoke all on function public.review_resident_care_binding(uuid, text, text) from public;
grant execute on function public.review_resident_care_binding(uuid, text, text) to authenticated;

commit;
