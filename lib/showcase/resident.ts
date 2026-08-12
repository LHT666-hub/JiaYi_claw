const now = Date.now();

export const residentShowcaseHome = {
  demo: true,
  profile: { id: "showcase-resident", displayName: "张阿姨", role: "resident" },
  residentId: "showcase-resident",
  careSubject: { residentId: "showcase-resident", displayName: "张阿姨", relationship: "本人", isSelf: true },
  careSubjects: [{ residentId: "showcase-resident", displayName: "张阿姨", relationship: "本人", isSelf: true }],
  access: {
    bindingStatus: "active",
    canSubmitService: false,
    canStoreHealthData: false,
    message: "当前为只读展示，正式服务需登录并由社区核验。",
  },
  careBinding: { id: "showcase-binding", status: "active", communityId: "showcase-community" },
  network: {
    id: "showcase-network",
    name: "海湾镇家医协作网络（展示）",
    description: "居民绑定社区与家医团队后，由团队协助判断社区处理或上转。",
    community_id: "showcase-community",
    community: { name: "海湾镇社区卫生服务中心（展示）", service_phone: "以机构核验信息为准" },
    institutions: [
      {
        id: "showcase-community-institution",
        name: "海湾镇社区卫生服务中心（展示）",
        institution_type: "community_health_center",
        level_label: "社区首诊",
        network_role: "primary_care",
        registration_url: null,
      },
      {
        id: "showcase-referral-institution",
        name: "协作上转医院（待机构配置）",
        institution_type: "tertiary_hospital",
        level_label: "二三级医院",
        network_role: "referral",
        registration_url: null,
      },
    ],
  },
  serviceRequests: [
    { id: "showcase-request", title: "家庭医生门诊预约", status: "awaiting_user_confirmation", updated_at: new Date(now - 35 * 60_000).toISOString() },
  ],
  notifications: [
    { id: "showcase-notification", is_read: false },
  ],
  serviceCatalog: [
    { id: "showcase-family-doctor", service_type: "family_doctor_booking", name: "家医预约", description: "由家医团队确认服务方式与时间", service_hours: "工作日服务", access_mode: "team_assisted", official_url: null, response_sla_hours: 4, availability_note: "展示模式不提交申请" },
    { id: "showcase-registration", service_type: "clinic_registration", name: "门诊挂号", description: "查看官方入口或请家医团队协助", service_hours: "以机构通知为准", access_mode: "team_assisted", official_url: null, response_sla_hours: 4, availability_note: "不声称拥有实时号源" },
    { id: "showcase-referral", service_type: "referral_assistance", name: "转诊协助", description: "社区首诊后由团队整理上转资料", service_hours: "工作日服务", access_mode: "team_assisted", official_url: null, response_sla_hours: 8, availability_note: "由工作人员人工审核" },
    { id: "showcase-followup", service_type: "followup_reminder", name: "随访服务", description: "提交随访需求并跟踪团队回复", service_hours: "按签约团队安排", access_mode: "team_assisted", official_url: null, response_sla_hours: 8, availability_note: "展示模式不保存健康信息" },
  ],
  healthSummary: null,
  assistant: { lastActivity: null, lastActivityAt: null, retentionDays: 30, rawTranscriptStored: false },
  schedules: [
    {
      id: "showcase-schedule",
      starts_at: new Date(now + 24 * 60 * 60_000).toISOString(),
      ends_at: new Date(now + 26 * 60 * 60_000).toISOString(),
      location: "全科门诊（展示）",
      practitioner: { name: "家医团队医生", title: "全科医师", specialties: ["慢病随访", "常见病服务导航"] },
      department: { name: "全科门诊" },
      institution: { name: "海湾镇社区卫生服务中心（展示）" },
    },
  ],
  content: [
    { id: "showcase-activity", category: "activity", title: "社区健康活动信息示例", summary: "正式内容由机构公众号或官网导入，审核通过后发布。", source_name: "机构审核内容（展示）", original_url: "/public-info" },
    { id: "showcase-classroom", category: "health_classroom", title: "家医小课堂：家庭血压记录方法", summary: "演示健康教育内容的来源、摘要和原文入口。", source_name: "家医团队（展示）", original_url: "/public-info" },
  ],
} as const;

export const residentShowcaseMessages = {
  demo: true,
  messages: [
    { id: "showcase-message-1", type: "service_progress", title: "家医团队提出可选时段", content: "请确认明天下午的家庭医生门诊时段；展示模式不会执行确认。", link_url: "/appointments", is_read: false, created_at: new Date(now - 35 * 60_000).toISOString() },
    { id: "showcase-message-2", type: "activity", title: "社区活动通知示例", content: "机构审核后的义诊、体检和慢病活动会在这里通知。", link_url: "/services?tab=content", is_read: true, created_at: new Date(now - 4 * 60 * 60_000).toISOString() },
  ],
  channelBindings: [],
};

export const residentShowcaseMe = {
  demo: true,
  profile: { id: "showcase-resident", display_name: "张阿姨", role: "resident", phone: null },
  residentId: "showcase-resident",
  network: residentShowcaseHome.network,
  access: residentShowcaseHome.access,
  careBinding: residentShowcaseHome.careBinding,
  consents: [
    { scope: "privacy", granted: true },
    { scope: "notification", granted: true },
  ],
  observations: [],
  serviceRequests: residentShowcaseHome.serviceRequests,
  channelBindings: [],
  familyBindings: [],
};
