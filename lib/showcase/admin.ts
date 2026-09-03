const now = Date.now();
const iso = (offsetHours = 0) => new Date(now + offsetHours * 3_600_000).toISOString();

export const showcaseIds = {
  organization: "10000000-0000-4000-8000-000000000001",
  community: "10000000-0000-4000-8000-000000000002",
  network: "10000000-0000-4000-8000-000000000003",
  communityInstitution: "10000000-0000-4000-8000-000000000004",
  referralInstitution: "10000000-0000-4000-8000-000000000005",
  department: "10000000-0000-4000-8000-000000000006",
  practitioner: "10000000-0000-4000-8000-000000000007",
  group: "10000000-0000-4000-8000-000000000008",
} as const;

export const adminShowcaseOverview = {
  demo: true,
  metrics: {
    serviceRequests: 28,
    pendingRequests: 7,
    staff: 9,
    publishedContent: 16,
    contentToReview: 3,
    factsToReview: 2,
    verifiedSchedules: 6,
    activeChannels: 1,
  },
};

export const adminShowcaseStaff = {
  demo: true,
  communities: [{ id: showcaseIds.community, name: "海湾镇社区（演示）" }],
  staff: [
    { id: "20000000-0000-4000-8000-000000000001", display_name: "李医生", role: "doctor", phone: "138****0021", community_id: showcaseIds.community, account_status: "active", created_at: iso(-240) },
    { id: "20000000-0000-4000-8000-000000000002", display_name: "王护士", role: "nurse", phone: "139****0618", community_id: showcaseIds.community, account_status: "active", created_at: iso(-180) },
    { id: "20000000-0000-4000-8000-000000000003", display_name: "陈药师", role: "pharmacist", phone: "136****7028", community_id: showcaseIds.community, account_status: "active", created_at: iso(-120) },
    { id: "20000000-0000-4000-8000-000000000004", display_name: "社区张老师", role: "community", phone: "137****1136", community_id: showcaseIds.community, account_status: "active", created_at: iso(-96) },
  ],
  invites: [
    { id: "20000000-0000-4000-8000-000000000005", display_name: "赵医生", role: "doctor", phone: "135****9086", community_id: showcaseIds.community, status: "pending", expires_at: iso(24), created_at: iso(-2) },
  ],
};

export const adminShowcaseCatalog = {
  demo: true,
  items: [
    { id: "30000000-0000-4000-8000-000000000001", service_type: "clinic_registration", name: "门诊挂号协助", description: "由家医团队核对科室和就诊需求后协助办理", owner_role: "community", required_fields: ["target", "preferredDates", "contactPhone"], service_hours: "工作日 8:00-17:00", access_mode: "hybrid", official_url: "https://www.shanghai.gov.cn/", response_sla_hours: 4, availability_note: "不承诺实时号源，以官方平台和人工回写为准", active: true },
    { id: "30000000-0000-4000-8000-000000000002", service_type: "family_doctor_booking", name: "家庭医生预约", description: "预约签约团队门诊、电话或上门随访", owner_role: "doctor", required_fields: ["preferredDates", "serviceMode"], service_hours: "工作日服务", access_mode: "team_assisted", official_url: null, response_sla_hours: 4, availability_note: "由团队确认服务方式和时间", active: true },
    { id: "30000000-0000-4000-8000-000000000003", service_type: "referral_assistance", name: "分级转诊协助", description: "社区首诊后整理资料并协助对接上转科室", owner_role: "doctor", required_fields: ["symptoms", "target"], service_hours: "工作日服务", access_mode: "team_assisted", official_url: null, response_sla_hours: 8, availability_note: "必须经过家医团队人工审核", active: true },
    { id: "30000000-0000-4000-8000-000000000004", service_type: "refill_request", name: "续方配药申请", description: "整理药品和余量，由医生与药师人工处理", owner_role: "pharmacist", required_fields: ["medicineName", "stockLeft"], service_hours: "工作日服务", access_mode: "team_assisted", official_url: null, response_sla_hours: 8, availability_note: "AI 不开方、不调药", active: true },
  ],
};

export const adminShowcaseCareNetwork = {
  demo: true,
  networks: [{ id: showcaseIds.network, name: "海湾镇分级诊疗协作网络（演示）", organization_id: showcaseIds.organization, community_id: showcaseIds.community, status: "active" }],
  institutions: [
    { id: showcaseIds.communityInstitution, name: "海湾镇社区卫生服务中心（演示）", institution_type: "community", level_label: "社区首诊", organization_id: showcaseIds.organization, official_url: "https://www.shanghai.gov.cn/" },
    { id: showcaseIds.referralInstitution, name: "协作三级医院（演示）", institution_type: "tertiary", level_label: "三级医院", organization_id: showcaseIds.organization, official_url: "https://www.shanghai.gov.cn/" },
  ],
  departments: [{ id: showcaseIds.department, institution_id: showcaseIds.referralInstitution, name: "心内科", specialties: ["高血压", "冠心病"] }],
  practitioners: [{ id: showcaseIds.practitioner, institution_id: showcaseIds.communityInstitution, department_id: null, name: "李医生", title: "主治医师", specialties: ["慢病管理", "老年健康"] }],
  referralRoutes: [{ id: "10000000-0000-4000-8000-000000000009", care_network_id: showcaseIds.network, from_institution_id: showcaseIds.communityInstitution, to_institution_id: showcaseIds.referralInstitution, to_department_id: showcaseIds.department, name: "心血管问题上转路径", problem_tags: ["胸痛", "血压持续异常"] }],
};

