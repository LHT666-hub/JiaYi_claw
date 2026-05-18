# 家医 Claw

家医 Claw 是一个面向老年慢病居民的手机端家庭医生服务导航原型。当前仓库同时保留本地演示能力，以及分阶段接入 Supabase 的数据化能力，适合做产品演示、角色演练和阶段联调。

## 当前阶段

- 产品版本：`家医 Claw V2.5`
- 数据化进度：
  - `V2 第二阶段已完成`：`tasks + task_records + points_ledger + exchanges`
  - `V2 第三阶段已完成`：`faqs + ask_logs + doctor_todos + /api/ask + /doctor + /admin FAQ 管理`
  - `V2.5 第一阶段已完成`：`contacts + courses + course_views + group_leaders + leader_matches`
  - `V2.5 第二阶段已完成`：`notifications` 通知中心 / 提醒系统

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
- 演示中心 `/demo-center`（全页面入口、推荐演示路线、演示数据工具）
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
3. 问候语快速回复
4. FAQ 命中后交由 Kimi 组织最终答复（`faq_kimi`）
5. 知识库命中后由 Kimi 基于知识片段答复（`knowledge_kimi`）
6. 其他问题直接由 Kimi 生成答复（`kimi`）
7. Kimi 异常时 fallback

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

### V2.5 第一阶段

- `supabase/migrations/202605050004_contacts_courses_leaders.sql`
- `supabase/seed_contacts_courses_leaders.sql`

### V2.5 第二阶段

- `supabase/migrations/202605050005_notifications.sql`

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

## V2.5 第一阶段说明

本阶段将联系人、小课堂、小组长匹配迁移到 Supabase。

### 新增表

| 表名 | 用途 |
|------|------|
| `contacts` | 居民一键找人联系人（is_primary 字段已补充），RLS 按 resident_id/contact_user_id 限制 |
| `courses` | 家医小课堂内容，新增 `status` 字段（draft/review/published/disabled）替代 is_active |
| `course_views` | 居民课程观看记录，含每日防重复唯一索引，同时写 points_ledger |
| `group_leaders` | 楼组长、健康小组长、居委支持人数据 |
| `leader_matches` | 居民小组长匹配结果（评分、原因、需求、是否选中） |

### 新增 API

- `GET /api/contacts` — 读取当前居民联系人
- `GET /api/courses` — 读取已发布课程（admin 读全部）
- `POST /api/courses` — admin 新增课程
- `PATCH /api/courses` — admin 编辑/停用课程
- `POST /api/courses/view` — 记录课程观看，同时写 points_ledger（source_type = 'course'）
- `POST /api/leaders/match` — 接收匹配表单，读取 group_leaders 评分，写入 leader_matches，返回 Top 3
- `POST /api/leaders/select` — 选择小组长，更新 is_selected，可同步写入 contacts

### 小组长匹配升级路径

1. 前端 7 步表单提交后，优先调用 `/api/leaders/match`
2. API 从 `group_leaders` 表读取数据，使用规则评分（同社区 +30、慢性病 +25、手机操作 +25 等）
3. 评分结果写入 `leader_matches` 表，返回 Top 3
4. 用户选择小组长时调用 `/api/leaders/select`，同时写 localStorage fallback
5. Supabase 不可用时，自动使用本地 `data/groupLeaders.ts` + `lib/matchLeader.ts` 评分

### 执行 SQL

```
# 在 Supabase Dashboard -> SQL Editor 中依次执行：
supabase/migrations/202605050004_contacts_courses_leaders.sql
supabase/seed_contacts_courses_leaders.sql
```

### RLS 策略

- `contacts`: resident 读自己的联系人，contact_user_id 关联用户可读，admin 全权限
- `courses`: 所有登录用户可读 published 课程，admin 可管理
- `course_views`: resident 读自己的记录，插入限本人或 admin
- `group_leaders`: 所有登录用户可读 active 数据，admin 可管理
- `leader_matches`: resident 读自己的匹配记录，admin 可读全部

> 后续需要加强：按 resident_id scope 细化 insert 策略、service_role 写入路径。

## V2.5 第二阶段说明

本阶段实现全站通知中心 / 提醒系统。

### 新增表

| 表名 | 用途 |
|------|------|
| `notifications` | 全角色通知（9 种类型），RLS 按 user_id 限制读写 |

### 通知类型

| type | 中文标签 | 触发场景 |
|------|---------|---------|
| `ask_todo_created` | 家医提醒 | 问 Claw 产生高风险/建议联系医生时 |
| `doctor_todo_status_changed` | 处理进度 | 医生/护士更新待办状态为处理中/已处理时 |
| `task_completed` | 任务完成 | 完成健康任务时 |
| `points_changed` | 积分变动 | 观看课程获得积分时 |
| `course_recommended` | 课程推荐 | 预留，可由 admin 触发 |
| `leader_matched` | 小组匹配 | 选择小组长时 |
| `group_notice` | 群组通知 | 预留，可由群管理触发 |
| `exchange` | 积分兑换 | 积分兑换成功时 |
| `system` | 系统通知 | 预留，admin 可创建 |

### 新增/修改 API

