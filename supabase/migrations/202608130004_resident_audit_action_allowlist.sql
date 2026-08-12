drop policy if exists audit_logs_resident_action_insert on public.audit_logs;
create policy audit_logs_resident_action_insert on public.audit_logs
for insert to authenticated
with check (
  actor_id = auth.uid()
  and organization_id = public.current_organization_id()
  and community_id = public.current_community_id()
  and (
    (
      action in ('task.complete', 'followup.confirm')
      and target_table = 'task_records'
      and exists (
        select 1 from public.task_records record
        where record.id = target_id and record.resident_id = auth.uid()
      )
    )
    or (
      action = 'points.exchange'
      and target_table = 'exchanges'
      and exists (
        select 1 from public.exchanges exchange
        where exchange.id = target_id and exchange.resident_id = auth.uid()
      )
    )
    or (
      action = 'group_message.send'
      and target_table = 'group_messages'
      and exists (
        select 1 from public.group_messages message
        where message.id = target_id and message.sender_id = auth.uid()
      )
    )
  )
);

comment on policy audit_logs_resident_action_insert on public.audit_logs is
  'Residents may audit only explicitly allowlisted actions against records they own.';
