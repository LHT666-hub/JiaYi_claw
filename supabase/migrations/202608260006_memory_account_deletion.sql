-- Extend begin_due_account_deletion to also purge resident_memories and
-- resident_preferences when an account is deleted.

begin;

-- Replace the existing function with one that also cleans up memory tables.
-- The original function is in 202607180001_release_compliance.sql.
create or replace function public.begin_due_account_deletion(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deletion_request public.account_deletion_requests%rowtype;
  target_user_id uuid;
  v_memories_deleted int;
  v_preferences_deleted int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  select * into deletion_request from public.account_deletion_requests
  where id = p_request_id and status in ('pending','failed') and scheduled_for <= now()
  for update;
  if not found then raise exception 'DELETION_NOT_DUE'; end if;
  target_user_id := deletion_request.user_id;
  if target_user_id is null then raise exception 'DELETION_USER_MISSING'; end if;

  update public.account_deletion_requests set status = 'processing', updated_at = now(), processor_note = null
  where id = p_request_id;

  delete from public.health_observations where resident_id = target_user_id or recorded_by = target_user_id;
  delete from public.clinical_briefs where resident_id = target_user_id;
  delete from public.intake_sessions where resident_id = target_user_id or created_by = target_user_id;
  delete from public.resident_fact_candidates where resident_id = target_user_id;
  delete from public.resident_care_bindings where resident_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.consents where user_id = target_user_id or resident_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.wechat_identities where user_id = target_user_id;
  delete from public.family_link_codes where resident_id = target_user_id or used_by = target_user_id;
  delete from public.resident_profiles where user_id = target_user_id;
  delete from public.ask_logs where user_id = target_user_id;
  delete from public.doctor_todos where resident_id = target_user_id;
  delete from public.contacts where resident_id = target_user_id or contact_user_id = target_user_id;
  delete from public.task_records where resident_id = target_user_id;
  delete from public.points_ledger where resident_id = target_user_id;
  delete from public.exchanges where resident_id = target_user_id;
  delete from public.course_views where resident_id = target_user_id;
  delete from public.leader_matches where resident_id = target_user_id;
  delete from public.group_messages where sender_id = target_user_id;

  -- Memory system cleanup (count before delete for audit)
  select count(*) into v_memories_deleted from public.resident_memories where resident_id = target_user_id;
  select count(*) into v_preferences_deleted from public.resident_preferences where resident_id = target_user_id;
  delete from public.resident_memories where resident_id = target_user_id;
  delete from public.resident_preferences where resident_id = target_user_id;

  update public.family_bindings set status = 'disabled', note = null, updated_at = now()
    where resident_id = target_user_id or family_id = target_user_id;
  update public.channel_members set resident_id = null, display_name = null, binding_status = 'revoked', bound_at = null, updated_at = now()
    where resident_id = target_user_id;
  update public.skill_runs set user_id = null, resident_id = null, source_refs = '[]'::jsonb, metadata = '{}'::jsonb
    where user_id = target_user_id or resident_id = target_user_id;
  update public.service_requests set title = '已注销账号服务记录', summary = '原始内容已按注销申请删除', payload = '{}'::jsonb
    where resident_id = target_user_id or requested_by = target_user_id;
  update public.service_request_events set note = null, metadata = '{}'::jsonb
    where service_request_id in (select id from public.service_requests where resident_id = target_user_id or requested_by = target_user_id);
  update public.appointment_details set
    preferred_doctor = null, preferred_dates = '{}', preferred_time = null, contact_phone = null,
    booking_reference = null, arrival_instructions = null, updated_at = now()
    where service_request_id in (select id from public.service_requests where resident_id = target_user_id or requested_by = target_user_id);
  delete from public.outbox_events where recipient_id = target_user_id;

  update public.profiles set
    display_name = '已注销用户', phone = null, avatar_url = null,
    account_status = 'disabled', onboarding_completed_at = null, updated_at = now()
  where id = target_user_id;

  insert into public.audit_logs(actor_id, action, target_table, target_id, detail)
  values (null, 'account_deletion_processing', 'account_deletion_requests', p_request_id,
    jsonb_build_object(
      'userIdHash', encode(extensions.digest(target_user_id::text, 'sha256'), 'hex'),
      'memoriesDeleted', v_memories_deleted,
      'preferencesDeleted', v_preferences_deleted
    ));
  return target_user_id;
end;
$$;

revoke all on function public.begin_due_account_deletion(uuid) from public;
grant execute on function public.begin_due_account_deletion(uuid) to service_role;

commit;