- `GET /api/notifications` — 读取通知列表（支持 unreadOnly、limit 参数）
- `PATCH /api/notifications` — 标记已读（单条或全部）
- `POST /api/notifications` — 创建通知（admin 可指定 userId）

### 通知入口

- 首页 TopBar 铃铛：动态未读红点
- `/me` 页：设置区新增「通知中心」入口
- `/doctor` 页：右上角铃铛图标

### localStorage fallback

- key：`jiayi_notifications`
- 结构：`LocalNotification[]`
- Supabase 不可用时，通知页和未读计数回退到 localStorage

### 执行 SQL

```
supabase/migrations/202605050005_notifications.sql
```

### RLS 策略

- 用户读取自己的通知
- admin 可读取全部
- 用户可插入自己的通知
- 用户可更新自己的通知（标记已读）

## 当前仍保留本地演示版的模块

以下内容当前还没有迁入 Supabase，仍然保留 localStorage 或本地演示数据：

- `group_messages`（群聊消息已有部分 Supabase 支持）
- `feedbacks`
- `jiayi_family_bindings`（家属绑定的浏览器兜底数据）
- `jiayi_todo_status_events`（服务进度状态轨迹的浏览器兜底数据）
- 运行看板中的部分本地演示指标

## 家属绑定

新增 `family_bindings` 表用于记录居民与家属之间的协助关系。家属端 `/family` 会读取绑定关系，展示绑定老人的健康任务完成情况、当前积分、待处理提醒、医生待办状态和联系人入口。

执行顺序：

```bash
supabase/migrations/202605050006_family_bindings.sql
supabase/seed_family_bindings.sql
```

`seed_family_bindings.sql` 是模板文件，需要先在 `auth.users` 中找到 `resident@test.com` 和 `family@test.com` 的 user id，再替换模板里的 UUID。

权限边界：

- resident 可以查看自己绑定的家属联系人。
- family 可以查看自己绑定的老人、任务状态、积分、提醒和服务进度。
- admin 可以查看、新增、修改和停用绑定关系。
- MVP 阶段家属只读，不能替老人完成任务获得积分，不能修改医疗信息，不能删除医生待办，不能修改后台内容，也不能直接替医生处理问题。

数据读取策略：

- 有 Supabase 登录和表结构时，优先读取 `family_bindings`。
- Supabase 不可用或演示身份下，使用浏览器本地 `jiayi_family_bindings`。
- 默认演示数据保留“张阿姨女儿 绑定 张阿姨”，关系为“女儿”。

## V2.5 服务进度

`doctor_todos` 不再只在医生端工作台显示，也会在居民端和家属端回显处理进度。

页面用途：

- `/service-progress`：居民查看自己的全部处理记录，家属查看绑定老人的处理进度
- `/me`：居民查看最近 3 条服务进度
- `/family`：家属在老人卡片里查看待处理数量、最近一条状态，并进入服务进度页

新增表：

- `todo_status_events`：记录待办状态变化历史，供居民端展示状态轨迹

执行顺序：

```bash
supabase/migrations/202605050007_todo_status_events.sql
```

权限边界：

- resident 可以查看自己的服务进度和状态轨迹
- family 只能查看绑定老人的服务进度，不能修改状态、不能删除待办、不能代替医生处理
- doctor / nurse / pharmacist / community 可以更新工作台待办状态
- admin 可以查看全部服务进度

数据读取策略：

- Supabase 可用时，优先读取 `doctor_todos` 与 `todo_status_events`
- Supabase 不可用时，前端回退到 `jiayi_doctor_todos` 与 `jiayi_todo_status_events`
- 居民端只显示服务状态、协助说明、建议准备的材料，不显示诊断结果

## 当前限制

- 一部分数据仍然在 localStorage，清缓存或换设备会丢失
- 家属绑定处于 MVP 阶段，仅支持只读协助视图
- 服务进度当前不接真实诊疗系统
- 服务进度不显示诊断结果
- 服务进度不提供处方、停药、换药或剂量调整建议
- 尚未接入真实身份证
- 尚未接入真实手机号验证
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

## 演示串讲建议（新版）

可通过 `/demo-center` 快速完成整套演示：

1. 进入“推荐演示路线”选择居民/家属/团队/后台场景。
2. 如需回到干净状态，点击“一键重置演示数据”。
3. 如需展示闭环，点击“生成高风险闭环案例”，再进入 `/doctor`、`/service-progress`、`/notifications` 观察联动。

生产构建检查：

```bash
npm run build
```

## 环境变量

项目当前使用以下环境变量：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-8k
```

说明：

- 前两项用于前端与登录态读取
- `SUPABASE_SERVICE_ROLE_KEY` 仅在后续需要服务端高权限能力时再补充
- `KIMI_API_KEY` 用于 `/api/ask` 的 Kimi 生成（未配置时会自动走 fallback）
- `KIMI_MODEL` 建议先用 `moonshot-v1-8k`，接口会在模型不可用时自动降级尝试
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

1. `group_messages` 进一步完善 Supabase 支持
2. 运行看板进一步数据化（读取 Supabase 统计而非仅 localStorage）
3. 更细的 RLS 与后台正式权限
4. `feedbacks` 迁移到 Supabase
5. 小课堂管理在 admin 页面支持 Supabase 写入
