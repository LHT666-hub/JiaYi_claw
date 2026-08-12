drop policy if exists audit_logs_actor_insert_scoped on public.audit_logs;
create policy audit_logs_actor_insert_scoped on public.audit_logs
for insert to authenticated
with check (
  actor_id = auth.uid()
  and organization_id = public.current_organization_id()
  and (community_id is null or community_id = public.current_community_id())
);

create or replace function public.audit_service_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  action_name text;
begin
  action_name := case
    when tg_op = 'INSERT' then 'service_catalog.created'
    when old.active is distinct from new.active and new.active = false then 'service_catalog.disabled'
    when old.active is distinct from new.active and new.active = true then 'service_catalog.enabled'
    else 'service_catalog.updated'
  end;

  insert into public.audit_logs (
    actor_id, organization_id, community_id, action, target_table, target_id, detail
  ) values (
    auth.uid(), new.organization_id, new.community_id, action_name,
    'service_catalog', new.id,
    jsonb_build_object(
      'serviceType', new.service_type,
      'active', new.active,
      'accessMode', new.access_mode,
      'ownerRole', new.owner_role
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_service_catalog_audit on public.service_catalog;
create trigger trg_service_catalog_audit
after insert or update on public.service_catalog
for each row execute function public.audit_service_catalog_change();

comment on function public.audit_service_catalog_change() is
  'Writes service catalog audit evidence in the same transaction as the configuration change.';
