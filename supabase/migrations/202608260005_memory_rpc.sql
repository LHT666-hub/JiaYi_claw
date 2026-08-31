-- Memory system RPC functions. All mutations go through security-definer
-- functions; no direct client writes are permitted on memory tables.

begin;

-- 1. save_memory_candidate
-- Checks consent, deduplicates by content hash, and inserts a pending memory.
create or replace function public.save_memory_candidate(
  p_resident_id uuid,
  p_organization_id uuid,
  p_memory_type text,
  p_content jsonb,
  p_confidence numeric default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_evidence_level text default 'self_reported',
  p_occurred_at timestamptz default null,
  p_deduplication_key text default null
)
returns public.resident_memories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  saved public.resident_memories;
  content_hash text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_related_to_resident(p_resident_id)
     and not public.can_staff_access_profile(p_resident_id) then
    raise exception 'MEMORY_RESIDENT_FORBIDDEN';
  end if;

  -- Verify memory_storage consent exists and is granted.
  if not exists (
    select 1 from public.consents
    where resident_id = p_resident_id
      and scope = 'memory_storage'
      and granted
  ) then raise exception 'MEMORY_CONSENT_REQUIRED'; end if;

  -- Deduplication: skip if identical content already exists for this resident.
  -- Use full content hash (not truncated summary) to avoid false deduplication.
  content_hash := md5(p_content::text);
  if exists (
    select 1 from public.resident_memories
    where resident_id = p_resident_id
      and memory_type = p_memory_type
      and is_active = true
      and md5(content::text) = content_hash
  ) then
    select * into saved from public.resident_memories
    where resident_id = p_resident_id
      and memory_type = p_memory_type
      and is_active = true
      and md5(content::text) = content_hash
    limit 1;
    return saved;
  end if;

  insert into public.resident_memories (
    organization_id, resident_id, memory_type, content, confidence,
    source_type, source_id, evidence_level, occurred_at,
    confirmation_status, created_by
  ) values (
    p_organization_id, p_resident_id, p_memory_type, p_content, p_confidence,
    p_source_type, p_source_id, p_evidence_level, p_occurred_at,
    'pending', auth.uid()
  ) returning * into saved;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'memory_candidate.saved', 'resident_memories', saved.id,
    jsonb_build_object('memoryType', p_memory_type, 'residentId', p_resident_id)
  );
  return saved;
end;
$$;

-- 2. confirm_memory_candidate
-- Confirms a pending memory. For preference types, supersedes conflicting active
-- records; for factual types (symptom_report, etc.) simply adds without superseding.
-- Identity is derived from auth.uid() to prevent caller-specified spoofing.
create or replace function public.confirm_memory_candidate(
  p_candidate_id uuid
)
returns public.resident_memories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate public.resident_memories;
  caller public.profiles;
  new_status text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then raise exception 'PROFILE_NOT_FOUND'; end if;

  select * into candidate from public.resident_memories
  where id = p_candidate_id for update;
  if candidate.id is null then raise exception 'MEMORY_NOT_FOUND'; end if;
  if candidate.confirmation_status not in ('pending') then
    raise exception 'MEMORY_ALREADY_REVIEWED';
  end if;

  -- Determine confirmation status based on caller role.
  if caller.role in ('doctor','nurse','pharmacist','admin') then
    if not public.can_staff_access_profile(candidate.resident_id) then
      raise exception 'MEMORY_STAFF_FORBIDDEN';
    end if;
    new_status := 'staff_confirmed';
  elsif caller.id = candidate.resident_id
        or public.is_related_to_resident(candidate.resident_id) then
    new_status := 'user_confirmed';
  else
    raise exception 'MEMORY_CONFIRM_FORBIDDEN';
  end if;

  -- Supersede existing active memories only for preference types (mutually exclusive).
  -- For factual memory types (symptom_report, medication_statement, daily_living, etc.)
  -- a resident may have multiple true facts, so we do NOT supersede.
  if candidate.memory_type in ('preferred_channel','preferred_interaction',
      'large_text','quiet_hours','preferred_visit_period','care_preference') then
    update public.resident_memories
    set is_active = false,
        supersedes_id = candidate.id,
        valid_to = now(),
        updated_at = now()
    where resident_id = candidate.resident_id
      and memory_type = candidate.memory_type
      and is_active = true
      and id <> candidate.id;
  end if;

  update public.resident_memories
  set confirmation_status = new_status,
      confirmed_by = auth.uid(),
      last_verified_at = now(),
      updated_at = now()
  where id = p_candidate_id
  returning * into candidate;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'memory_candidate.confirmed', 'resident_memories', candidate.id,
    jsonb_build_object('memoryType', candidate.memory_type, 'status', new_status,
      'residentId', candidate.resident_id)
  );
  return candidate;
end;
$$;

