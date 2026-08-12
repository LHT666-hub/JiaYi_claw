create or replace function public.review_clinical_brief(
  p_brief_id uuid,
  p_decision text
)
returns public.clinical_briefs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  caller public.profiles;
  brief public.clinical_briefs;
  request_row public.service_requests;
begin
  if p_decision not in ('reviewed', 'rejected') then
    raise exception 'INVALID_BRIEF_REVIEW_DECISION';
  end if;

  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null
    or caller.account_status <> 'active'
    or caller.role not in ('doctor', 'admin') then
    raise exception 'CLINICAL_REVIEWER_REQUIRED';
  end if;

  select * into brief from public.clinical_briefs where id = p_brief_id for update;
  if brief.id is null then raise exception 'CLINICAL_BRIEF_NOT_FOUND'; end if;

  select * into request_row from public.service_requests where id = brief.service_request_id;
  if request_row.id is null
    or not public.staff_can_access_tenant(request_row.organization_id, request_row.community_id) then
    raise exception 'BRIEF_SCOPE_FORBIDDEN';
  end if;

  if brief.human_review_status <> 'pending' and brief.human_review_status <> p_decision then
    raise exception 'BRIEF_REVIEW_ALREADY_FINAL';
  end if;

  update public.clinical_briefs
  set human_review_status = p_decision,
      reviewed_by = caller.id,
      updated_at = now()
  where id = brief.id
  returning * into brief;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    caller.id,
    'clinical_brief.' || p_decision,
    'clinical_briefs',
    brief.id,
    jsonb_build_object('service_request_id', brief.service_request_id, 'resident_id', brief.resident_id)
  );

  return brief;
end;
$$;

revoke all on function public.review_clinical_brief(uuid, text) from public;
grant execute on function public.review_clinical_brief(uuid, text) to authenticated;
