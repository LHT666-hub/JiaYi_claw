drop policy if exists audit_logs_actor_insert_scoped on public.audit_logs;
create policy audit_logs_staff_insert_scoped on public.audit_logs
for insert to authenticated
with check (
  public.is_workbench_role()
  and actor_id = auth.uid()
  and organization_id = public.current_organization_id()
  and (community_id is null or community_id = public.current_community_id())
);

comment on policy audit_logs_staff_insert_scoped on public.audit_logs is
  'Residents cannot manufacture administrative audit events; resident actions are recorded by security-definer RPCs and table triggers.';
