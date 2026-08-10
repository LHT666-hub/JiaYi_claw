begin;

-- Centralize staff-to-resident tenancy checks so every clinical table uses the
-- same organization and community boundary.
create or replace function public.can_staff_access_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles target
    where target.id = target_profile_id
      and public.staff_can_access_tenant(target.organization_id, target.community_id)
  )
$$;

revoke all on function public.can_staff_access_profile(uuid) from public;
grant execute on function public.can_staff_access_profile(uuid) to authenticated;

-- A workbench role alone must never make every care network readable.
create or replace function public.can_read_care_network(target_network_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.care_networks network
    where network.id = target_network_id
      and (
        public.staff_can_access_tenant(network.organization_id, network.community_id)
        or exists (
          select 1
          from public.resident_care_bindings binding
          where binding.care_network_id = network.id
            and binding.status = 'active'
            and public.is_related_to_resident(binding.resident_id)
        )
      )
  )
$$;

revoke all on function public.can_read_care_network(uuid) from public;
grant execute on function public.can_read_care_network(uuid) to authenticated;

-- Remove an older permissive admin policy. PostgreSQL combines policies with
-- OR, so leaving it in place would bypass the newer tenant-aware policy.
drop policy if exists "profiles self read" on public.profiles;

drop policy if exists "staff_invites_admin_manage" on public.staff_invites;
create policy "staff_invites_admin_manage" on public.staff_invites for all to authenticated
using (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and (public.current_community_id() is null or community_id is null or community_id = public.current_community_id())
)
with check (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and (public.current_community_id() is null or community_id is null or community_id = public.current_community_id())
);

drop policy if exists "service_catalog_read_active" on public.service_catalog;
create policy "service_catalog_read_active" on public.service_catalog for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (community_id is null or community_id = public.current_community_id())
  and (active or public.is_admin())
);

drop policy if exists "service_catalog_admin_manage" on public.service_catalog;
create policy "service_catalog_admin_manage" on public.service_catalog for all to authenticated
using (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and (public.current_community_id() is null or community_id is null or community_id = public.current_community_id())
)
with check (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and (public.current_community_id() is null or community_id is null or community_id = public.current_community_id())
);

drop policy if exists "service_requests_admin_update" on public.service_requests;
create policy "service_requests_admin_update" on public.service_requests for update to authenticated
using (public.is_admin() and public.staff_can_access_tenant(organization_id, community_id))
with check (public.is_admin() and public.staff_can_access_tenant(organization_id, community_id));

drop policy if exists "service_assignments_admin_manage" on public.service_assignments;
create policy "service_assignments_admin_manage" on public.service_assignments for all to authenticated
using (
  public.is_admin() and exists (
    select 1 from public.service_requests request
    where request.id = service_request_id
      and public.staff_can_access_tenant(request.organization_id, request.community_id)
  )
)
with check (
  public.is_admin() and exists (
    select 1 from public.service_requests request
    where request.id = service_request_id
      and public.staff_can_access_tenant(request.organization_id, request.community_id)
  )
);

drop policy if exists "public_info_admin_manage" on public.public_info_entries;
create policy "public_info_admin_manage" on public.public_info_entries for all to authenticated
using (public.is_admin() and public.staff_can_access_tenant(organization_id, community_id))
with check (public.is_admin() and public.staff_can_access_tenant(organization_id, community_id));

drop policy if exists "briefs_staff_manage" on public.clinical_briefs;
-- Clinical briefs are created by finalize_service_request_intake and reviewed
-- through server-side workflows. No authenticated client gets direct writes.

drop policy if exists "intake_manage_related" on public.intake_sessions;

drop policy if exists "skill_runs_staff_read" on public.skill_runs;
create policy "skill_runs_staff_read" on public.skill_runs for select to authenticated
using (
  user_id = auth.uid()
  or (resident_id is not null and public.can_staff_access_profile(resident_id))
);

drop policy if exists "skill_runs_insert_own" on public.skill_runs;
create policy "skill_runs_insert_own" on public.skill_runs for insert to authenticated
with check (
  user_id = auth.uid()
  and (resident_id is null or public.is_related_to_resident(resident_id))
);

drop policy if exists "family_bindings_select_admin" on public.family_bindings;
create policy "family_bindings_select_admin" on public.family_bindings for select to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id));

drop policy if exists "family_bindings_insert_admin" on public.family_bindings;
create policy "family_bindings_insert_admin" on public.family_bindings for insert to authenticated
with check (
  public.is_admin()
  and public.can_staff_access_profile(resident_id)
  and public.can_staff_access_profile(family_id)
);

