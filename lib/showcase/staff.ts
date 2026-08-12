import { presentQueueItem, summarizeQueue } from "@/lib/workbench/queuePresentation";

const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

const rawRequests = [
  {
    id: "showcase-request-overdue",
    title: "门诊挂号协助",
    summary: "居民希望预约心内科门诊，已填写偏好时间，等待团队受理。",
    status: "submitted" as const,
    priority: "high" as const,
    service_type: "clinic_registration",
    created_at: hoursAgo(6),
    updated_at: hoursAgo(6),
    assigned_to: null,
    resident: { id: "showcase-resident-1", display_name: "张阿姨", phone: "138****0021" },
    appointment_details: [{ target: "三级医院门诊", department: "心内科", preferred_dates: ["明天下午"] }],
    service_request_events: [{ id: "showcase-event-1", action: "submit", note: "居民已确认提交", new_status: "submitted", created_at: hoursAgo(6) }],
  },
  {
    id: "showcase-request-processing",
    title: "分级转诊协助",
    summary: "社区首诊后需要整理上转资料，正在核验协作机构和科室。",
    status: "checking_availability" as const,
    priority: "medium" as const,
    service_type: "referral_assistance",
    created_at: hoursAgo(5),
    updated_at: hoursAgo(1),
    assigned_to: "showcase-doctor",
    resident: { id: "showcase-resident-2", display_name: "王叔叔", phone: "139****0618" },
    assignee: { id: "showcase-doctor", display_name: "李医生", role: "doctor" },
    appointment_details: [{ target: "协作医院", department: "内分泌科" }],
    service_request_events: [{ id: "showcase-event-2", action: "accept", note: "已受理", new_status: "accepted", created_at: hoursAgo(4) }],
  },
  {
    id: "showcase-request-waiting",
    title: "家庭医生预约",
    summary: "已提出明天下午电话随访时段，等待居民确认。",
    status: "awaiting_user_confirmation" as const,
    priority: "low" as const,
    service_type: "family_doctor_booking",
    created_at: hoursAgo(3),
    updated_at: hoursAgo(0.5),
    assigned_to: "showcase-doctor",
    resident: { id: "showcase-resident-3", display_name: "陈女士", phone: "136****7028" },
    assignee: { id: "showcase-doctor", display_name: "李医生", role: "doctor" },
    appointment_details: [{ target: "家庭医生", scheduled_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(), institution_name: "海湾镇社区卫生服务中心（展示）" }],
    service_request_events: [{ id: "showcase-event-3", action: "propose_slot", note: "已提出随访时段", new_status: "awaiting_user_confirmation", created_at: hoursAgo(0.5) }],
  },
];

export const staffShowcaseRequests = rawRequests.map((item) => ({
  ...item,
  presentation: presentQueueItem(item, 4, now),
})).sort((a, b) => b.presentation.attentionScore - a.presentation.attentionScore);

export const staffShowcaseQueue = {
  demo: true,
  profile: { id: "showcase-doctor", role: "doctor", displayName: "李医生" },
  summary: summarizeQueue(staffShowcaseRequests),
  requests: staffShowcaseRequests,
};

export const staffShowcaseFacts = {
  demo: true,
  candidates: [
    {
      id: "showcase-fact-1",
      fact_type: "health_observation",
      structured_value: { type: "blood_pressure", value: "148/92", measuredAt: "今天早晨" },
      confidence: 0.82,
      status: "pending",
      created_at: hoursAgo(2),
      resident_id: "showcase-resident-1",
      resident: { id: "showcase-resident-1", display_name: "张阿姨", phone: "138****0021" },
    },
  ],
};
