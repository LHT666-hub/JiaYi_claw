create or replace function public.audit_pipeline_ready()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  has_staff_policy boolean;
  has_resident_policy boolean;
  has_catalog_trigger boolean;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_staff_insert_scoped'
  ) into has_staff_policy;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_resident_action_insert'
  ) into has_resident_policy;

  select exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'service_catalog'
      and trigger.tgname = 'trg_service_catalog_audit'
      and not trigger.tgisinternal
  ) into has_catalog_trigger;

  return has_staff_policy and has_resident_policy and has_catalog_trigger;
end;
$$;

revoke all on function public.audit_pipeline_ready() from public;
grant execute on function public.audit_pipeline_ready() to authenticated;

comment on function public.audit_pipeline_ready() is
  'Admin-only deployment self-check for scoped audit policies and transactional service catalog auditing.';
