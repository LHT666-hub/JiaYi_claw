create table if not exists public.content_item_revisions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  content_hash text not null,
  title text not null,
  summary text not null,
  cover_url text,
  published_at timestamptz,
  status text not null,
  captured_by uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  unique (content_item_id, content_hash)
);

create index if not exists idx_content_item_revisions_item_captured
  on public.content_item_revisions(content_item_id, captured_at desc);

alter table public.content_item_revisions enable row level security;

drop policy if exists content_item_revisions_staff_read on public.content_item_revisions;
create policy content_item_revisions_staff_read on public.content_item_revisions
for select to authenticated
using (public.staff_can_access_tenant(organization_id, community_id));

drop policy if exists content_item_revisions_staff_insert on public.content_item_revisions;
create policy content_item_revisions_staff_insert on public.content_item_revisions
for insert to authenticated
with check (
  captured_by = auth.uid()
  and public.staff_can_access_tenant(organization_id, community_id)
  and exists (
    select 1 from public.content_items item
    where item.id = content_item_id
      and item.organization_id = organization_id
      and item.community_id is not distinct from community_id
  )
);

comment on table public.content_item_revisions is
  'Immutable snapshots retained before a newly ingested version replaces a previously reviewed content item.';