-- 3. reject_memory_candidate
-- Identity is derived from auth.uid() to prevent caller-specified spoofing.
create or replace function public.reject_memory_candidate(
  p_candidate_id uuid
)
returns public.resident_memories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate public.resident_memories;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into candidate from public.resident_memories
  where id = p_candidate_id for update;
  if candidate.id is null then raise exception 'MEMORY_NOT_FOUND'; end if;
  if candidate.confirmation_status <> 'pending' then
    raise exception 'MEMORY_ALREADY_REVIEWED';
  end if;

  -- Only staff or the resident themselves may reject.
  if not (
    public.can_staff_access_profile(candidate.resident_id)
    or public.is_related_to_resident(candidate.resident_id)
  ) then
    raise exception 'MEMORY_REJECT_FORBIDDEN';
  end if;

  update public.resident_memories
  set confirmation_status = 'rejected',
      confirmed_by = auth.uid(),
      is_active = false,
      updated_at = now()
  where id = p_candidate_id
  returning * into candidate;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'memory_candidate.rejected', 'resident_memories', candidate.id,
    jsonb_build_object('memoryType', candidate.memory_type, 'residentId', candidate.resident_id)
  );
  return candidate;
end;
$$;

-- 4. revoke_memory — soft-delete by deactivating.
-- Identity is derived from auth.uid() to prevent caller-specified spoofing.
create or replace function public.revoke_memory(
  p_memory_id uuid
)
returns public.resident_memories
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  memory_row public.resident_memories;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into memory_row from public.resident_memories
  where id = p_memory_id for update;
  if memory_row.id is null then raise exception 'MEMORY_NOT_FOUND'; end if;

  if not (
    public.can_staff_access_profile(memory_row.resident_id)
    or public.is_related_to_resident(memory_row.resident_id)
  ) then
    raise exception 'MEMORY_REVOKE_FORBIDDEN';
  end if;

  update public.resident_memories
  set is_active = false,
      valid_to = now(),
      updated_at = now()
  where id = p_memory_id
  returning * into memory_row;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'memory.revoked', 'resident_memories', memory_row.id,
    jsonb_build_object('memoryType', memory_row.memory_type, 'residentId', memory_row.resident_id)
  );
  return memory_row;
end;
$$;

-- 5. delete_memory — purge sensitive content, keep audit metadata only.
-- Identity is derived from auth.uid() to prevent caller-specified spoofing.
create or replace function public.delete_memory(
  p_memory_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  memory_row public.resident_memories;
  deleted_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into memory_row from public.resident_memories
  where id = p_memory_id for update;
  if memory_row.id is null then raise exception 'MEMORY_NOT_FOUND'; end if;

  if not (
    public.is_admin()
    or public.is_related_to_resident(memory_row.resident_id)
  ) then
    raise exception 'MEMORY_DELETE_FORBIDDEN';
  end if;

  -- Redact content but keep the row for audit trail.
  update public.resident_memories
  set content = '{}'::jsonb,
      is_active = false,
      valid_to = now(),
      updated_at = now()
  where id = p_memory_id
  returning id into deleted_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'memory.deleted', 'resident_memories', deleted_id,
    jsonb_build_object('memoryType', memory_row.memory_type,
      'residentId', memory_row.resident_id, 'contentRedacted', true)
  );
  return deleted_id is not null;
end;
$$;

