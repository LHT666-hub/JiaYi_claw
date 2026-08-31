-- Extend consents.scope to include 'memory_storage' and 'memory_context'.
-- memory_storage: authorises the system to persist resident memories.
-- memory_context: authorises injecting confirmed memories into Agent prompts.
-- Also adds a trigger that deactivates resident_memories when the
-- memory_storage consent is revoked.

begin;

-- The original consents.scope CHECK constraint was created inline without an
-- explicit name. PostgreSQL auto-generated the name consents_scope_check.
alter table public.consents drop constraint if exists consents_scope_check;
alter table public.consents add constraint consents_scope_check check (scope in (
  'privacy','sensitive_health','family_delegate','ai_processing','notification','memory_storage','memory_context'
));

-- When a memory_storage consent is revoked, deactivate all resident_memories
-- and resident_preferences for that resident created under that consent.
create or replace function public.deactivate_memories_after_consent_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'memory_storage' and not new.granted then
    update public.resident_memories
    set is_active = false, updated_at = now()
    where resident_id = new.resident_id
      and confirmation_status <> 'rejected';

    update public.resident_preferences
    set status = 'revoked', updated_at = now()
    where resident_id = new.resident_id
      and confirmation_status <> 'rejected'
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deactivate_memories_after_consent_change on public.consents;
create trigger trg_deactivate_memories_after_consent_change
after insert or update of granted on public.consents
for each row execute function public.deactivate_memories_after_consent_change();

comment on function public.deactivate_memories_after_consent_change() is
  'Deactivates resident memories and preferences when memory_storage consent is revoked.';

commit;
