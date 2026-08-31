-- Production RAG foundation. Reviewed source records remain the source of truth;
-- vectors are rebuildable indexes and never replace the original content.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  source_type text not null check (source_type in ('public_info','content_item','manual')),
  source_id uuid not null,
  title text not null,
  category text not null,
  source_name text not null,
  canonical_url text not null,
  visibility text not null default 'resident' check (visibility in ('public','resident','staff')),
  status text not null default 'pending' check (status in ('pending','indexing','active','failed','expired')),
  current_version integer not null default 0,
  effective_from timestamptz,
  expires_at timestamptz,
  reviewed_at timestamptz not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_indexed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  version integer not null,
  content text not null,
  content_hash text not null,
  chunking_strategy text not null default 'zh-structural-v1',
  embedding_model text,
  embedding_dimensions integer,
  status text not null default 'pending' check (status in ('pending','indexed','failed','superseded')),
  indexed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (document_id, version),
  unique (document_id, content_hash)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  ordinal integer not null check (ordinal >= 0),
  heading text,
  content text not null check (char_length(content) between 1 and 4000),
  char_count integer not null check (char_count > 0),
  content_hash text not null,
  embedding extensions.vector(1024),
  embedding_model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (version_id, ordinal),
  unique (version_id, content_hash)
);

create table if not exists public.knowledge_index_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('public_info','content_item','manual')),
  source_id uuid not null,
  requested_by uuid references public.profiles(id) on delete set null,
  source_hash text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  trace_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_knowledge_jobs_one_open_source
  on public.knowledge_index_jobs(source_type, source_id)
  where status in ('pending','processing');
create index if not exists idx_knowledge_jobs_pending
  on public.knowledge_index_jobs(status, available_at, created_at);
create index if not exists idx_knowledge_documents_scope
  on public.knowledge_documents(organization_id, community_id, status, reviewed_at desc);
create index if not exists idx_knowledge_chunks_scope
  on public.knowledge_chunks(organization_id, community_id, document_id);
create index if not exists idx_knowledge_chunks_content_trgm
  on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);
create index if not exists idx_knowledge_chunks_embedding_hnsw
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

drop trigger if exists trg_knowledge_documents_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_updated_at before update on public.knowledge_documents
for each row execute function public.set_updated_at();

create or replace function public.queue_reviewed_knowledge_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  source_kind text := tg_argv[0];
  source_status text;
  source_hash_value text;
  source_org uuid;
begin
  source_status := new.status;
  source_org := new.organization_id;
  source_hash_value := case when source_kind = 'content_item' then new.content_hash else md5(new.title || E'\n' || new.content) end;

  if source_status = 'published' and (new.expires_at is null or new.expires_at > now()) then
    insert into public.knowledge_index_jobs (
      organization_id, source_type, source_id, requested_by, source_hash, status
    ) values (
      source_org, source_kind, new.id, auth.uid(), source_hash_value, 'pending'
    ) on conflict (source_type, source_id) where status in ('pending','processing')
      do update set source_hash = excluded.source_hash, available_at = now(),
        status = case when knowledge_index_jobs.status = 'processing' then 'processing' else 'pending' end;
  elsif source_status in ('expired','rejected') then
    update public.knowledge_documents
      set status = 'expired', last_error = null
      where source_type = source_kind and source_id = new.id;
    update public.knowledge_index_jobs
      set status = 'cancelled', completed_at = now()
      where source_type = source_kind and source_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_content_item_queue_knowledge on public.content_items;
create trigger trg_content_item_queue_knowledge
after insert or update of status, content_hash, reviewed_at, expires_at on public.content_items
for each row execute function public.queue_reviewed_knowledge_source('content_item');

drop trigger if exists trg_public_info_queue_knowledge on public.public_info_entries;
create trigger trg_public_info_queue_knowledge
after insert or update of status, title, content, verified_at, expires_at on public.public_info_entries
for each row execute function public.queue_reviewed_knowledge_source('public_info');

insert into public.knowledge_index_jobs (organization_id, source_type, source_id, source_hash, status)
select organization_id, 'content_item', id, content_hash, 'pending'
from public.content_items
where status = 'published' and (expires_at is null or expires_at > now())
on conflict (source_type, source_id) where status in ('pending','processing') do nothing;

insert into public.knowledge_index_jobs (organization_id, source_type, source_id, source_hash, status)
select organization_id, 'public_info', id, md5(title || E'\n' || content), 'pending'
from public.public_info_entries
where status = 'published' and (expires_at is null or expires_at > now())
on conflict (source_type, source_id) where status in ('pending','processing') do nothing;