drop policy if exists "family_bindings_update_admin" on public.family_bindings;
create policy "family_bindings_update_admin" on public.family_bindings for update to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (
  public.is_admin()
  and public.can_staff_access_profile(resident_id)
  and public.can_staff_access_profile(family_id)
);

drop policy if exists "network_institutions_read" on public.care_network_institutions;
create policy "network_institutions_read" on public.care_network_institutions for select to authenticated
using (public.can_read_care_network(care_network_id));

drop policy if exists "network_institutions_admin" on public.care_network_institutions;
create policy "network_institutions_admin" on public.care_network_institutions for all to authenticated
using (public.is_admin() and public.can_read_care_network(care_network_id))
with check (public.is_admin() and public.can_read_care_network(care_network_id));

drop policy if exists "departments_admin" on public.departments;
create policy "departments_admin" on public.departments for all to authenticated
using (
  public.is_admin() and exists (
    select 1 from public.institutions institution
    where institution.id = institution_id
      and institution.organization_id = public.current_organization_id()
  )
)
with check (
  public.is_admin() and exists (
    select 1 from public.institutions institution
    where institution.id = institution_id
      and institution.organization_id = public.current_organization_id()
  )
);

drop policy if exists "care_bindings_admin" on public.resident_care_bindings;
create policy "care_bindings_admin" on public.resident_care_bindings for all to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (
  public.is_admin()
  and public.can_staff_access_profile(resident_id)
  and exists (
    select 1 from public.care_networks network
    where network.id = care_network_id
      and public.staff_can_access_tenant(network.organization_id, network.community_id)
  )
);

drop policy if exists "content_reviews_staff" on public.content_reviews;
create policy "content_reviews_staff" on public.content_reviews for all to authenticated
using (
  exists (
    select 1 from public.content_items item
    where item.id = content_item_id
      and public.staff_can_access_tenant(item.organization_id, item.community_id)
  )
)
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.content_items item
    where item.id = content_item_id
      and public.staff_can_access_tenant(item.organization_id, item.community_id)
  )
);

drop policy if exists "ingestion_jobs_staff" on public.ingestion_jobs;
create policy "ingestion_jobs_staff" on public.ingestion_jobs for all to authenticated
using (
  exists (
    select 1 from public.content_sources source
    where source.id = source_id
      and public.staff_can_access_tenant(source.organization_id, source.community_id)
  )
)
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.content_sources source
    where source.id = source_id
      and public.staff_can_access_tenant(source.organization_id, source.community_id)
  )
);

