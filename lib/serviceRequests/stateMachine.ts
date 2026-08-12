import type { ServiceAction, ServiceStatus } from "@jiayi/contracts";

const targetByAction: Record<ServiceAction, ServiceStatus> = {
  submit: "submitted",
  request_info: "needs_info",
  accept: "accepted",
  check_availability: "checking_availability",
  propose_slot: "awaiting_user_confirmation",
  confirm_booking: "booked",
  update_booking: "booked",
  request_reschedule: "checking_availability",
  waitlist: "waitlisted",
  fail: "failed",
  complete: "completed",
  cancel: "cancelled",
};

const allowedActions: Record<ServiceStatus, ServiceAction[]> = {
  draft: ["submit", "cancel"],
  submitted: ["request_info", "accept", "cancel"],
  needs_info: ["submit", "cancel"],
  accepted: ["check_availability", "request_info", "cancel"],
  checking_availability: ["propose_slot", "waitlist", "fail", "cancel"],
  awaiting_user_confirmation: ["confirm_booking", "request_reschedule", "request_info", "cancel"],
  booked: ["update_booking", "complete", "cancel"],
  waitlisted: ["propose_slot", "fail", "cancel"],
  failed: [],
  completed: [],
  cancelled: [],
};

export const serviceStatusLabels: Record<ServiceStatus, string> = {
  draft: "待确认",
  submitted: "已提交",
  needs_info: "待补充信息",
  accepted: "团队已受理",
  checking_availability: "正在确认号源",
  awaiting_user_confirmation: "等待居民确认",
  booked: "预约成功",
  waitlisted: "候补中",
  failed: "暂未约成",
  completed: "服务完成",
  cancelled: "已取消",
};

export function transitionServiceStatus(current: ServiceStatus, action: ServiceAction) {
  if (!allowedActions[current].includes(action)) {
    throw new Error(`INVALID_SERVICE_TRANSITION:${current}:${action}`);
  }
  return targetByAction[action];
}

export function canTransitionServiceStatus(current: ServiceStatus, action: ServiceAction) {
  return allowedActions[current].includes(action);
}

export function getAllowedServiceActions(current: ServiceStatus) {
  return [...allowedActions[current]];
}
