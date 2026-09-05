-- RAG V2 retrieval: two candidate channels (lexical + vector), alias-aware
-- scoring, and RRF fusion. The function signature remains compatible with the
-- existing application so this migration can be rolled out independently.

create index if not exists idx_knowledge_documents_title_trgm
  on public.knowledge_documents using gin (title extensions.gin_trgm_ops);
create index if not exists idx_knowledge_documents_category_trgm
  on public.knowledge_documents using gin (category extensions.gin_trgm_ops);
create index if not exists idx_public_info_title_trgm
  on public.public_info_entries using gin (title extensions.gin_trgm_ops);
create index if not exists idx_public_info_content_trgm
  on public.public_info_entries using gin (content extensions.gin_trgm_ops);
create index if not exists idx_public_info_keywords_gin
  on public.public_info_entries using gin (keywords);

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
  with params as (
    select
      nullif(trim(p_query_text), '') as query_text,
      case
        when nullif(trim(p_query_embedding), '') is null then null::extensions.vector(1024)
        else p_query_embedding::extensions.vector(1024)
      end as query_vector,
      least(greatest(p_limit, 1), 20) as final_limit,
      least(greatest(least(greatest(p_limit, 1), 20) * 5, 30), 100) as candidate_limit
  ),
  lexical_scored as (
    select
      c.id as chunk_id,
      d.reviewed_at,
      greatest(
        similarity(lower(c.content), lower(params.query_text)),
        similarity(lower(coalesce(c.heading, '')), lower(params.query_text)),
        similarity(lower(d.title), lower(params.query_text)),
        similarity(lower(d.category), lower(params.query_text)),
        coalesce(alias_match.alias_score, 0),
        case when position(lower(params.query_text) in lower(c.content)) > 0 then 1 else 0 end,
        case when position(lower(params.query_text) in lower(d.title)) > 0 then 1 else 0 end
      )::real as lexical_score
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    join public.knowledge_document_versions v on v.id = c.version_id
    cross join params
    left join public.public_info_entries pi
      on d.source_type = 'public_info' and pi.id = d.source_id
    left join lateral (
      select max(greatest(
        similarity(lower(keyword), lower(params.query_text)),
        case when position(lower(keyword) in lower(params.query_text)) > 0 then 1 else 0 end,
        case when position(lower(params.query_text) in lower(keyword)) > 0 then 1 else 0 end
      ))::real as alias_score
      from unnest(coalesce(pi.keywords, array[]::text[])) keyword
    ) alias_match on true
    where params.query_text is not null
      and d.organization_id = p_organization_id
      and (p_community_id is null or d.community_id is null or d.community_id = p_community_id)
      and d.visibility = any(p_visibility)
      and d.status = 'active'
      and v.status = 'indexed'
      and v.version = d.current_version
      and (d.effective_from is null or d.effective_from <= now())
      and (d.expires_at is null or d.expires_at > now())
  ),
  lexical_candidates as (
    select
      chunk_id,
      lexical_score,
      row_number() over (order by lexical_score desc, reviewed_at desc) as lexical_rank
    from lexical_scored
    where lexical_score > 0.05
    order by lexical_score desc, reviewed_at desc
    limit (select candidate_limit from params)
  ),
  vector_scored as (
    select
      c.id as chunk_id,
      d.reviewed_at,
      (1 - (c.embedding <=> params.query_vector))::real as semantic_score
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    join public.knowledge_document_versions v on v.id = c.version_id
    cross join params
    where params.query_vector is not null
      and c.embedding is not null
      and d.organization_id = p_organization_id
      and (p_community_id is null or d.community_id is null or d.community_id = p_community_id)
      and d.visibility = any(p_visibility)
      and d.status = 'active'
      and v.status = 'indexed'
      and v.version = d.current_version
      and (d.effective_from is null or d.effective_from <= now())
      and (d.expires_at is null or d.expires_at > now())
    order by c.embedding <=> params.query_vector, d.reviewed_at desc
    limit (select candidate_limit from params)
  ),
  vector_candidates as (
    select
      chunk_id,
      semantic_score,
      row_number() over (order by semantic_score desc, reviewed_at desc) as semantic_rank
    from vector_scored
    where semantic_score > 0.35
  ),
  candidate_ids as (
    select chunk_id from lexical_candidates
    union
    select chunk_id from vector_candidates
  ),
  fused as (
    select
      c.id as chunk_id,
      c.document_id,
      d.source_type,
      d.source_id,
      d.title,
      c.heading,
      c.content,
      d.category,
      d.source_name,
      d.canonical_url,
      d.reviewed_at,
      d.expires_at,
      v.version,
      coalesce(l.lexical_score, 0)::real as text_score,
      coalesce(s.semantic_score, 0)::real as vector_score,
      (
        case when l.lexical_rank is not null then 1.0 / (60 + l.lexical_rank) else 0 end
        + case when s.semantic_rank is not null then 1.0 / (60 + s.semantic_rank) else 0 end
      )::real as combined_score
    from candidate_ids ids
    join public.knowledge_chunks c on c.id = ids.chunk_id
    join public.knowledge_documents d on d.id = c.document_id
    join public.knowledge_document_versions v on v.id = c.version_id
    left join lexical_candidates l on l.chunk_id = c.id
    left join vector_candidates s on s.chunk_id = c.id
  )
  select
    fused.chunk_id,
    fused.document_id,
    fused.source_type,
    fused.source_id,
    fused.title,
    fused.heading,
    fused.content,
    fused.category,
    fused.source_name,
    fused.canonical_url,
    fused.reviewed_at,
    fused.expires_at,
    fused.version,
    fused.text_score,
    fused.vector_score,
    fused.combined_score
  from fused
  order by fused.combined_score desc, fused.reviewed_at desc
  limit (select final_limit from params);
$$;

comment on function public.search_knowledge_chunks(text,text,uuid,uuid,text[],integer)
  is 'RAG V2 tenant-filtered hybrid retrieval: lexical/alias + HNSW vector candidates fused with reciprocal rank fusion.';