drop policy if exists "channel_groups_staff" on public.channel_groups;
create policy "channel_groups_staff" on public.channel_groups for all to authenticated
using (
  exists (
    select 1 from public.channel_accounts account
    where account.id = channel_account_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
)
with check (
  exists (
    select 1 from public.channel_accounts account
    where account.id = channel_account_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
);

drop policy if exists "channel_members_staff" on public.channel_members;
create policy "channel_members_staff" on public.channel_members for all to authenticated
using (
  exists (
    select 1 from public.channel_accounts account
    where account.id = channel_account_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
)
with check (
  exists (
    select 1 from public.channel_accounts account
    where account.id = channel_account_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
);

drop policy if exists "fact_candidates_staff" on public.resident_fact_candidates;
create policy "fact_candidates_staff" on public.resident_fact_candidates for select to authenticated
using (
  exists (
    select 1
    from public.channel_messages message
    join public.channel_accounts account on account.id = message.channel_account_id
    where message.id = source_message_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
);

drop policy if exists "broadcasts_staff" on public.scheduled_broadcasts;
create policy "broadcasts_staff" on public.scheduled_broadcasts for all to authenticated
using (
  exists (
    select 1
    from public.channel_groups channel_group
    join public.channel_accounts account on account.id = channel_group.channel_account_id
    where channel_group.id = channel_group_id
      and account.organization_id = organization_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.channel_groups channel_group
    join public.channel_accounts account on account.id = channel_group.channel_account_id
    where channel_group.id = channel_group_id
      and account.organization_id = organization_id
      and public.staff_can_access_tenant(account.organization_id, account.community_id)
  )
);

-- The legacy in-app group table has no membership or tenant model. Keep it
-- private to the sender until its read-only migration is removed.
drop policy if exists "group messages read authed" on public.group_messages;
drop policy if exists "group messages write authed" on public.group_messages;
drop policy if exists "group_messages read authed" on public.group_messages;
drop policy if exists "group_messages write authed" on public.group_messages;
create policy "group_messages_owner_read" on public.group_messages for select to authenticated
using (sender_id = auth.uid());
create policy "group_messages_owner_insert" on public.group_messages for insert to authenticated
with check (sender_id = auth.uid());

drop policy if exists "doctor todos insert admin" on public.doctor_todos;
drop policy if exists "doctor todos read scoped" on public.doctor_todos;
drop policy if exists "doctor todos update scoped" on public.doctor_todos;
drop policy if exists "doctor_todos insert scoped" on public.doctor_todos;
drop policy if exists "doctor_todos read scoped" on public.doctor_todos;
drop policy if exists "doctor_todos update scoped" on public.doctor_todos;
drop policy if exists "doctor_todos_select_mvp" on public.doctor_todos;
create policy "doctor_todos_select_mvp" on public.doctor_todos for select to authenticated
using (
  public.is_related_to_resident(resident_id)
  or (public.can_staff_access_profile(resident_id) and (assigned_to = auth.uid() or assigned_to is null or public.is_admin()))
);

drop policy if exists "doctor_todos_insert_authenticated" on public.doctor_todos;
create policy "doctor_todos_insert_authenticated" on public.doctor_todos for insert to authenticated
with check (
  public.can_staff_access_profile(resident_id)
  and (assigned_to is null or public.can_staff_access_profile(assigned_to))
);

drop policy if exists "doctor_todos_update_mvp" on public.doctor_todos;
create policy "doctor_todos_update_mvp" on public.doctor_todos for update to authenticated
using (
  public.can_staff_access_profile(resident_id)
  and (assigned_to = auth.uid() or (assigned_to is null and public.is_workbench_role()) or public.is_admin())
)
with check (
  public.can_staff_access_profile(resident_id)
  and (assigned_to is null or public.can_staff_access_profile(assigned_to))
);

-- Scope the remaining read-only legacy resident tables while they are being
-- migrated to service_requests and the current health model.
drop policy if exists "resident profiles read" on public.resident_profiles;
drop policy if exists "resident profiles manage admin" on public.resident_profiles;
create policy "resident_profiles_read_scoped" on public.resident_profiles for select to authenticated
using (public.is_related_to_resident(user_id) or public.can_staff_access_profile(user_id));
create policy "resident_profiles_admin_manage_scoped" on public.resident_profiles for all to authenticated
using (public.is_admin() and public.can_staff_access_profile(user_id))
with check (public.is_admin() and public.can_staff_access_profile(user_id));

drop policy if exists "contacts admin manage" on public.contacts;
drop policy if exists "contacts manage admin" on public.contacts;
drop policy if exists "contacts read" on public.contacts;
drop policy if exists "contacts scoped read" on public.contacts;
drop policy if exists "contacts_admin_delete" on public.contacts;
drop policy if exists "contacts_admin_insert" on public.contacts;
drop policy if exists "contacts_admin_update" on public.contacts;
drop policy if exists "contacts_resident_read" on public.contacts;
create policy "contacts_read_scoped" on public.contacts for select to authenticated
using (
  public.is_related_to_resident(resident_id)
  or contact_user_id = auth.uid()
  or public.can_staff_access_profile(resident_id)
);
create policy "contacts_admin_manage_scoped" on public.contacts for all to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (public.is_admin() and public.can_staff_access_profile(resident_id));

drop policy if exists "task records insert resident" on public.task_records;
drop policy if exists "task records read scoped" on public.task_records;
drop policy if exists "task_records resident insert" on public.task_records;
drop policy if exists "task_records scoped read" on public.task_records;
drop policy if exists "task_records_admin_update" on public.task_records;
drop policy if exists "task_records_insert_own_or_admin" on public.task_records;
drop policy if exists "task_records_select_own_or_admin" on public.task_records;
create policy "task_records_read_scoped" on public.task_records for select to authenticated
using (public.is_related_to_resident(resident_id) or public.can_staff_access_profile(resident_id));
create policy "task_records_insert_scoped" on public.task_records for insert to authenticated
with check (resident_id = auth.uid() or (public.is_admin() and public.can_staff_access_profile(resident_id)));
create policy "task_records_update_scoped" on public.task_records for update to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (public.is_admin() and public.can_staff_access_profile(resident_id));

drop policy if exists "points ledger insert resident" on public.points_ledger;
drop policy if exists "points ledger read scoped" on public.points_ledger;
drop policy if exists "points_ledger resident insert" on public.points_ledger;
drop policy if exists "points_ledger scoped read" on public.points_ledger;
drop policy if exists "points_ledger_admin_update" on public.points_ledger;
drop policy if exists "points_ledger_insert_own_or_admin" on public.points_ledger;
drop policy if exists "points_ledger_select_own_or_admin" on public.points_ledger;
create policy "points_ledger_read_scoped" on public.points_ledger for select to authenticated
using (public.is_related_to_resident(resident_id) or public.can_staff_access_profile(resident_id));
create policy "points_ledger_insert_scoped" on public.points_ledger for insert to authenticated
with check (resident_id = auth.uid() or (public.is_admin() and public.can_staff_access_profile(resident_id)));
create policy "points_ledger_update_scoped" on public.points_ledger for update to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (public.is_admin() and public.can_staff_access_profile(resident_id));

drop policy if exists "exchanges resident insert" on public.exchanges;
drop policy if exists "exchanges scoped read" on public.exchanges;
drop policy if exists "exchanges_admin_update" on public.exchanges;
drop policy if exists "exchanges_insert_own_or_admin" on public.exchanges;
drop policy if exists "exchanges_select_own_or_admin" on public.exchanges;
create policy "exchanges_read_scoped" on public.exchanges for select to authenticated
using (public.is_related_to_resident(resident_id) or public.can_staff_access_profile(resident_id));
create policy "exchanges_insert_scoped" on public.exchanges for insert to authenticated
with check (resident_id = auth.uid() or (public.is_admin() and public.can_staff_access_profile(resident_id)));
create policy "exchanges_update_scoped" on public.exchanges for update to authenticated
using (public.is_admin() and public.can_staff_access_profile(resident_id))
with check (public.is_admin() and public.can_staff_access_profile(resident_id));

drop policy if exists "todo_status_events_select_scoped" on public.todo_status_events;
create policy "todo_status_events_select_scoped" on public.todo_status_events for select to authenticated
using (
  exists (
    select 1 from public.doctor_todos todo
    where todo.id = todo_id
      and (
        public.is_related_to_resident(todo.resident_id)
        or (public.can_staff_access_profile(todo.resident_id) and (todo.assigned_to = auth.uid() or todo.assigned_to is null or public.is_admin()))
      )
  )
);
drop policy if exists "todo_status_events_insert_scoped" on public.todo_status_events;
create policy "todo_status_events_insert_scoped" on public.todo_status_events for insert to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.doctor_todos todo
    where todo.id = todo_id
      and public.can_staff_access_profile(todo.resident_id)
      and (todo.assigned_to = auth.uid() or todo.assigned_to is null or public.is_admin())
  )
);

-- Audit rows inherit the actor's tenant. Direct client-side log fabrication is
-- no longer permitted; audited RPCs and server/service-role code still write.
alter table public.audit_logs add column if not exists organization_id uuid references public.organizations(id);
alter table public.audit_logs add column if not exists community_id uuid references public.communities(id);

update public.audit_logs log
set organization_id = profile.organization_id,
    community_id = profile.community_id
from public.profiles profile
where profile.id = log.actor_id
  and log.organization_id is null;

create or replace function public.set_audit_log_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_profile public.profiles;
begin
  if new.actor_id is null then
    new.actor_id := auth.uid();
  end if;

  if new.actor_id is not null then
    select * into actor_profile from public.profiles where id = new.actor_id;
    if actor_profile.id is not null then
      if new.organization_id is not null and new.organization_id is distinct from actor_profile.organization_id then
        raise exception 'AUDIT_TENANT_MISMATCH';
      end if;
      new.organization_id := actor_profile.organization_id;
      new.community_id := actor_profile.community_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_logs_tenant on public.audit_logs;
create trigger trg_audit_logs_tenant before insert on public.audit_logs
for each row execute function public.set_audit_log_tenant();

drop policy if exists "audit logs admin read" on public.audit_logs;
drop policy if exists "audit logs admin write" on public.audit_logs;
drop policy if exists "audit_logs admin read" on public.audit_logs;
drop policy if exists "audit_logs scoped insert" on public.audit_logs;
create policy "audit_logs_admin_read_scoped" on public.audit_logs for select to authenticated
using (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and (public.current_community_id() is null or community_id is null or community_id = public.current_community_id())
);

commit;