export const adminShowcaseContent = {
  demo: true,
  sources: [
    { id: "40000000-0000-4000-8000-000000000001", name: "社区卫生服务中心官方发布（演示）", source_type: "wechat_article", source_url: "https://mp.weixin.qq.com/", institution_id: showcaseIds.communityInstitution, active: true, last_error: null },
    { id: "40000000-0000-4000-8000-000000000002", name: "上海市卫生健康委员会（演示）", source_type: "official_website", source_url: "https://wsjkw.sh.gov.cn/", institution_id: null, active: true, last_error: null },
  ],
  institutions: adminShowcaseCareNetwork.institutions,
  candidates: [{ id: "40000000-0000-4000-8000-000000000003", title: "家庭医生健康活动通知（演示）", category: "activity", status: "candidate", source_name: "社区卫生服务中心官方发布（演示）", created_at: iso(-3) }],
};

export const adminShowcaseChannels = {
  demo: true,
  accounts: [{ id: "50000000-0000-4000-8000-000000000001", name: "海湾镇家医企业微信（演示）", corp_id: "ww-demo-masked", agent_id: "1000002", receive_capability: "outbound_only", status: "active", created_at: iso(-168) }],
  groups: [{ id: showcaseIds.group, name: "高血压家医服务群（演示）", external_group_id: "wr-demo-masked", status: "active", channel_account_id: "50000000-0000-4000-8000-000000000001" }],
  callbackConfigured: false,
  outboundConfigured: true,
};

export const adminShowcaseAudit = {
  demo: true,
  logs: [
    { id: "60000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000004", action: "service_request.accepted", target_table: "service_requests", target_id: "showcase-request-processing", detail: { note: "工作人员受理服务申请（演示）" }, created_at: iso(-1), organization_id: showcaseIds.organization, community_id: showcaseIds.community, actor: { display_name: "社区张老师", role: "community" } },
    { id: "60000000-0000-4000-8000-000000000002", actor_id: "20000000-0000-4000-8000-000000000001", action: "clinical_brief.reviewed", target_table: "clinical_briefs", target_id: "showcase-brief", detail: { note: "医生审核接诊前摘要（演示）" }, created_at: iso(-2), organization_id: showcaseIds.organization, community_id: showcaseIds.community, actor: { display_name: "李医生", role: "doctor" } },
  ],
};

export const adminShowcaseFeedback = {
  demo: true,
  feedback: [{ id: "70000000-0000-4000-8000-000000000001", category: "service", content: "希望预约进度里能更清楚地显示下一步由谁处理。", contact_allowed: true, page_path: "/service-progress", status: "open", resolution_note: null, created_at: iso(-5), updated_at: iso(-5), user: { display_name: "张阿姨女儿", phone: "138****9066" }, resident: { display_name: "张阿姨" } }],
};

export const adminShowcaseRagStatus = {
  demo: true,
  documentCount: 42,
  activeCount: 39,
  failedDocumentCount: 1,
  openJobCount: 2,
  failures: [{ id: "80000000-0000-4000-8000-000000000001", source_type: "content_item", source_id: "expired-demo", last_error: "来源已过期，等待重新核验", completed_at: iso(-12) }],
  embeddingProvider: "openai-compatible",
};

export const adminShowcaseReadiness = {
  demo: true,
  checks: [
    { id: "app", label: "居民端与工作台", detail: "Web、H5 和小程序演示构建可用。", status: "ready", action: null },
    { id: "database", label: "正式境内数据库", detail: "当前仅为合成数据演示，尚未接入正式居民数据库。", status: "blocked", action: "完成境内部署、备份、RLS 与灾备验收。" },
    { id: "sms", label: "短信验证码", detail: "登录界面已完成，正式短信签名与模板尚未配置。", status: "blocked", action: "申请腾讯云短信资质、签名和模板。" },
    { id: "wechat", label: "微信小程序", detail: "代码可构建，正式 AppID、合法域名和隐私审核待完成。", status: "pending", action: "完成主体认证并提交微信审核。" },
    { id: "ai", label: "Agent 与安全分流", detail: "阿里云百炼文本、视觉与向量模型已接通，受控 Skill、RAG 和安全分类链路可展示。", status: "ready", action: null },
    { id: "pilot", label: "机构试点协议", detail: "演示数据不代表已获得医院或社区系统接口。", status: "blocked", action: "确定试点机构、责任人、服务目录和数据处理协议。" },
  ],
  summary: { ready: 2, pending: 1, blocked: 3, total: 6 },
};

export function demoMutation(data: Record<string, unknown> = {}) {
  return { demo: true, simulated: true, ...data };
}