create or replace function public.search_knowledge_chunks(
  p_query_text text,
  p_query_embedding text,
  p_organization_id uuid,
  p_community_id uuid default null,
  p_visibility text[] default array['public','resident'],
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_type text,
  source_id uuid,
  title text,
  heading text,
  content text,
  category text,
  source_name text,
  canonical_url text,
  reviewed_at timestamptz,
  expires_at timestamptz,
  version integer,
  text_score real,
  vector_score real,
  combined_score real
)
language sql stable security invoker set search_path = public, extensions as $$
  with eligible as (
    select c.*, d.source_type, d.source_id, d.title, d.category, d.source_name,
      d.canonical_url, d.reviewed_at, d.expires_at, d.visibility,
      v.version, v.status as version_status,
      greatest(
        similarity(lower(c.content), lower(trim(p_query_text))),
        similarity(lower(coalesce(c.heading, '')), lower(trim(p_query_text))),
        case when position(lower(trim(p_query_text)) in lower(c.content)) > 0 then 1 else 0 end,
        case when position(lower(trim(p_query_text)) in lower(d.title)) > 0 then 1 else 0 end
      )::real as keyword_score,
      case
        when p_query_embedding is null or c.embedding is null then 0
        else (1 - (c.embedding <=> p_query_embedding::extensions.vector(1024)))::real
      end as semantic_score
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    join public.knowledge_document_versions v on v.id = c.version_id
    where d.organization_id = p_organization_id
      and (p_community_id is null or d.community_id is null or d.community_id = p_community_id)
      and d.visibility = any(p_visibility)
      and d.status = 'active'
      and v.status = 'indexed'
      and v.version = d.current_version
      and (d.effective_from is null or d.effective_from <= now())
      and (d.expires_at is null or d.expires_at > now())
  ), ranked as (
    select eligible.*,
      row_number() over (order by keyword_score desc, reviewed_at desc) as keyword_rank,
      row_number() over (order by semantic_score desc, reviewed_at desc) as semantic_rank
    from eligible
    where keyword_score > 0.05 or semantic_score > 0.35
  )
  select id, document_id, source_type, source_id, title, heading, content, category,
    source_name, canonical_url, reviewed_at, expires_at, version,
    keyword_score, semantic_score,
    ((case when keyword_score > 0.05 then 1.0 / (60 + keyword_rank) else 0 end) +
     (case when semantic_score > 0.35 then 1.0 / (60 + semantic_rank) else 0 end))::real
  from ranked
  order by 16 desc, reviewed_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

create or replace function public.claim_knowledge_index_jobs(
  p_limit integer default 5,
  p_trace_id text default null,
  p_organization_id uuid default null
)
returns table (
  job_id uuid,
  source_type text,
  source_id uuid,
  requested_by uuid
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    if p_organization_id is null
      or not public.staff_can_access_tenant(p_organization_id, null)
      or not exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'community')
      ) then
      raise exception 'RAG_JOB_CLAIM_FORBIDDEN';
    end if;
  end if;

  return query
  with due as (
    select j.id
    from public.knowledge_index_jobs j
    where j.status = 'pending'
      and j.available_at <= now()
      and (p_organization_id is null or j.organization_id = p_organization_id)
    order by j.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 20)
  )
  update public.knowledge_index_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      started_at = now(),
      completed_at = null,
      last_error = null,
      trace_id = p_trace_id
  from due
  where j.id = due.id
  returning j.id, j.source_type, j.source_id, j.requested_by;
end;
$$;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_document_versions enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_index_jobs enable row level security;

create policy knowledge_documents_scoped_read on public.knowledge_documents
for select to anon, authenticated using (
  status = 'active' and (expires_at is null or expires_at > now()) and (
    visibility = 'public'
    or (auth.uid() is not null and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.organization_id = knowledge_documents.organization_id
        and (knowledge_documents.community_id is null or p.community_id is null or p.community_id = knowledge_documents.community_id)
        and (
          knowledge_documents.visibility = 'resident'
          or (knowledge_documents.visibility = 'staff' and p.role in ('doctor','nurse','pharmacist','community','admin'))
        )
    ))
  )
);
create policy knowledge_documents_staff_manage on public.knowledge_documents
for all to authenticated using (public.staff_can_access_tenant(organization_id, community_id))
with check (public.staff_can_access_tenant(organization_id, community_id));

create policy knowledge_versions_scoped_read on public.knowledge_document_versions
for select to anon, authenticated using (exists (
  select 1 from public.knowledge_documents d where d.id = document_id
));
create policy knowledge_versions_staff_manage on public.knowledge_document_versions
for all to authenticated using (exists (
  select 1 from public.knowledge_documents d where d.id = document_id
    and public.staff_can_access_tenant(d.organization_id, d.community_id)
)) with check (exists (
  select 1 from public.knowledge_documents d where d.id = document_id
    and public.staff_can_access_tenant(d.organization_id, d.community_id)
));

create policy knowledge_chunks_scoped_read on public.knowledge_chunks
for select to anon, authenticated using (exists (
  select 1 from public.knowledge_documents d where d.id = document_id
));
create policy knowledge_chunks_staff_manage on public.knowledge_chunks
for all to authenticated using (public.staff_can_access_tenant(organization_id, community_id))
with check (public.staff_can_access_tenant(organization_id, community_id));

create policy knowledge_jobs_staff_manage on public.knowledge_index_jobs
for all to authenticated using (public.staff_can_access_tenant(organization_id, null))
with check (public.staff_can_access_tenant(organization_id, null));

revoke all on public.knowledge_documents, public.knowledge_document_versions,
  public.knowledge_chunks, public.knowledge_index_jobs from anon, authenticated;
grant select on public.knowledge_documents, public.knowledge_document_versions,
  public.knowledge_chunks to anon, authenticated;
grant select, insert, update, delete on public.knowledge_documents,
  public.knowledge_document_versions, public.knowledge_chunks,
  public.knowledge_index_jobs to authenticated;
grant execute on function public.search_knowledge_chunks(text,text,uuid,uuid,text[],integer)
  to anon, authenticated;
revoke all on function public.claim_knowledge_index_jobs(integer,text,uuid) from public, anon;
grant execute on function public.claim_knowledge_index_jobs(integer,text,uuid)
  to authenticated, service_role;

comment on table public.knowledge_documents is 'Reviewed source registry for RAG; source business rows remain authoritative.';
comment on table public.knowledge_chunks is 'Rebuildable structured chunks and 1024-dimensional embeddings; never a medical record.';
comment on function public.search_knowledge_chunks is 'Tenant-filtered hybrid keyword/vector retrieval over active reviewed versions.';
comment on function public.claim_knowledge_index_jobs is 'Atomically claims due RAG jobs using row locks; tenant-scoped for staff and global for the service worker.';
