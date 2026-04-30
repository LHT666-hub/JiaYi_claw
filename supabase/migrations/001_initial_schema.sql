create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('resident','family','doctor','nurse','pharmacist','community','admin')),
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role_label text not null,
  group_type text not null check (group_type in ('doctorTeam','family','community')),
  description text,
  available_time text,
  avatar_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  keywords text[] not null default '{}',
  category text not null,
  answer text not null,
  next_step text,
  suggest_doctor boolean not null default false,
  risk_level text not null check (risk_level in ('low','medium','high','emergency')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  audience text,
  summary text,
  duration text,
  points int not null default 0,
  video_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (category in ('medicine','record','course','group','followup','other')),
  points int not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_records (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  points_awarded int not null default 0,
  note text
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  change int not null,
  reason text not null,
  source_type text not null check (source_type in ('task','course','group','exchange','manual','system')),
  source_id uuid,
  balance_after int,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.exchanges (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  item_name text not null,
  points_cost int not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
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
  resident_id uuid references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  description text,
  risk_level text not null check (risk_level in ('low','medium','high','emergency')),
  status text not null default 'pending' check (status in ('pending','processing','done','ignored')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_resident_id on public.contacts(resident_id);
create index if not exists idx_contacts_contact_user_id on public.contacts(contact_user_id);
create index if not exists idx_faqs_is_active on public.faqs(is_active);
create index if not exists idx_courses_is_active on public.courses(is_active);
create index if not exists idx_tasks_is_active on public.tasks(is_active);
create index if not exists idx_task_records_resident_id on public.task_records(resident_id);
create index if not exists idx_points_ledger_resident_id on public.points_ledger(resident_id);
create index if not exists idx_exchanges_resident_id on public.exchanges(resident_id);
create index if not exists idx_group_messages_group_id on public.group_messages(group_id);
create index if not exists idx_doctor_todos_assigned_to on public.doctor_todos(assigned_to);
create index if not exists idx_doctor_todos_resident_id on public.doctor_todos(resident_id);

create unique index if not exists idx_task_records_unique_daily
  on public.task_records (
    resident_id,
    task_id,
    ((completed_at at time zone 'Asia/Shanghai')::date)
  );

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute procedure public.set_updated_at();

drop trigger if exists faqs_set_updated_at on public.faqs;
create trigger faqs_set_updated_at
before update on public.faqs
for each row execute procedure public.set_updated_at();

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute procedure public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute procedure public.set_updated_at();

drop trigger if exists doctor_todos_set_updated_at on public.doctor_todos;
create trigger doctor_todos_set_updated_at
before update on public.doctor_todos
for each row execute procedure public.set_updated_at();

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
for each row execute procedure public.handle_new_user();

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

create or replace function public.is_related_contact(target_resident_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.contacts
    where resident_id = target_resident_id
      and contact_user_id = auth.uid()
  )
$$;

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.faqs enable row level security;
alter table public.courses enable row level security;
alter table public.tasks enable row level security;
alter table public.task_records enable row level security;
alter table public.points_ledger enable row level security;
alter table public.exchanges enable row level security;
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

drop policy if exists "faqs read active" on public.faqs;
create policy "faqs read active"
on public.faqs
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "faqs admin manage" on public.faqs;
create policy "faqs admin manage"
on public.faqs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "courses read active" on public.courses;
create policy "courses read active"
on public.courses
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "courses admin manage" on public.courses;
create policy "courses admin manage"
on public.courses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tasks read active" on public.tasks;
create policy "tasks read active"
on public.tasks
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "tasks admin manage" on public.tasks;
create policy "tasks admin manage"
on public.tasks
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contacts scoped read" on public.contacts;
create policy "contacts scoped read"
on public.contacts
for select
to authenticated
using (
  resident_id = auth.uid()
  or contact_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "contacts admin manage" on public.contacts;
create policy "contacts admin manage"
on public.contacts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "task_records scoped read" on public.task_records;
create policy "task_records scoped read"
on public.task_records
for select
to authenticated
using (
  resident_id = auth.uid()
  or public.is_related_contact(resident_id)
  or public.is_admin()
);

drop policy if exists "task_records resident insert" on public.task_records;
create policy "task_records resident insert"
on public.task_records
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "points_ledger scoped read" on public.points_ledger;
create policy "points_ledger scoped read"
on public.points_ledger
for select
to authenticated
using (
  resident_id = auth.uid()
  or public.is_related_contact(resident_id)
  or public.is_admin()
);

drop policy if exists "points_ledger resident insert" on public.points_ledger;
create policy "points_ledger resident insert"
on public.points_ledger
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "exchanges scoped read" on public.exchanges;
create policy "exchanges scoped read"
on public.exchanges
for select
to authenticated
using (
  resident_id = auth.uid()
  or public.is_related_contact(resident_id)
  or public.is_admin()
);

drop policy if exists "exchanges resident insert" on public.exchanges;
create policy "exchanges resident insert"
on public.exchanges
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "group_messages read authed" on public.group_messages;
create policy "group_messages read authed"
on public.group_messages
for select
to authenticated
using (true);

drop policy if exists "group_messages write authed" on public.group_messages;
create policy "group_messages write authed"
on public.group_messages
for insert
to authenticated
with check (sender_id = auth.uid() or public.is_admin());

drop policy if exists "doctor_todos read scoped" on public.doctor_todos;
create policy "doctor_todos read scoped"
on public.doctor_todos
for select
to authenticated
using (
  assigned_to = auth.uid()
  or resident_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "doctor_todos insert scoped" on public.doctor_todos;
create policy "doctor_todos insert scoped"
on public.doctor_todos
for insert
to authenticated
with check (
  assigned_to = auth.uid()
  or public.is_admin()
);

drop policy if exists "doctor_todos update scoped" on public.doctor_todos;
create policy "doctor_todos update scoped"
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

drop policy if exists "audit_logs admin read" on public.audit_logs;
create policy "audit_logs admin read"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "audit_logs scoped insert" on public.audit_logs;
create policy "audit_logs scoped insert"
on public.audit_logs
for insert
to authenticated
with check (actor_id = auth.uid() or public.is_admin());