-- 6. get_memory_context — returns active confirmed memories + preferences
--    for a resident, ordered by confidence, within a token budget.
create or replace function public.get_memory_context(
  p_resident_id uuid,
  p_max_tokens int default 2000
)
returns table (
  kind text,
  record_id uuid,
  record_type text,
  content jsonb,
  confidence numeric,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_max_chars int;
  v_row record;
  v_total_chars int := 0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not (
    public.is_related_to_resident(p_resident_id)
    or public.can_staff_access_profile(p_resident_id)
  ) then
    raise exception 'MEMORY_READ_FORBIDDEN';
  end if;

  -- Approximate CJK-aware character budget (~4 chars per token).
  v_max_chars := p_max_tokens * 4;

  -- Return active confirmed memories first (highest confidence first).
  for v_row in
    select
      'memory'::text as row_kind, m.id as row_id, m.memory_type as row_type,
      m.content as row_content, m.confidence as row_confidence, m.occurred_at as row_occurred_at,
      char_length(m.content::text) as content_len
    from public.resident_memories m
    where m.resident_id = p_resident_id
      and m.is_active = true
      and m.confirmation_status in ('user_confirmed','staff_confirmed')
      and (m.expires_at is null or m.expires_at > now())
    order by m.confidence desc nulls last, m.occurred_at desc nulls last
  loop
    if v_total_chars + v_row.content_len > v_max_chars then exit; end if;
    v_total_chars := v_total_chars + v_row.content_len;
    kind := v_row.row_kind;
    record_id := v_row.row_id;
    record_type := v_row.row_type;
    content := v_row.row_content;
    confidence := v_row.row_confidence;
    occurred_at := v_row.row_occurred_at;
    return next;
  end loop;

  -- Then active confirmed preferences.
  for v_row in
    select
      'preference'::text as row_kind, p.id as row_id, p.preference_type as row_type,
      p.structured_value as row_content, null::numeric as row_confidence,
      null::timestamptz as row_occurred_at,
      char_length(p.structured_value::text) as content_len
    from public.resident_preferences p
    where p.resident_id = p_resident_id
      and p.status = 'active'
      and p.confirmation_status in ('user_confirmed','staff_confirmed')
      and (p.valid_to is null or p.valid_to > now())
    order by p.created_at desc
  loop
    if v_total_chars + v_row.content_len > v_max_chars then exit; end if;
    v_total_chars := v_total_chars + v_row.content_len;
    kind := v_row.row_kind;
    record_id := v_row.row_id;
    record_type := v_row.row_type;
    content := v_row.row_content;
    confidence := null::numeric;
    occurred_at := null::timestamptz;
    return next;
  end loop;
end;
$$;

-- 7. update_preference — supersede an existing preference with a new value.
-- Prevents direct client writes to resident_preferences; all mutations go
-- through this security-definer function with permission checks and audit.
create or replace function public.update_preference(
  p_preference_id uuid,
  p_structured_value jsonb
)
returns public.resident_preferences
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing public.resident_preferences;
  new_preference public.resident_preferences;
  v_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into existing from public.resident_preferences
  where id = p_preference_id and status = 'active'
  for update;
  if existing.id is null then raise exception 'PREFERENCE_NOT_FOUND'; end if;

  -- Permission: resident themselves or staff with care binding.
  if not (
    auth.uid() = existing.resident_id
    or public.can_staff_access_profile(existing.resident_id)
  ) then
    raise exception 'PREFERENCE_UPDATE_FORBIDDEN';
  end if;

  -- Resolve organization_id for the new row.
  select organization_id into v_organization_id
  from public.profiles where id = existing.resident_id;

  -- Insert a new version superseding the old one.
  insert into public.resident_preferences (
    organization_id, resident_id, preference_type, structured_value,
    source_type, confirmation_status, status, supersedes_id, created_by
  ) values (
    v_organization_id, existing.resident_id, existing.preference_type,
    p_structured_value, 'manual_update', 'pending', 'active',
    existing.id, auth.uid()
  ) returning * into new_preference;

  -- Mark the old preference as superseded.
  update public.resident_preferences
  set status = 'superseded', updated_at = now()
  where id = p_preference_id;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'preference.updated', 'resident_preferences', new_preference.id,
    jsonb_build_object('residentId', existing.resident_id,
      'preferenceType', existing.preference_type, 'supersededId', existing.id)
  );
  return new_preference;
end;
$$;

-- Grants
revoke all on function public.save_memory_candidate(uuid,uuid,text,jsonb,numeric,text,uuid,text,timestamptz,text) from public;
revoke all on function public.confirm_memory_candidate(uuid) from public;
revoke all on function public.reject_memory_candidate(uuid) from public;
revoke all on function public.revoke_memory(uuid) from public;
revoke all on function public.delete_memory(uuid) from public;
revoke all on function public.get_memory_context(uuid,int) from public;
revoke all on function public.update_preference(uuid,jsonb) from public;

grant execute on function public.save_memory_candidate(uuid,uuid,text,jsonb,numeric,text,uuid,text,timestamptz,text) to authenticated;
grant execute on function public.confirm_memory_candidate(uuid) to authenticated;
grant execute on function public.reject_memory_candidate(uuid) to authenticated;
grant execute on function public.revoke_memory(uuid) to authenticated;
grant execute on function public.delete_memory(uuid) to authenticated;
grant execute on function public.get_memory_context(uuid,int) to authenticated;
grant execute on function public.update_preference(uuid,jsonb) to authenticated;

comment on function public.save_memory_candidate is
  'Creates a pending memory row after consent and deduplication checks.';
comment on function public.confirm_memory_candidate is
  'Confirms a pending memory; supersedes older records only for preference types.';
comment on function public.reject_memory_candidate is
  'Rejects a pending memory and deactivates it.';
comment on function public.revoke_memory is
  'Soft-deletes an active memory by setting is_active = false.';
comment on function public.delete_memory is
  'Redacts memory content to {} while preserving the row for audit purposes.';
comment on function public.get_memory_context is
  'Returns active confirmed memories and preferences for a resident within a token budget.';
comment on function public.update_preference is
  'Supersedes an existing preference with a new value, with permission checks and audit logging.';

commit;
