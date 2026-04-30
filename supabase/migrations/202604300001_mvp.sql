create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '新用户',
  role text not null default 'resident' check (role in ('resident','family','doctor','nurse','pharmacist','community','admin')),
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.resident_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  age int,
  chronic_tags text[] default '{}',
  family_doctor_id uuid references public.profiles(id),
  community_contact_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role_label text not null,
  group_type text not null check (group_type in ('doctorTeam','family','community')),
  description text not null,
  available_time text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  keywords text[] not null default '{}',
  category text not null,
  answer text not null,
  next_step text not null,
  suggest_doctor boolean not null default false,
  risk_level text not null check (risk_level in ('low','medium','high','emergency')),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  audience text not null,
  summary text not null,
  duration text not null,
  points int not null default 0,
  video_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  points int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.task_records (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  points_awarded int not null default 0
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  change int not null,
  reason text not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  sender_role text not null,
  content text not null,
  message_type text not null default 'text',
  created_at timestamptz not null default now()
);

create table if not exists public.doctor_todos (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  description text not null,
  risk_level text not null check (risk_level in ('low','medium','high','emergency')),
  status text not null default 'pending' check (status in ('pending','processing','done','ignored')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_resident_id on public.contacts(resident_id);
create index if not exists idx_contacts_contact_user_id on public.contacts(contact_user_id);
create index if not exists idx_task_records_resident_id on public.task_records(resident_id);
create index if not exists idx_points_ledger_resident_id on public.points_ledger(resident_id);
create index if not exists idx_group_messages_group_id on public.group_messages(group_id);
create index if not exists idx_doctor_todos_assigned_to on public.doctor_todos(assigned_to);
create index if not exists idx_doctor_todos_resident_id on public.doctor_todos(resident_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), '新用户'),
    coalesce(new.raw_user_meta_data ->> 'role', 'resident')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_bound_family_member(target_resident_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.contacts
    where contacts.resident_id = target_resident_id
      and contacts.contact_user_id = auth.uid()
      and contacts.group_type = 'family'
  )
$$;

create or replace function public.is_family_doctor(target_resident_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.resident_profiles
    where resident_profiles.user_id = target_resident_id
      and resident_profiles.family_doctor_id = auth.uid()
  )
$$;

alter table public.profiles enable row level security;
alter table public.resident_profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.faqs enable row level security;
alter table public.courses enable row level security;
alter table public.tasks enable row level security;
alter table public.task_records enable row level security;
alter table public.points_ledger enable row level security;
alter table public.group_messages enable row level security;
alter table public.doctor_todos enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "resident profiles read" on public.resident_profiles;
create policy "resident profiles read"
on public.resident_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_bound_family_member(user_id)
  or family_doctor_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "resident profiles manage admin" on public.resident_profiles;
create policy "resident profiles manage admin"
on public.resident_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contacts read" on public.contacts;
create policy "contacts read"
on public.contacts
for select
to authenticated
using (
  resident_id = auth.uid()
  or contact_user_id = auth.uid()
  or public.is_bound_family_member(resident_id)
  or public.is_family_doctor(resident_id)
  or public.is_admin()
);

drop policy if exists "contacts manage admin" on public.contacts;
create policy "contacts manage admin"
on public.contacts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "faqs read all authed" on public.faqs;
create policy "faqs read all authed"
on public.faqs
for select
to authenticated
using (true);

drop policy if exists "faqs manage admin" on public.faqs;
create policy "faqs manage admin"
on public.faqs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "courses read all authed" on public.courses;
create policy "courses read all authed"
on public.courses
for select
to authenticated
using (true);

drop policy if exists "courses manage admin" on public.courses;
create policy "courses manage admin"
on public.courses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tasks read all authed" on public.tasks;
create policy "tasks read all authed"
on public.tasks
for select
to authenticated
using (true);

drop policy if exists "tasks manage admin" on public.tasks;
create policy "tasks manage admin"
on public.tasks
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "task records read scoped" on public.task_records;
create policy "task records read scoped"
on public.task_records
for select
to authenticated
using (
  resident_id = auth.uid()
  or public.is_bound_family_member(resident_id)
  or public.is_admin()
);

drop policy if exists "task records insert resident" on public.task_records;
create policy "task records insert resident"
on public.task_records
for insert
to authenticated
with check (
  resident_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "points ledger read scoped" on public.points_ledger;
create policy "points ledger read scoped"
on public.points_ledger
for select
to authenticated
using (
  resident_id = auth.uid()
  or public.is_bound_family_member(resident_id)
  or public.is_admin()
);

drop policy if exists "points ledger insert resident" on public.points_ledger;
create policy "points ledger insert resident"
on public.points_ledger
for insert
to authenticated
with check (
  resident_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "group messages read authed" on public.group_messages;
create policy "group messages read authed"
on public.group_messages
for select
to authenticated
using (true);

drop policy if exists "group messages write authed" on public.group_messages;
create policy "group messages write authed"
on public.group_messages
for insert
to authenticated
with check (sender_id = auth.uid() or public.is_admin());

drop policy if exists "doctor todos read scoped" on public.doctor_todos;
create policy "doctor todos read scoped"
on public.doctor_todos
for select
to authenticated
using (
  assigned_to = auth.uid()
  or public.is_family_doctor(resident_id)
  or public.is_admin()
);

drop policy if exists "doctor todos update scoped" on public.doctor_todos;
create policy "doctor todos update scoped"
on public.doctor_todos
for update
to authenticated
using (
  assigned_to = auth.uid()
  or public.is_admin()
)
with check (
  assigned_to = auth.uid()
  or public.is_admin()
);

drop policy if exists "doctor todos insert admin" on public.doctor_todos;
create policy "doctor todos insert admin"
on public.doctor_todos
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "audit logs admin read" on public.audit_logs;
create policy "audit logs admin read"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "audit logs admin write" on public.audit_logs;
create policy "audit logs admin write"
on public.audit_logs
for insert
to authenticated
with check (public.is_admin());
