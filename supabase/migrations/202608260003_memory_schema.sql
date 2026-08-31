-- Memory system core tables: resident_memories and resident_preferences.
-- Stores structured, confidence-weighted facts and preferences extracted
-- from resident interactions, with full lifecycle tracking.

begin;

create table if not exists public.resident_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  memory_type text not null check (memory_type in (
    'symptom_report','medication_statement','daily_living','care_preference',
    'health_experience','allergy_self_reported','lifestyle'
  )),
  content jsonb not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  source_type text check (source_type in ('fact_candidate','manual','assistant_extraction')),
  source_id uuid,
  confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending','user_confirmed','staff_confirmed','rejected')),
  evidence_level text not null default 'self_reported'
    check (evidence_level in (
      'self_reported','user_uploaded','staff_observed',
      'clinician_verified','system_imported','system_derived'
    )),
  occurred_at timestamptz,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  last_verified_at timestamptz,
  supersedes_id uuid references public.resident_memories(id),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resident_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  preference_type text not null check (preference_type in (
    'preferred_channel','preferred_interaction','large_text',
    'quiet_hours','preferred_visit_period','family_assistance'
  )),
  structured_value jsonb not null,
  source_type text,
  source_ref text,
  confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending','user_confirmed','staff_confirmed','rejected')),
  status text not null default 'active'
    check (status in ('active','superseded','revoked','expired')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  last_verified_at timestamptz,
  supersedes_id uuid references public.resident_preferences(id),
  created_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_resident_memories_org_resident
  on public.resident_memories (organization_id, resident_id, is_active);
create index if not exists idx_resident_memories_type
  on public.resident_memories (resident_id, memory_type, is_active);
create index if not exists idx_resident_memories_org_created
  on public.resident_memories (organization_id, created_at);
create index if not exists idx_resident_memories_supersedes
  on public.resident_memories (supersedes_id) where supersedes_id is not null;

create index if not exists idx_resident_preferences_org_resident
  on public.resident_preferences (organization_id, resident_id, status);
create index if not exists idx_resident_preferences_type
  on public.resident_preferences (resident_id, preference_type, status);
create index if not exists idx_resident_preferences_supersedes
  on public.resident_preferences (supersedes_id) where supersedes_id is not null;

-- Updated-at triggers
drop trigger if exists trg_resident_memories_updated_at on public.resident_memories;
create trigger trg_resident_memories_updated_at before update on public.resident_memories
for each row execute function public.set_updated_at();

drop trigger if exists trg_resident_preferences_updated_at on public.resident_preferences;
create trigger trg_resident_preferences_updated_at before update on public.resident_preferences
for each row execute function public.set_updated_at();

-- RLS
alter table public.resident_memories enable row level security;
alter table public.resident_preferences enable row level security;

-- Resident self-read: the resident themselves or an active family binding.
drop policy if exists "resident_memories_self_read" on public.resident_memories;
create policy "resident_memories_self_read" on public.resident_memories
for select to authenticated using (
  public.is_related_to_resident(resident_id)
);

-- Staff read: tenant-scoped access through can_staff_access_profile.
drop policy if exists "resident_memories_staff_read" on public.resident_memories;
create policy "resident_memories_staff_read" on public.resident_memories
for select to authenticated using (
  public.can_staff_access_profile(resident_id)
);

-- No client-side write; all mutations go through RPC.
revoke insert, update, delete on public.resident_memories from authenticated;
grant select on public.resident_memories to authenticated;

-- Resident self-read for preferences.
drop policy if exists "resident_preferences_self_read" on public.resident_preferences;
create policy "resident_preferences_self_read" on public.resident_preferences
for select to authenticated using (
  public.is_related_to_resident(resident_id)
);

-- Staff read for preferences.
drop policy if exists "resident_preferences_staff_read" on public.resident_preferences;
create policy "resident_preferences_staff_read" on public.resident_preferences
for select to authenticated using (
  public.can_staff_access_profile(resident_id)
);

revoke insert, update, delete on public.resident_preferences from authenticated;
grant select on public.resident_preferences to authenticated;

comment on table public.resident_memories is
  'Confidence-weighted, lifecycle-tracked health and daily-living facts about a resident.';
comment on table public.resident_preferences is
  'Resident interaction and care preferences with confirmation and versioning lifecycle.';

commit;
