create extension if not exists pgcrypto;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_workbench_role()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() in ('doctor', 'nurse', 'pharmacist', 'community', 'admin'), false)
$$;

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  keywords text[] not null default '{}',
  category text not null,
  answer text not null,
  next_step text,
  suggest_doctor boolean not null default false,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'emergency')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  question text not null,
  answer text,
  source text not null,
  category text,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'emergency')),
  suggest_doctor boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.doctor_todos (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  type text not null default 'ask',
  title text not null,
  description text,
  original_question text,
  claw_answer text,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'emergency')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'ignored')),
  source text default 'ask',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faqs
  add column if not exists question text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists category text,
  add column if not exists answer text,
  add column if not exists next_step text,
  add column if not exists suggest_doctor boolean not null default false,
  add column if not exists risk_level text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.ask_logs
  add column if not exists answer text,
  add column if not exists category text,
  add column if not exists risk_level text,
  add column if not exists suggest_doctor boolean not null default false,
  add column if not exists reason text,
  add column if not exists created_at timestamptz not null default now();

alter table public.doctor_todos
  add column if not exists resident_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists type text not null default 'ask',
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists original_question text,
  add column if not exists claw_answer text,
  add column if not exists risk_level text,
  add column if not exists status text not null default 'pending',
  add column if not exists source text default 'ask',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'faqs_risk_level_check'
      and conrelid = 'public.faqs'::regclass
  ) then
    alter table public.faqs
      add constraint faqs_risk_level_check
      check (risk_level in ('low', 'medium', 'high', 'emergency'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ask_logs_risk_level_check'
      and conrelid = 'public.ask_logs'::regclass
  ) then
    alter table public.ask_logs
      add constraint ask_logs_risk_level_check
      check (risk_level in ('low', 'medium', 'high', 'emergency'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'doctor_todos_risk_level_check'
      and conrelid = 'public.doctor_todos'::regclass
  ) then
    alter table public.doctor_todos
      add constraint doctor_todos_risk_level_check
      check (risk_level in ('low', 'medium', 'high', 'emergency'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'doctor_todos_status_check'
      and conrelid = 'public.doctor_todos'::regclass
  ) then
    alter table public.doctor_todos
      add constraint doctor_todos_status_check
      check (status in ('pending', 'processing', 'done', 'ignored'));
  end if;
end
$$;

drop trigger if exists trg_faqs_updated_at on public.faqs;
create trigger trg_faqs_updated_at
before update on public.faqs
for each row
execute function public.set_updated_at();

drop trigger if exists trg_doctor_todos_updated_at on public.doctor_todos;
create trigger trg_doctor_todos_updated_at
before update on public.doctor_todos
for each row
execute function public.set_updated_at();

create index if not exists idx_faqs_active_updated
  on public.faqs(is_active, updated_at desc);

create index if not exists idx_ask_logs_user_created
  on public.ask_logs(user_id, created_at desc);

create index if not exists idx_doctor_todos_assigned_status
  on public.doctor_todos(assigned_to, status, created_at desc);

alter table public.faqs enable row level security;
alter table public.ask_logs enable row level security;
alter table public.doctor_todos enable row level security;

drop policy if exists "faqs_select_active" on public.faqs;
create policy "faqs_select_active"
on public.faqs
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "faqs_admin_manage" on public.faqs;
create policy "faqs_admin_manage"
on public.faqs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "ask_logs_select_own_or_admin" on public.ask_logs;
create policy "ask_logs_select_own_or_admin"
on public.ask_logs
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ask_logs_insert_own_or_admin" on public.ask_logs;
create policy "ask_logs_insert_own_or_admin"
on public.ask_logs
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "doctor_todos_select_mvp" on public.doctor_todos;
create policy "doctor_todos_select_mvp"
on public.doctor_todos
for select
to authenticated
using (
  public.is_admin()
  or resident_id = auth.uid()
  or (public.is_workbench_role() and (assigned_to = auth.uid() or assigned_to is null))
);

drop policy if exists "doctor_todos_insert_authenticated" on public.doctor_todos;
create policy "doctor_todos_insert_authenticated"
on public.doctor_todos
for insert
to authenticated
with check (
  public.is_admin()
  or resident_id = auth.uid()
  or public.is_workbench_role()
);

drop policy if exists "doctor_todos_update_mvp" on public.doctor_todos;
create policy "doctor_todos_update_mvp"
on public.doctor_todos
for update
to authenticated
using (
  public.is_admin()
  or assigned_to = auth.uid()
  or (public.is_workbench_role() and assigned_to is null)
)
with check (
  public.is_admin()
  or assigned_to = auth.uid()
  or (public.is_workbench_role() and assigned_to = auth.uid())
);

comment on table public.faqs is '管理员维护的 FAQ 表，/api/ask 会优先从这里读取启用中的 FAQ。';
comment on table public.ask_logs is '问 Claw 问答日志表，用于记录问题、回答、来源、风险等级和后续统计。';
comment on table public.doctor_todos is '医生待办表。当问答需要医生介入时会生成待办，MVP 阶段支持未分配待办由工作台认领处理。';
