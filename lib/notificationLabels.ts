import type { NotificationType } from "@/lib/types";

export const notificationTypeLabels: Record<NotificationType, string> = {
  ask_todo_created: "家医提醒",
  todo_status_changed: "处理进度",
  task_completed: "健康小事",
  points_changed: "积分变动",
  exchange: "积分兑换",
  family_binding_created: "家属绑定",
  leader_matched: "小组长匹配",
  course_recommended: "小课堂推荐",
  group_notice: "小组通知",
  system: "系统提醒",
};

export const notificationTypeAccent: Record<NotificationType, "navy" | "sage" | "amber"> = {
  ask_todo_created: "navy",
  todo_status_changed: "navy",
  task_completed: "sage",
  points_changed: "amber",
  exchange: "amber",
  family_binding_created: "navy",
  leader_matched: "sage",
  course_recommended: "sage",
  group_notice: "navy",
  system: "navy",
};

export function getNotificationLabel(type: string): string {
  return notificationTypeLabels[type as NotificationType] ?? "消息提醒";
}

export function getNotificationAccent(type: string): "navy" | "sage" | "amber" {
  return notificationTypeAccent[type as NotificationType] ?? "navy";
}
