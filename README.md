# 家医 Claw

家医 Claw 是一个面向老年慢病居民的手机端家庭医生服务导航与自我管理 MVP。  
它不是医院 App，也不是线上问诊平台。它的重点是把居民反复在群里问的公开服务信息先整理清楚，再把真正需要医生判断的问题分流出去，减少家庭医生被重复流程咨询持续打断。

当前项目基于：

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase RLS
- 本地 FAQ / 知识库 fallback
- Kimi 服务端兜底

## 当前范围

保留并可继续使用的页面：

- `/`
- `/ask`
- `/tasks`
- `/group`
- `/contacts`
- `/contacts/[id]`
- `/courses`
- `/me`
- `/doctor`
- `/login`

这次升级的重点不是重做 UI，而是把原来的 `localStorage demo` 推进到“数据库层 MVP”：

- 建立 Supabase / PostgreSQL 表结构
- 引入 RLS 基础权限边界
- 把 FAQ、任务、积分、联系人、群聊、医生待办逐步接到数据库
- 同时保留本地 fallback，避免环境未配置时页面白屏

## 为什么需要数据库

`localStorage` 只能支持单机演示：

- 数据只在当前浏览器里
- 换设备就丢
- 不能多人试用
- 无法做角色、权限和真实任务协同

真实试用至少需要数据库层来承接：

- 用户资料
- 联系人
- FAQ
- 小课堂
- 任务模板
- 任务完成记录
- 积分流水
- 群聊消息
- 医生待办

## 环境变量

复制一份环境变量示例文件：

```bash
cp .env.local.example .env.local
```

至少需要：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_optional_server_only
KIMI_API_KEY=your_kimi_api_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.6
NEXT_PUBLIC_ASK_TIMEOUT_MS=30000
```

说明：

- `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 可用于前端与 SSR
- `SUPABASE_SERVICE_ROLE_KEY` 只能用于服务端
- 不要提交 `.env.local`
- 不要在前端打印任何真实 Key
- `NEXT_PUBLIC_ASK_TIMEOUT_MS` 用于控制 `/ask` 前端等待 `/api/ask` 的超时时间，默认 30000ms

## 使用 Supabase

