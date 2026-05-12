import { TaskItem } from "@/lib/types";

export const tasks: TaskItem[] = [
  {
    id: "task-medicine-am",
    title: "早饭后服药",
    description: "按医生既往安排完成今日早饭后服药打卡。",
    category: "medicine",
    points: 5,
  },
  {
    id: "task-pressure-record",
    title: "记录一次血压",
    description: "量完血压后完成一次记录，便于后续随访查看。",
    category: "record",
    points: 5,
  },
  {
    id: "task-followup-confirm",
    title: "完成随访确认",
    description: "收到随访通知后，确认时间或回复需要协助。",
    category: "followup",
    points: 10,
  },
  {
    id: "task-course-preview",
    title: "看 3 分钟小课堂",
    description: "学习一条家医小课堂，了解慢病日常管理重点。",
    category: "course",
    points: 8,
  },
  {
    id: "task-group-reply",
    title: "进群回复一句",
    description: "在健康小组里打个卡，告诉大家今天状态。",
    category: "group",
    points: 4,
  },
  {
    id: "task-family-share",
    title: "和家人说一次本周安排",
    description: "把体检、随访或配药安排告诉家属联系人。",
    category: "followup",
    points: 5,
  },
  {
    id: "task-sugar-record",
    title: "记录一次血糖",
    description: "如果家中有监测条件，可完成一次血糖记录。",
    category: "record",
    points: 6,
  },
  {
    id: "task-water",
    title: "午后喝水提醒",
    description: "完成一次健康喝水提醒，养成规律习惯。",
    category: "record",
    points: 3,
  },
  {
    id: "task-evening-walk",
    title: "晚饭后散步 15 分钟",
    description: "量力而行进行适度活动，并留意自身感受。",
    category: "group",
    points: 6,
  },
  {
    id: "task-pillbox-check",
    title: "检查药盒余量",
    description: "看一看常用慢病药还剩多少，避免临时断药。",
    category: "medicine",
    points: 4,
  },
];
