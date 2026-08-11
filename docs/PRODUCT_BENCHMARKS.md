# 家医 Claw 产品与开源借鉴台账

更新日期：2026-08-11

## 核心判断

家医 Claw 不是一个独立聊天机器人，也不是医院挂号页面的集合。它是居民、家属与家医团队之间的服务编排助手：先理解诉求，再读取已核验信息，生成待确认动作，交给官方入口或家医团队处理，最后持续追踪结果。

## 已借鉴并落地

| 参考 | 借鉴点 | 家医 Claw 落地 | 不直接照搬 |
| --- | --- | --- | --- |
| NHS App | 首页优先展示预约、处方、消息；能力取决于接入机构；支持 proxy access | 首页展示当前服务、服务对象和家医网络；无能力时明确空状态 | 英国 GP/NHS 身份与处方流程 |
| Epic MyChart / Emmie | 家庭成员切换；AI 可回答并发起预约等动作；动作前核对 | 全局“当前服务对象”；Claw 生成预约、续方、随访草稿；用户确认后写入 | Epic/Cerner/FHIR 机构连接器与美国合规流程 |
| 支付宝蚂蚁阿福 | AI 是中心入口，健康档案、报告、用药和服务围绕 AI 组织 | 首页主入口保留问 Claw；服务、健康记录和进度不是孤立栏目 | 诊断型问答、商业医疗导流和未核验推荐 |
| GOV.UK 事务设计 | 提交前 check answers；提交后显示编号、下一步和预计时间 | Claw 草稿提示、明确确认、服务时间线和响应 SLA | 视觉系统，仅借鉴事务结构 |
| Fasten Health | 以个人和家庭为中心聚合健康资料；明确数据来源边界 | 家属代办、手工健康记录、当前服务对象隔离 | 未接入中国正式数据源前不宣称自动聚合病历 |
| Medplum | 身份、临床数据、API、自动化 Bot 分层 | Skill Registry、受控工具、审计、服务状态机分层 | 首版不把国内系统强行建模成完整 FHIR |
| EasyAppointments / Cal.com | 服务、人员、工作时间和预约状态分离 | `service_catalog`、医生排班、人工确认与 `AppointmentProvider` 边界 | 无正式号源接口时不计算或展示“剩余号源” |
| 上海分级诊疗政策 | 社区首诊与家庭医生上转协同；官方挂号和家医优先转诊是两条路径 | `care_networks`、`referral_routes`、官方入口与家医协助并列 | 不在代码中虚构合作医院、绿色通道或实时优先号源 |
| Apple Health / HIG | 摘要优先、趋势突出、隐私控制；层级、和谐、克制动效和无障碍 | 小程序首页今日摘要、分段服务、语义色、按压反馈、减少动态效果 | 不复制 iOS 外观、Liquid Glass 或不存在的 HealthKit 趋势 |
| iOS Design Agent Skill | 从字体、颜色、空间、动效和景深五维审查移动端 | 统一小程序层级、分组列表、语义色和目的明确的反馈 | SwiftUI 代码不进入 Taro 运行时 |

## 开源组件边界

- LangCare MCP FHIR：借鉴临床摘要、随访任务、转诊资料、用药核对、报告解释和团队面板的 Skill 结构；不复制美国阈值和医院流程。
- OpenClaw Medical Skills：仅固定并使用许可证明确的医疗实体提取参考；中文规则与评测在本项目维护。
- BioMCP：只保留后台医学资料检索候选，不进入居民预约主链路。
- Open Wearables：保留二期适配方向，首版只接受居民确认后的手工指标。
- Fasten、Medplum、Beda EMR：用于理解家庭健康资料、权限和 FHIR 适配层，不作为首版直接依赖。
- 没有明确许可证的仓库只记录产品思路，不复制代码、提示词或文档。

## 集成式 AI 原则

1. 每次咨询都绑定一个明确的居民服务对象。
2. 本地排班、号源、库存、政策和联系方式只能来自已审核数据或正式接口。
3. 模型不直接写数据库，只返回结构化动作草稿。
4. 预约、续方、随访、转诊和健康事实必须由用户或工作人员确认。
5. 无正式号源时展示“家医协助”和预计响应，不伪装成实时预约。
6. 急症优先终止普通流程并提示 120，不能继续推荐线上服务。
7. AI 授权按居民服务对象记录，撤回后立即停止后续 AI 处理。
8. 正式环境默认不保存完整健康对话，只保留脱敏 Skill 运行和必要服务审计。
9. 跨端连续性只恢复“查询排班、生成服务草稿、安全分流”等结构化轨迹，不恢复问题和回答原文。

## 明确不做

- 不复制一个 App 内微信群；消息页承接正式通知、补资料和服务结果。
- 不做通用“症状自诊 + 推荐科室”的无边界聊天机器人。
- 不从公众号文章自动推断医生排班并直接发布。
- 不抓取或复制整篇受版权保护的公众号内容。
- 不用个人微信挂机和非官方群消息自动化。
- 不把 Demo 医生、课程、药品库存或剩余号源带入生产环境。

## 后续研究优先级

1. 与海湾镇真实家医团队访谈，验证工作队列、响应 SLA 和转诊资料字段。
2. 获得合作机构后验证健康云、医院官方挂号页和企业微信能力边界。
3. 为家属授权增加查看健康记录、代预约、接收通知等细粒度权限。
4. 评估国产 HIS/EMR 与卫健委标准的数据适配器，再决定是否引入 FHIR 中间层。

## 主要来源

- NHS App features: https://digital.nhs.uk/services/nhs-app/nhs-app-features
- NHS App proxy access: https://digital.nhs.uk/services/nhs-app/nhs-app-features/proxy-access
- Epic MyChart family access: https://www.mychart.org/l/en-us/features/family/
- Epic Emmie: https://www.epic.com/software/emmie/
- Ant Group Afu announcement: https://www.antgroup.com/news-media/press-releases/1765785600000
- GOV.UK check answers: https://design-system.service.gov.uk/patterns/check-answers/
- GOV.UK confirmation pages: https://design-system.service.gov.uk/patterns/confirmation-pages/
- Fasten Health: https://github.com/fastenhealth/fasten-onprem
- Medplum: https://github.com/medplum/medplum
- Beda EMR: https://github.com/beda-software/fhir-emr
- EasyAppointments: https://github.com/alextselegidis/easyappointments
- 上海市家庭医生签约服务规范：https://www.shanghai.gov.cn/gwk/search/content/cce2723d80034c169d573aaa4c23fd59
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines
- Apple Health: https://www.apple.com/health/
- iOS Design Agent Skill: https://github.com/vermont42/iOS-Design-Agent-Skill
