import { NotificationItem } from "@/lib/types";

export const notifications: NotificationItem[] = [
  {
    id: "notification-followup",
    category: "随访提醒",
    title: "请确认本周三上午的慢病随访",
    description: "王护士已发来随访确认，请回复是否能按时参加。",
    href: "/followup",
    accent: "navy",
  },
  {
    id: "notification-group",
    category: "健康小组",
    title: "王阿姨提醒今天记得量一次血压",
    description: "高血压互助小组已有 12 位邻居完成打卡。",
    href: "/group",
    accent: "sage",
  },
  {
    id: "notification-course",
    category: "家医小课堂",
    title: "今天推荐课程：高血压药为什么不能随便停？",
    description: "看完课程可获得 5 分，请按完成进度领取。",
    href: "/courses?autoplay=course-01&mode=play",
    accent: "amber",
  },
];
