import type { ServiceStatus } from "@jiayi/contracts";

type QueueInput = {
  status: ServiceStatus;
  priority: "low" | "medium" | "high" | "emergency";
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  service_type?: string;
  service_request_events?: Array<{ action?: string; created_at?: string }> | null;
};

const residentWaitingStatuses = new Set<ServiceStatus>([
  "needs_info",
  "awaiting_user_confirmation",
]);

const nextActionLabels: Partial<Record<ServiceStatus, string>> = {
  submitted: "受理或请求补充资料",
  accepted: "开始核验服务资源",
  needs_info: "等待居民补充资料",
  checking_availability: "提出时段、候补或结束办理",
  awaiting_user_confirmation: "等待居民确认时段",
  waitlisted: "继续跟进候补资源",
  booked: "补充预约凭证或完成服务",
};

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function presentQueueItem(item: QueueInput, slaHours = 8, now = new Date()) {
  const createdAt = validDate(item.created_at) ?? now;
  const updatedAt = validDate(item.updated_at) ?? createdAt;
  const acceptedEvent = item.service_request_events?.find((event) => event.action === "accept");
  const firstResponseAt = acceptedEvent?.created_at ? validDate(acceptedEvent.created_at) : null;
  const deadline = new Date(createdAt.getTime() + slaHours * 3_600_000);
  const waitingForResident = residentWaitingStatuses.has(item.status);
  const firstResponsePending = !firstResponseAt && item.status === "submitted";
  const overdue = firstResponsePending && now.getTime() > deadline.getTime();
  const staleHours = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 3_600_000));

  return {
    slaHours,
    firstResponseDeadline: deadline.toISOString(),
    firstResponsePending,
    overdue,
    waitingForResident,
    unassigned: !item.assigned_to,
    staleHours,
    needsTeamAction: !waitingForResident && !["failed", "completed", "cancelled"].includes(item.status),
    nextActionLabel: nextActionLabels[item.status] ?? "查看服务详情",
    attentionScore:
      (item.priority === "emergency" ? 100 : item.priority === "high" ? 60 : item.priority === "medium" ? 25 : 5)
      + (overdue ? 40 : 0)
      + (!item.assigned_to ? 12 : 0)
      + Math.min(staleHours, 24),
  };
}

export function summarizeQueue<T extends QueueInput & { presentation: ReturnType<typeof presentQueueItem> }>(items: T[]) {
  return {
    total: items.length,
    unassigned: items.filter((item) => item.presentation.unassigned).length,
    overdue: items.filter((item) => item.presentation.overdue).length,
    highRisk: items.filter((item) => ["high", "emergency"].includes(item.priority)).length,
    waitingForResident: items.filter((item) => item.presentation.waitingForResident).length,
    teamAction: items.filter((item) => item.presentation.needsTeamAction).length,
  };
}
