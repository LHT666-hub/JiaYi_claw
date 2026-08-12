create or replace function public.transition_service_request(
  p_request_id uuid,
  p_action text,
  p_note text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.service_requests;
  actor_role text;
  target_status text;
  old_status_value text;
  previous_assigned_to uuid;
  allowed boolean := false;
  notify_recipient uuid;
begin
  select * into req from public.service_requests where id = p_request_id for update;
  if req.id is null then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  old_status_value := req.status;
  previous_assigned_to := req.assigned_to;
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is null then raise exception 'UNAUTHENTICATED'; end if;

  if actor_role in ('resident','family') then
    allowed := public.is_related_to_resident(req.resident_id)
      and p_action in ('submit','confirm_booking','request_reschedule','cancel');
  else
    allowed := actor_role in ('doctor','nurse','pharmacist','community','admin')
      and public.staff_can_access_tenant(req.organization_id, req.community_id);
    if allowed and req.assigned_to is not null and req.assigned_to <> auth.uid() and actor_role <> 'admin' then
      raise exception 'SERVICE_ASSIGNED_TO_OTHER';
    end if;
  end if;
  if not allowed then raise exception 'SERVICE_ACTION_FORBIDDEN'; end if;

  target_status := case
    when req.status = 'draft' and p_action = 'submit' then 'submitted'
    when req.status = 'needs_info' and p_action = 'submit' then 'submitted'
    when req.status = 'submitted' and p_action = 'request_info' then 'needs_info'
    when req.status = 'submitted' and p_action = 'accept' then 'accepted'
    when req.status = 'accepted' and p_action = 'request_info' then 'needs_info'
    when req.status = 'accepted' and p_action = 'check_availability' then 'checking_availability'
    when req.status in ('checking_availability','waitlisted') and p_action = 'propose_slot' then 'awaiting_user_confirmation'
    when req.status = 'checking_availability' and p_action = 'waitlist' then 'waitlisted'
    when req.status in ('checking_availability','waitlisted') and p_action = 'fail' then 'failed'
    when req.status = 'awaiting_user_confirmation' and p_action = 'confirm_booking' then 'booked'
    when req.status = 'awaiting_user_confirmation' and p_action = 'request_reschedule' then 'checking_availability'
    when req.status = 'awaiting_user_confirmation' and p_action = 'request_info' then 'needs_info'
    when req.status = 'booked' and p_action = 'update_booking' then 'booked'
    when req.status = 'booked' and p_action = 'complete' then 'completed'
    when req.status not in ('failed','completed','cancelled') and p_action = 'cancel' then 'cancelled'
    else null
  end;
  if target_status is null then raise exception 'INVALID_SERVICE_TRANSITION:%:%', req.status, p_action; end if;

  if p_action = 'update_booking'
    and coalesce(nullif(trim(p_details ->> 'bookingReference'), ''), '') = ''
  then
    raise exception 'BOOKING_REFERENCE_REQUIRED';
  end if;

  update public.service_requests set
    status = target_status,
    assigned_to = case
      when actor_role in ('doctor','nurse','pharmacist','community','admin') and assigned_to is null then auth.uid()
      else assigned_to
    end,
    assigned_role = case
      when actor_role in ('doctor','nurse','pharmacist','community','admin') and assigned_to is null then actor_role
      else assigned_role
    end,
    updated_at = now()
  where id = req.id
  returning * into req;

  if actor_role in ('doctor','nurse','pharmacist','community','admin') and previous_assigned_to is null then
    update public.service_assignments set active = false where service_request_id = req.id and active;
    insert into public.service_assignments (
      service_request_id, assigned_role, assigned_to, assigned_by, active
    ) values (req.id, actor_role, auth.uid(), auth.uid(), true);
  end if;

  if target_status in ('failed','completed','cancelled') then
    update public.service_assignments set active = false where service_request_id = req.id and active;
  end if;

  if p_action in ('propose_slot','confirm_booking','update_booking') then
    insert into public.appointment_details (
      service_request_id,
      target,
      scheduled_at,
      institution_name,
      department_name,
      clinician_name,
      booking_reference,
      updated_at
    ) values (
      req.id,
      coalesce(nullif(trim(p_details ->> 'institutionName'), ''), req.title),
      (p_details ->> 'scheduledAt')::timestamptz,
      nullif(trim(p_details ->> 'institutionName'), ''),
      nullif(trim(p_details ->> 'departmentName'), ''),
      nullif(trim(p_details ->> 'clinicianName'), ''),
      nullif(trim(p_details ->> 'bookingReference'), ''),
      now()
    )
    on conflict (service_request_id) do update set
      scheduled_at = coalesce(excluded.scheduled_at, appointment_details.scheduled_at),
      institution_name = coalesce(excluded.institution_name, appointment_details.institution_name),
      department_name = coalesce(excluded.department_name, appointment_details.department_name),
      clinician_name = coalesce(excluded.clinician_name, appointment_details.clinician_name),
      booking_reference = coalesce(excluded.booking_reference, appointment_details.booking_reference),
      updated_at = now();
  end if;

  insert into public.service_request_events (
    service_request_id, actor_id, action, old_status, new_status, note, metadata
  ) values (req.id, auth.uid(), p_action, old_status_value, target_status, p_note, p_details);

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(),
    'service_request.' || p_action,
    'service_requests',
    req.id,
    jsonb_build_object('newStatus', target_status, 'assignedTo', req.assigned_to)
  );

  notify_recipient := case
    when actor_role in ('resident','family') then req.assigned_to
    else req.requested_by
  end;
  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, recipient_id, payload
  ) values (
    'service_request.status_changed',
    'service_request',
    req.id,
    notify_recipient,
    jsonb_build_object(
      'requestId', req.id,
      'status', target_status,
      'note', p_note,
      'actorRole', actor_role
    )
  );
  return req;
end;
$$;

revoke all on function public.transition_service_request(uuid, text, text, jsonb) from public, anon;
grant execute on function public.transition_service_request(uuid, text, text, jsonb) to authenticated;

comment on function public.transition_service_request(uuid, text, text, jsonb) is
  'Transitions service requests and allows staff to append a verified booking receipt after resident confirmation.';
