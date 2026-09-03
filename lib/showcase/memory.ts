const now = Date.now();
const iso = (offsetHours = 0) => new Date(now + offsetHours * 3_600_000).toISOString();

export const memoryShowcaseResident = {
  residentId: "showcase-resident",
  careSubject: {
    residentId: "showcase-resident",
    displayName: "张阿姨",
    relationship: "本人",
    isSelf: true,
  },
};

export const memoryShowcaseCandidates = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    memory_type: "symptom_report",
    content: { symptom: "最近一周早晨偶尔头晕", note: "通常起床后几分钟缓解" },
    confidence: 0.86,
    source_type: "assistant_extraction",
    evidence_level: "self_reported",
    occurred_at: iso(-24),
    confirmation_status: "pending",
    created_at: iso(-18),
    updated_at: iso(-18),
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    memory_type: "medication_statement",
    content: { medication: "苯磺酸氨氯地平片", dosage: "5mg", frequency: "每日一次" },
    confidence: 0.78,
    source_type: "assistant_extraction",
    evidence_level: "self_reported",
    occurred_at: iso(-72),
    confirmation_status: "pending",
    created_at: iso(-12),
    updated_at: iso(-12),
  },
];

export const memoryShowcaseItems = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    memory_type: "allergy_self_reported",
    content: { allergen: "青霉素", note: "本人自述曾出现皮疹，尚待医生核验" },
    confidence: 0.9,
    evidence_level: "self_reported",
    occurred_at: iso(-720),
    valid_from: iso(-720),
    valid_to: null,
    last_verified_at: iso(-168),
    confirmation_status: "user_confirmed",
    created_at: iso(-720),
    updated_at: iso(-168),
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    memory_type: "daily_living",
    content: { activity: "晚饭后散步", detail: "每周约 4 次，每次 30 分钟" },
    confidence: 0.84,
    evidence_level: "self_reported",
    occurred_at: iso(-120),
    valid_from: iso(-120),
    valid_to: null,
    last_verified_at: iso(-48),
    confirmation_status: "user_confirmed",
    created_at: iso(-120),
    updated_at: iso(-48),
  },
];

export const memoryShowcasePreferences = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    preference_type: "contact_channel",
    structured_value: "优先微信消息，紧急事项电话联系",
    source_type: "manual",
    source_ref: null,
    confirmation_status: "user_confirmed",
    status: "active",
    valid_from: iso(-240),
    valid_to: null,
    last_verified_at: iso(-24),
    created_at: iso(-240),
    updated_at: iso(-24),
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    preference_type: "preferred_time",
    structured_value: "工作日上午 9:00 至 11:00",
    source_type: "manual",
    source_ref: null,
    confirmation_status: "user_confirmed",
    status: "active",
    valid_from: iso(-168),
    valid_to: null,
    last_verified_at: iso(-24),
    created_at: iso(-168),
    updated_at: iso(-24),
  },
];

export const memoryShowcaseTimeline = [
  { date: iso(-4), event: "晨间血压 138/86 mmHg", source: "self_reported", type: "blood_pressure", observationId: "90000000-0000-4000-8000-000000000001" },
  { date: iso(-24), event: "记录早晨偶尔头晕，等待本人确认", source: "self_reported", type: "symptom_report", memoryId: "a0000000-0000-4000-8000-000000000001" },
  { date: iso(-48), event: "家医团队完成慢病随访", source: "clinician_verified", type: "follow_up" },
  { date: iso(-72), event: "体重 63.5 kg", source: "self_reported", type: "weight", observationId: "90000000-0000-4000-8000-000000000002" },
];

export const memoryShowcaseContext = {
  generatedAt: iso(),
  summary: "居民已确认青霉素过敏自述、日常步行习惯和联系偏好；近期有待确认的晨起头晕与用药信息。",
  safetyNotice: "仅用于服务协同和接诊前资料整理，不作为诊断或处方依据。",
  memories: memoryShowcaseItems,
  preferences: memoryShowcasePreferences,
};