1. 在 [Supabase](https://supabase.com/) 创建项目
2. 在 `Project Settings -> API` 获取：
   - Project URL
   - anon key
   - service_role key
3. 在本地 `.env.local` 中配置这些变量

## 数据库 Migration

当前项目提供了数据库初始化 SQL：

- [supabase/migrations/001_initial_schema.sql](C:/Users/LHT/Desktop/小程序/supabase/migrations/001_initial_schema.sql)

核心表包括：

1. `profiles`
2. `contacts`
3. `faqs`
4. `courses`
5. `tasks`
6. `task_records`
7. `points_ledger`
8. `exchanges`
9. `group_messages`
10. `doctor_todos`
11. `audit_logs`

执行方式：

1. 打开 Supabase Dashboard
2. 进入 `SQL Editor`
3. 执行 `001_initial_schema.sql`

这份 migration 已包含：

- `pgcrypto`
- `updated_at` trigger
- 基础索引
- `task_records` 按日去重唯一索引
- RLS 开启
- MVP 版本的基础策略

## 种子数据

种子文件：

- [supabase/seed.sql](C:/Users/LHT/Desktop/小程序/supabase/seed.sql)

因为 Supabase Auth 用户不能安全地用普通 SQL 直接创建，建议先在 Dashboard 手动创建这些账号：

- `zhangayi@example.com`
- `daughter@example.com`
- `li-doctor@example.com`
- `wang-nurse@example.com`
- `chen-pharmacist@example.com`
- `community-zhang@example.com`
- `admin@example.com`

对应角色：

- 张阿姨 resident
- 张阿姨女儿 family
- 李医生 doctor
- 王护士 nurse
- 陈药师 pharmacist
- 居委张老师 community
- 管理员 admin

然后执行 `seed.sql`。它会补充：

- profiles
- resident profile
- contacts
- faqs
- courses
- tasks
- task_records
- points_ledger
- exchanges
- group_messages
- doctor_todos

## Supabase 客户端与数据库封装

当前项目已经新增：

- [lib/supabase/client.ts](C:/Users/LHT/Desktop/小程序/lib/supabase/client.ts)
- [lib/supabase/server.ts](C:/Users/LHT/Desktop/小程序/lib/supabase/server.ts)
- [lib/supabase/types.ts](C:/Users/LHT/Desktop/小程序/lib/supabase/types.ts)

以及数据库访问封装：

- [lib/db/faqs.ts](C:/Users/LHT/Desktop/小程序/lib/db/faqs.ts)
- [lib/db/tasks.ts](C:/Users/LHT/Desktop/小程序/lib/db/tasks.ts)
- [lib/db/points.ts](C:/Users/LHT/Desktop/小程序/lib/db/points.ts)
- [lib/db/contacts.ts](C:/Users/LHT/Desktop/小程序/lib/db/contacts.ts)
- [lib/db/groupMessages.ts](C:/Users/LHT/Desktop/小程序/lib/db/groupMessages.ts)
- [lib/db/doctorTodos.ts](C:/Users/LHT/Desktop/小程序/lib/db/doctorTodos.ts)
- [lib/db/audit.ts](C:/Users/LHT/Desktop/小程序/lib/db/audit.ts)

这些封装的原则是：

- 数据库优先
- try/catch 兜底
- 出错时回退本地数据或 localStorage
- 不让页面因为 Supabase 未配置而崩溃

## 积分流水说明

积分不直接存一个总分字段。  
页面显示的“我的积分”应通过 `points_ledger` 汇总计算：

```sql
sum(change)
```

完成任务时：

1. 写 `task_records`
2. 写 `points_ledger`
3. `change = task.points`
4. `reason = 完成任务：任务名称`
5. `source_type = 'task'`

兑换积分时：

1. 检查当前积分是否足够
2. 写 `exchanges`
3. 写 `points_ledger`
4. `change = -pointsCost`
5. `source_type = 'exchange'`

这能保证后续：

- 可追溯
- 可审计
- 可回滚
- 不容易因为并发直接写总分而出错

## 问 Claw 四层问答架构

`/ask` 当前采用四层问答流程：

1. 安全拦截
2. FAQ
3. 知识库检索
4. Kimi 兜底生成

顺序是：

1. 紧急风险拦截
2. 医疗安全边界拦截
3. 优先读取 FAQ
   - 数据库 `faqs` 优先
   - 不可用时回退 `data/faqs.ts`
4. 检索本地知识库 `data/knowledge.ts`
5. 命中知识片段后交给 Kimi 做整理表达
6. 若仍未命中，但属于家医服务范围，则调用 Kimi 做一般服务导航
7. 不属于范围则 fallback
8. Kimi 限流、超时、认证失败、模型异常时 fallback

当前知识库仍是本地关键词检索版本。未来可升级为：

- Supabase 表
- pgvector
- 更完整的 RAG 检索

## 当前哪些页面已接数据库

已经接数据库优先模式的部分：

- `/login`
- `/ask` 的 FAQ 读取
- `/tasks`
- `/contacts`
- `/group`
- `/me`
- `/doctor`

## 哪些地方仍保留 fallback

为了保证 demo 稳定，当前仍保留这些 fallback：

- 首页局部状态
- 聊天记录 localStorage
- 课程观看状态
- 部分兑换展示
- 群助手自动回复的本地演示逻辑
- 联系人详情页仍主要沿用演示模板

也就是说：

- Supabase 配好了，可以多人试用
- Supabase 没配好，也不会白屏，仍然可以本地演示

## RLS 策略说明

当前是 MVP 级别策略，重点保证“先有边界，再逐步细化”。

已覆盖的基础规则：

- 用户只能读取自己的 `profiles`
- 用户可更新自己的基础资料
- `faqs / courses / tasks` 对登录用户开放读取，admin 可管理
- resident 只能读取自己的 `task_records`、`points_ledger`
- family / contact 关系用户可读取绑定居民的部分记录
- `contacts` 仅 resident、contact_user 或 admin 可读
- `group_messages` 当前允许已登录用户读取演示群消息
- `doctor_todos` 允许 assigned_to、resident 本人和 admin 读取
- `audit_logs` 仅 admin 可读

后续可以继续加强：

- 群成员级别的 group 访问控制
- 更细的 family 可见字段边界
- admin 配置后台
- 更严格的 doctor / nurse / pharmacist / community 协同权限

## 服务端 API

当前已经新增这些 route handler：

- [app/api/tasks/complete/route.ts](C:/Users/LHT/Desktop/小程序/app/api/tasks/complete/route.ts)
- [app/api/points/exchange/route.ts](C:/Users/LHT/Desktop/小程序/app/api/points/exchange/route.ts)
- [app/api/group/messages/route.ts](C:/Users/LHT/Desktop/小程序/app/api/group/messages/route.ts)
- [app/api/doctor/todos/route.ts](C:/Users/LHT/Desktop/小程序/app/api/doctor/todos/route.ts)

它们会：

- 在服务端读取当前用户
- 做最基础权限判断
- 写数据库敏感表
- 写 `audit_logs`
- 返回友好错误

## 本地运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

## 部署到 Vercel

在 Vercel 项目里配置以下环境变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KIMI_API_KEY`
- `KIMI_BASE_URL`
- `KIMI_MODEL`

位置：

- `Project Settings -> Environment Variables`

## 当前 MVP 边界

仍未接入：

- 真实医疗系统
- 医保
- 真实处方
- 微信小程序正式能力
- 真实 OCR / 语音识别

医疗边界仍然保留：

- 不做诊断
- 不开处方
- 不建议停药换药
- 不做剂量调整
- 不做个体化治疗判断

Kimi 当前只做：

- 服务导航
- 知识整理
- 公开信息解释
- 居民能听懂的话术总结

不是问诊替代。
