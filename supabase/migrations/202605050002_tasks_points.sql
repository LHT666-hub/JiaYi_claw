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

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null check (
    category in ('medicine', 'record', 'course', 'group', 'followup', 'other')
  ),
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
  completed_on date not null default current_date,
  completed_at timestamptz not null default now(),
  points_awarded int not null default 0,
  note text
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  change int not null,
  reason text not null,
  source_type text not null check (
    source_type in ('task', 'course', 'group', 'exchange', 'manual', 'system')
  ),
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
  status text not null default 'completed' check (
    status in ('pending', 'completed', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists points int not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order int not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.task_records
  add column if not exists completed_on date,
  add column if not exists completed_at timestamptz not null default now(),
  add column if not exists points_awarded int not null default 0,
  add column if not exists note text;

update public.task_records
set completed_on = coalesce(completed_on, completed_at::date, current_date)
where completed_on is null;

alter table public.task_records
  alter column completed_on set default current_date,
  alter column completed_on set not null;

alter table public.points_ledger
  add column if not exists balance_after int,
  add column if not exists created_by uuid references public.profiles(id);

alter table public.exchanges
  add column if not exists status text not null default 'completed',
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_records_resident_task_completed_on_key'
      and conrelid = 'public.task_records'::regclass
  ) then
    alter table public.task_records
      add constraint task_records_resident_task_completed_on_key
      unique (resident_id, task_id, completed_on);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_category_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_category_check
      check (category in ('medicine', 'record', 'course', 'group', 'followup', 'other'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'points_ledger_source_type_check'
      and conrelid = 'public.points_ledger'::regclass
  ) then
    alter table public.points_ledger
      add constraint points_ledger_source_type_check
      check (source_type in ('task', 'course', 'group', 'exchange', 'manual', 'system'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exchanges_status_check'
      and conrelid = 'public.exchanges'::regclass
  ) then
    alter table public.exchanges
      add constraint exchanges_status_check
      check (status in ('pending', 'completed', 'cancelled'));
  end if;
end
$$;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create index if not exists idx_tasks_is_active_sort_order
  on public.tasks(is_active, sort_order, created_at);

create index if not exists idx_task_records_resident_completed_on
  on public.task_records(resident_id, completed_on desc);

create index if not exists idx_points_ledger_resident_created_at
  on public.points_ledger(resident_id, created_at desc);

create index if not exists idx_exchanges_resident_created_at
  on public.exchanges(resident_id, created_at desc);

alter table public.tasks enable row level security;
alter table public.task_records enable row level security;
alter table public.points_ledger enable row level security;
alter table public.exchanges enable row level security;

drop policy if exists "tasks_select_active" on public.tasks;
create policy "tasks_select_active"
on public.tasks
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "tasks_admin_manage" on public.tasks;
create policy "tasks_admin_manage"
on public.tasks
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "task_records_select_own_or_admin" on public.task_records;
create policy "task_records_select_own_or_admin"
on public.task_records
for select
to authenticated
using (resident_id = auth.uid() or public.is_admin());

drop policy if exists "task_records_insert_own_or_admin" on public.task_records;
create policy "task_records_insert_own_or_admin"
on public.task_records
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "task_records_admin_update" on public.task_records;
create policy "task_records_admin_update"
on public.task_records
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "points_ledger_select_own_or_admin" on public.points_ledger;
create policy "points_ledger_select_own_or_admin"
on public.points_ledger
for select
to authenticated
using (resident_id = auth.uid() or public.is_admin());

drop policy if exists "points_ledger_insert_own_or_admin" on public.points_ledger;
create policy "points_ledger_insert_own_or_admin"
on public.points_ledger
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "points_ledger_admin_update" on public.points_ledger;
create policy "points_ledger_admin_update"
on public.points_ledger
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "exchanges_select_own_or_admin" on public.exchanges;
create policy "exchanges_select_own_or_admin"
on public.exchanges
for select
to authenticated
using (resident_id = auth.uid() or public.is_admin());

drop policy if exists "exchanges_insert_own_or_admin" on public.exchanges;
create policy "exchanges_insert_own_or_admin"
on public.exchanges
for insert
to authenticated
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "exchanges_admin_update" on public.exchanges;
create policy "exchanges_admin_update"
on public.exchanges
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

comment on table public.tasks is '任务模板表。/tasks 页面会优先从 Supabase 读取启用中的任务。';
comment on table public.task_records is '任务完成记录表。同一居民同一任务同一天只能完成一次。';
comment on table public.points_ledger is '积分流水表。积分总额必须通过 sum(change) 汇总，不单独存 points_total。';
comment on table public.exchanges is '积分兑换记录表。兑换成功后会同步写入负向 points_ledger。';
