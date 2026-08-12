begin;

create table if not exists public.service_drafts (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  draft_type text not null check (draft_type in ('appointment')),
  payload jsonb not null,
  policy_version text not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, resident_id, draft_type)
);

alter table public.service_drafts enable row level security;
revoke all on table public.service_drafts from anon, authenticated;

drop trigger if exists trg_service_drafts_updated_at on public.service_drafts;
create trigger trg_service_drafts_updated_at before update on public.service_drafts
for each row execute function public.set_updated_at();

create or replace function public.purge_service_drafts_after_consent_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'sensitive_health' and not new.granted then
    delete from public.service_drafts
    where created_by = new.user_id and resident_id = new.resident_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purge_service_drafts_after_consent_change on public.consents;
create trigger trg_purge_service_drafts_after_consent_change
after insert or update of granted on public.consents
for each row execute function public.purge_service_drafts_after_consent_change();

create or replace function public.purge_service_drafts_after_account_disable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.account_status is distinct from new.account_status and new.account_status = 'disabled' then
    delete from public.service_drafts
    where created_by = new.id or resident_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purge_service_drafts_after_account_disable on public.profiles;
create trigger trg_purge_service_drafts_after_account_disable
after update of account_status on public.profiles
for each row execute function public.purge_service_drafts_after_account_disable();

create or replace function public.save_service_draft(
  p_resident_id uuid,
  p_draft_type text,
  p_payload jsonb,
  p_policy_version text
)
returns public.service_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.service_drafts;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_draft_type <> 'appointment' then raise exception 'DRAFT_TYPE_UNSUPPORTED'; end if;
  if not public.is_related_to_resident(p_resident_id) then raise exception 'DRAFT_RESIDENT_FORBIDDEN'; end if;
  if not exists (
    select 1 from public.consents
    where user_id = auth.uid()
      and resident_id = p_resident_id
      and scope = 'sensitive_health'
      and policy_version = p_policy_version
      and granted
  ) then raise exception 'DRAFT_CONSENT_REQUIRED'; end if;

  insert into public.service_drafts (
    resident_id, created_by, draft_type, payload, policy_version, expires_at
  ) values (
    p_resident_id, auth.uid(), p_draft_type, p_payload, p_policy_version, now() + interval '30 days'
  )
  on conflict (created_by, resident_id, draft_type) do update set
    payload = excluded.payload,
    policy_version = excluded.policy_version,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning * into saved;

  insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(), 'service_draft.saved', 'service_drafts', saved.id,
    jsonb_build_object('residentId', p_resident_id, 'draftType', p_draft_type, 'expiresAt', saved.expires_at)
  );
  return saved;
end;
$$;

create or replace function public.load_service_draft(
  p_resident_id uuid,
  p_draft_type text,
  p_policy_version text
)
returns public.service_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.service_drafts;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_related_to_resident(p_resident_id) then raise exception 'DRAFT_RESIDENT_FORBIDDEN'; end if;
  if not exists (
    select 1 from public.consents
    where user_id = auth.uid()
      and resident_id = p_resident_id
      and scope = 'sensitive_health'
      and policy_version = p_policy_version
      and granted
  ) then raise exception 'DRAFT_CONSENT_REQUIRED'; end if;

  delete from public.service_drafts
  where created_by = auth.uid() and resident_id = p_resident_id
    and draft_type = p_draft_type and expires_at <= now();

  select * into saved from public.service_drafts
  where created_by = auth.uid() and resident_id = p_resident_id
    and draft_type = p_draft_type and policy_version = p_policy_version
  limit 1;
  return saved;
end;
$$;

create or replace function public.delete_service_draft(
  p_resident_id uuid,
  p_draft_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_related_to_resident(p_resident_id) then raise exception 'DRAFT_RESIDENT_FORBIDDEN'; end if;
  delete from public.service_drafts
  where created_by = auth.uid() and resident_id = p_resident_id and draft_type = p_draft_type
  returning id into removed_id;
  if removed_id is not null then
    insert into public.audit_logs (actor_id, action, target_table, target_id, detail)
    values (
      auth.uid(), 'service_draft.deleted', 'service_drafts', removed_id,
      jsonb_build_object('residentId', p_resident_id, 'draftType', p_draft_type)
    );
  end if;
  return removed_id is not null;
end;
$$;

revoke all on function public.save_service_draft(uuid, text, jsonb, text) from public, anon;
revoke all on function public.load_service_draft(uuid, text, text) from public, anon;
revoke all on function public.delete_service_draft(uuid, text) from public, anon;
grant execute on function public.save_service_draft(uuid, text, jsonb, text) to authenticated;
grant execute on function public.load_service_draft(uuid, text, text) to authenticated;
grant execute on function public.delete_service_draft(uuid, text) to authenticated;

comment on table public.service_drafts is
  'Explicitly saved, user-controlled service form drafts. No draft is created without a user action.';

commit;
