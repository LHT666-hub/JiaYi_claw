-- V2.5 Phase 1: contacts, courses, course_views, group_leaders, leader_matches
-- This migration adds tables for contacts, courses/views, and group leader matching.
-- Assumes 202605050001_profiles_auth.sql has been applied (profiles table exists).

-- ─── helpers (idempotent) ───────────────────────────────────────────
-- set_updated_at trigger function may already exist from earlier migrations.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- current_app_role helper (may already exist)
create or replace function public.current_app_role()
returns text language sql stable security definer as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'anonymous'
  );
$$;

-- is_admin helper (may already exist)
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select current_app_role() = 'admin';
$$;

-- ─── 1. contacts ────────────────────────────────────────────────────
-- This table may already exist from 001_initial_schema.sql.
-- We use CREATE TABLE IF NOT EXISTS and add missing columns if needed.
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid references public.profiles(id),
  name        text not null,
  role_label  text not null,
  group_type  text not null check (group_type in ('doctorTeam','family','community')),
  description text,
  available_time text,
  avatar_url  text,
  sort_order  int default 0,
  is_primary  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Add is_primary column if it doesn't exist (contacts table may be from earlier migration)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts' and column_name = 'is_primary'
  ) then
    alter table public.contacts add column is_primary boolean default false;
  end if;
end $$;

-- updated_at trigger
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- indexes
create index if not exists idx_contacts_resident on public.contacts(resident_id);
create index if not exists idx_contacts_contact_user on public.contacts(contact_user_id);

-- RLS
alter table public.contacts enable row level security;

drop policy if exists "contacts_resident_read" on public.contacts;
create policy "contacts_resident_read" on public.contacts
  for select using (
    resident_id = auth.uid()
    or contact_user_id = auth.uid()
    or is_admin()
  );

drop policy if exists "contacts_admin_insert" on public.contacts;
create policy "contacts_admin_insert" on public.contacts
  for insert with check (is_admin());

drop policy if exists "contacts_admin_update" on public.contacts;
create policy "contacts_admin_update" on public.contacts
  for update using (is_admin());

drop policy if exists "contacts_admin_delete" on public.contacts;
create policy "contacts_admin_delete" on public.contacts
  for delete using (is_admin());

-- ─── 2. courses ─────────────────────────────────────────────────────
-- Courses table may already exist from earlier migration; add new columns.
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,
  audience    text,
  summary     text,
  duration    text,
  points      int default 0,
  video_url   text,
  status      text not null default 'published'
                check (status in ('draft','review','published','disabled')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Add status column if missing (older schema used is_active boolean)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'status'
  ) then
    alter table public.courses add column status text not null default 'published'
      check (status in ('draft','review','published','disabled'));
    -- Migrate is_active to status if is_active exists
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'courses' and column_name = 'is_active'
    ) then
      update public.courses set status = case when is_active then 'published' else 'disabled' end;
    end if;
  end if;
end $$;

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create index if not exists idx_courses_status on public.courses(status);

alter table public.courses enable row level security;

drop policy if exists "courses_read_published" on public.courses;
create policy "courses_read_published" on public.courses
  for select using (
    status = 'published'
    or is_admin()
  );

drop policy if exists "courses_admin_insert" on public.courses;
create policy "courses_admin_insert" on public.courses
  for insert with check (is_admin());

drop policy if exists "courses_admin_update" on public.courses;
create policy "courses_admin_update" on public.courses
  for update using (is_admin());

-- ─── 3. course_views ────────────────────────────────────────────────
create table if not exists public.course_views (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  viewed_at       timestamptz default now(),
  points_awarded  int default 0
);

create index if not exists idx_course_views_resident on public.course_views(resident_id);
create index if not exists idx_course_views_course  on public.course_views(course_id);

-- Unique constraint: one points-earning view per resident per course per day
-- We use a partial unique index based on the date
create unique index if not exists idx_course_views_daily_unique
  on public.course_views (resident_id, course_id, ((viewed_at at time zone 'UTC')::date));

alter table public.course_views enable row level security;

drop policy if exists "course_views_resident_read" on public.course_views;
create policy "course_views_resident_read" on public.course_views
  for select using (
    resident_id = auth.uid()
    or is_admin()
  );

drop policy if exists "course_views_insert" on public.course_views;
create policy "course_views_insert" on public.course_views
  for insert with check (
    resident_id = auth.uid()
    or is_admin()
  );

-- ─── 4. group_leaders ───────────────────────────────────────────────
create table if not exists public.group_leaders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role_label  text not null,
  area        text,
  tags        text[] default '{}',
  strengths   text[] default '{}',
  suitable_for text[] default '{}',
  description text,
  avatar_url  text,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists group_leaders_set_updated_at on public.group_leaders;
create trigger group_leaders_set_updated_at
  before update on public.group_leaders
  for each row execute function public.set_updated_at();

create index if not exists idx_group_leaders_active on public.group_leaders(is_active);

alter table public.group_leaders enable row level security;

drop policy if exists "group_leaders_read_active" on public.group_leaders;
create policy "group_leaders_read_active" on public.group_leaders
  for select using (
    is_active = true
    or is_admin()
  );

drop policy if exists "group_leaders_admin_insert" on public.group_leaders;
create policy "group_leaders_admin_insert" on public.group_leaders
  for insert with check (is_admin());

drop policy if exists "group_leaders_admin_update" on public.group_leaders;
create policy "group_leaders_admin_update" on public.group_leaders
  for update using (is_admin());

-- ─── 5. leader_matches ─────────────────────────────────────────────
create table if not exists public.leader_matches (
  id          uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  leader_id   uuid not null references public.group_leaders(id) on delete cascade,
  score       int not null,
  reasons     text[] default '{}',
  needs       text[] default '{}',
  is_selected boolean default false,
  created_at  timestamptz default now()
);

create index if not exists idx_leader_matches_resident on public.leader_matches(resident_id);
create index if not exists idx_leader_matches_leader   on public.leader_matches(leader_id);
create index if not exists idx_leader_matches_selected  on public.leader_matches(resident_id, is_selected) where is_selected = true;

alter table public.leader_matches enable row level security;

drop policy if exists "leader_matches_resident_read" on public.leader_matches;
create policy "leader_matches_resident_read" on public.leader_matches
  for select using (
    resident_id = auth.uid()
    or is_admin()
  );

drop policy if exists "leader_matches_insert" on public.leader_matches;
create policy "leader_matches_insert" on public.leader_matches
  for insert with check (
    resident_id = auth.uid()
    or is_admin()
  );

drop policy if exists "leader_matches_resident_update" on public.leader_matches;
create policy "leader_matches_resident_update" on public.leader_matches
  for update using (
    resident_id = auth.uid()
    or is_admin()
  );
