# 家医 Claw

家医 Claw 是一个面向老年慢病居民的手机端家庭医生服务导航原型。当前仓库同时保留本地演示能力，以及分阶段接入 Supabase 的数据化能力，适合做产品演示、角色演练和阶段联调。

## 当前阶段

- 产品版本：`家医 Claw V1.5 本地运营后台演示版`
- 数据化进度：
  - `V2 第二阶段已完成`：`tasks + task_records + points_ledger + exchanges`
  - `V2 第三阶段已完成代码接入`：`faqs + ask_logs + doctor_todos + /api/ask + /doctor + /admin FAQ 管理`

## 已完成能力

- 演示登录与角色切换
- 居民端首页、问 Claw、任务、群聊、一键找人
- FAQ 优先问答
- 医疗安全拦截
- Kimi 兜底保留
- 管理后台 `/admin`
- 运行数据看板
- FAQ 管理
- 小课堂管理
- 任务与积分管理
- 体验反馈
- 医生待办闭环
- 第一阶段 Supabase 登录与 `profiles` 角色系统
- 第二阶段 Supabase `tasks + task_records + points_ledger + exchanges`
- 第三阶段 Supabase `faqs + ask_logs + doctor_todos`

## V2 第二阶段状态

第二阶段当前已经完成并封存：

- `/tasks` 在登录 `resident` 时优先读取 Supabase `tasks`
- 完成任务写入 `task_records`
- 加分写入正向 `points_ledger`
- 兑换写入 `exchanges` 和负向 `points_ledger`
- 积分总额通过 `sum(points_ledger.change)` 汇总
- Supabase 不可用时仍保留 localStorage fallback

## V2 第三阶段说明

本阶段迁移内容：

- `faqs`
- `ask_logs`
- `doctor_todos`
- `/api/ask`
- `/doctor`
- `/admin` FAQ 管理

未迁移内容仍保留本地演示版：

- `contacts`
- `group_messages`
- `courses`

### 1. `faqs` 表用途

`faqs` 用于存放管理员维护的标准问答。

- `/api/ask` 优先从 Supabase `faqs` 读取启用中的 FAQ
- `/admin` 里的 FAQ 管理在真实 Supabase admin 身份下会优先读写这个表
- 当 Supabase 不可用或当前是演示 admin 时，仍回退到 localStorage FAQ

### 2. `ask_logs` 表用途

`ask_logs` 用于记录问 Claw 的问题和回答结果，字段包括：

- 问题文本
- 回答内容
- 来源 `source`
- 分类 `category`
- 风险等级 `risk_level`
- 是否建议联系医生 `suggest_doctor`
- 兜底原因 `reason`

这个表主要用于：

- `/admin` 运行看板统计
- 后续问答质量评估
- FAQ 命中效果分析

### 3. `doctor_todos` 表用途

`doctor_todos` 用于承接需要医生团队继续处理的问题。

当 `/api/ask` 返回以下情况时，会优先写入 Supabase `doctor_todos`：

- `suggestDoctor = true`
- `riskLevel = high`
- `riskLevel = emergency`

待办里会记录：

- 原始问题
- Claw 回答
- 风险等级
- 状态
- 来源

### 4. `/api/ask` 新流程

当前 `/api/ask` 处理顺序为：

1. `safety` 紧急风险拦截
2. `safety` 医疗安全边界拦截
3. Supabase FAQ
4. 本地 FAQ fallback
5. 本地知识库 / Kimi 兜底
6. fallback

其中医疗安全边界仍然始终最高优先级，不会被普通 FAQ 覆盖。

### 5. FAQ 匹配规则

数据库 FAQ 和本地 FAQ 现在共用同一套归一化与关键词匹配逻辑，支持一些口语表达归一化，例如：

- `咋 -> 怎么`
- `如何 -> 怎么`
- `登陆 -> 登录`
- `开药 / 拿药 -> 配药`
- `药没了 -> 药吃完了`
- `小程序 -> 平台`
- `健康云平台 -> 健康云`

### 6. fallback 保留策略

第三阶段仍然保留 localStorage fallback：

- Supabase 未配置时，`/ask` 仍使用本地 FAQ，不会白屏
- Supabase FAQ 读取失败时，回退本地 FAQ
- Supabase `ask_logs` 写入失败时，回退 localStorage `ask_logs`
- Supabase `doctor_todos` 写入失败时，回退 localStorage `doctor_todos`
- `/doctor` 和 `/admin` 在 Supabase 不可用时也会继续回退到本地演示数据

## 执行 SQL

### 第一阶段

- `supabase/migrations/202605050001_profiles_auth.sql`

### 第二阶段

- `supabase/migrations/202605050002_tasks_points.sql`
- `supabase/seed_tasks_points.sql`

### 第三阶段

- `supabase/migrations/202605050003_ask_faq_todos.sql`
- `supabase/seed_ask_faq_todos.sql`

执行路径：

`Supabase Dashboard -> SQL Editor -> New query -> 粘贴 SQL -> Run`

## 当前 RLS 状态

第三阶段当前采用的是可运行的 MVP 策略：

- 登录用户可以读取启用中的 FAQ
- admin 可以新增、编辑、停用 FAQ
- 用户只能读取自己的 `ask_logs`
- admin 可以读取全部 `ask_logs`
- resident 可读取与自己相关的待办
- doctor / nurse / pharmacist / community / admin 可读取工作台待办

说明：

- 当前 `doctor_todos` 为了保证 MVP 可运行，支持未分配待办由工作台侧认领处理
- 后续如果进入正式运营阶段，还需要继续细化写入权限和指派策略

## 当前仍保留本地演示版的模块

以下内容当前还没有迁入 Supabase，仍然保留 localStorage 或本地演示数据：

- `contacts`
- `group_messages`
- `courses`
- `feedbacks`
- 运行看板中的部分本地演示指标

## 当前限制

- 一部分数据仍然在 localStorage，清缓存或换设备会丢失
- 尚未接入真实医疗系统
- 尚未接入真实支付
- 当前不提供诊断、处方、停药、换药、剂量调整建议
- 数据库权限策略仍是 MVP 版本，后续需要继续强化

## 本地运行

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

生产构建检查：

```bash
npm run build
```

## 环境变量

项目当前使用以下 Supabase 环境变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

说明：

- 前两项用于前端与登录态读取
- `SUPABASE_SERVICE_ROLE_KEY` 仅在后续需要服务端高权限能力时再补充
- `.env.local` 与 `.env*.local` 不应提交
- 不要在 README、截图或提交记录里暴露真实 Key

## `.gitignore`

建议忽略：

- `node_modules`
- `.next`
- `.env.local`
- `.env*.local`
- `.vercel`

## 下一阶段建议

建议下一阶段按“内容和协同数据继续迁移”推进：

1. `contacts` 迁移到 Supabase
2. `group_messages` 迁移到 Supabase
3. `courses` 迁移到 Supabase
4. 运行看板进一步数据化
5. 更细的 RLS 与后台正式权限
