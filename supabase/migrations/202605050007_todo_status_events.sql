-- ============================================================
-- V2.5 Phase 4: 居民端服务进度 / 待办状态轨迹
-- ============================================================

create table if not exists public.todo_status_events (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.doctor_todos(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  old_status text,
  new_status text not null check (new_status in ('pending','processing','done','ignored')),
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_todo_status_events_todo_created
  on public.todo_status_events (todo_id, created_at desc);

alter table public.todo_status_events enable row level security;

drop policy if exists "todo_status_events_select_scoped" on public.todo_status_events;
create policy "todo_status_events_select_scoped"
on public.todo_status_events
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.doctor_todos
    where doctor_todos.id = todo_status_events.todo_id
      and doctor_todos.resident_id = auth.uid()
  )
  or exists (
    select 1
    from public.doctor_todos
    where doctor_todos.id = todo_status_events.todo_id
      and (doctor_todos.assigned_to = auth.uid() or (public.is_workbench_role() and doctor_todos.assigned_to is null))
  )
  or exists (
    select 1
    from public.doctor_todos
    join public.family_bindings
      on family_bindings.resident_id = doctor_todos.resident_id
    where doctor_todos.id = todo_status_events.todo_id
      and family_bindings.family_id = auth.uid()
      and family_bindings.status = 'active'
  )
);

drop policy if exists "todo_status_events_insert_scoped" on public.todo_status_events;
create policy "todo_status_events_insert_scoped"
on public.todo_status_events
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.doctor_todos
    where doctor_todos.id = todo_status_events.todo_id
      and (doctor_todos.assigned_to = auth.uid() or (public.is_workbench_role() and doctor_todos.assigned_to is null))
  )
);

drop policy if exists "doctor_todos_select_mvp" on public.doctor_todos;
create policy "doctor_todos_select_mvp"
on public.doctor_todos
for select
to authenticated
using (
  public.is_admin()
  or resident_id = auth.uid()
  or (public.is_workbench_role() and (assigned_to = auth.uid() or assigned_to is null))
  or exists (
    select 1
    from public.family_bindings
    where family_bindings.resident_id = doctor_todos.resident_id
      and family_bindings.family_id = auth.uid()
      and family_bindings.status = 'active'
  )
);
