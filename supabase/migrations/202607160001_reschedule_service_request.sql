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
  allowed boolean := false;
begin
  select * into req from public.service_requests where id = p_request_id for update;
  if req.id is null then raise exception 'SERVICE_REQUEST_NOT_FOUND'; end if;
  old_status_value := req.status;
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role is null then raise exception 'UNAUTHENTICATED'; end if;

  if actor_role in ('resident','family') then
    allowed := public.is_related_to_resident(req.resident_id)
      and p_action in ('submit','confirm_booking','request_reschedule','cancel');
  else
    allowed := actor_role in ('doctor','nurse','pharmacist','community','admin')
      and public.staff_can_access_tenant(req.organization_id, req.community_id);
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
    when req.status = 'booked' and p_action = 'complete' then 'completed'
    when req.status not in ('failed','completed','cancelled') and p_action = 'cancel' then 'cancelled'
    else null
  end;
  if target_status is null then raise exception 'INVALID_SERVICE_TRANSITION:%:%', req.status, p_action; end if;

  update public.service_requests set status = target_status where id = req.id returning * into req;

  if p_action in ('propose_slot','confirm_booking') then
    update public.appointment_details set
      scheduled_at = coalesce((p_details ->> 'scheduledAt')::timestamptz, scheduled_at),
      institution_name = coalesce(p_details ->> 'institutionName', institution_name),
      department_name = coalesce(p_details ->> 'departmentName', department_name),
      clinician_name = coalesce(p_details ->> 'clinicianName', clinician_name),
      booking_reference = coalesce(p_details ->> 'bookingReference', booking_reference),
      updated_at = now()
    where service_request_id = req.id;
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
    jsonb_build_object('newStatus', target_status)
  );

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, recipient_id, payload
  ) values (
    'service_request.status_changed',
    'service_request',
    req.id,
    req.requested_by,
    jsonb_build_object(
      'requestId', req.id,
      'status', target_status,
      'note', p_note
    )
  );
  return req;
end;
$$;

grant execute on function public.transition_service_request(uuid, text, text, jsonb) to authenticated;
