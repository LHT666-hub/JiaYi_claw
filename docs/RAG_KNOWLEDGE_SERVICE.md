# RAG Knowledge Service

家医 Claw 的 RAG 只索引经过机构审核、仍在有效期内的公开服务与健康教育内容。排班、预约进度、居民指标和临床事实继续由结构化业务表与权限工具提供。

## 数据流

```text
content_items / public_info_entries
  -> 人工审核为 published
  -> knowledge_index_jobs
  -> 结构化中文分块
  -> 可选 Embedding
  -> knowledge_document_versions / knowledge_chunks
  -> 机构、社区、权限、有效期过滤
  -> 关键词 + 向量混合检索
  -> 有来源回答与 chunk 级引用
```

原始业务记录是唯一事实源。知识文档、版本、分块和向量均为可重建索引，不用于保存居民病历。

## 环境变量

- `RAG_EMBEDDING_PROVIDER=disabled|deterministic|openai-compatible`
- `RAG_EMBEDDING_DIMENSIONS=1024`
- `RAG_EMBEDDING_API_KEY`
- `RAG_EMBEDDING_BASE_URL`
- `RAG_EMBEDDING_MODEL`
- `RAG_GENERATION_ENABLED=true|false`
- `RAG_GENERATION_MODEL`

`deterministic` 只用于本地测试，生产环境默认禁止。未配置 Embedding 时，系统继续使用关键词检索，不会伪装成语义检索。

## 管理接口

- `POST /api/v1/admin/rag/index`：索引单个来源或处理待处理队列。
- `GET /api/v1/admin/rag/status`：查看文档、队列和失败状态。
- `GET /api/v1/knowledge/search?q=...`：在当前机构和社区范围内检索。
- `POST /api/v1/internal/rag/process`：由定时任务携带 `CRON_SECRET` 自动处理索引队列。

发布 `content_items` 时会立即尝试索引；数据库触发器也会为已发布内容和公开信息建立待处理任务。后台 Worker 使用行锁原子领取任务，多个实例并发时不会重复领取同一任务。

## 安全边界

- 先执行医疗安全分流，再调用 RAG。
- 仅召回 active、indexed、未过期的当前版本。
- RLS 强制机构和社区隔离，工作人员内部知识不向居民开放。
- 检索内容作为数据而非指令，忽略文档内提示注入。
- 资料不足时进入现有确定性 fallback 或人工服务，不生成无来源事实。
- 回答保留 chunk、document、source、version、reviewedAt 和 traceId。
