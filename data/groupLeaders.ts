export type GroupLeader = {
  id: string;
  name: string;
  age: number;
  area: string;
  building: string;
  chronicTags: string[];
  strengths: string[];
  description: string;
  phoneHelp: boolean;
  elderCare: boolean;
  healthCheckHelp: boolean;
  checkInActive: boolean;
  antiScam: boolean;
  avatarColor: string;
};

export const groupLeaders: GroupLeader[] = [
  {
    id: "leader-wang",
    name: "王阿姨",
    age: 68,
    area: "海湾社区",
    building: "3号楼",
    chronicTags: ["高血压", "糖尿病"],
    strengths: ["打卡提醒", "群聊活跃", "用药经验分享"],
    description: "社区健康小组组长，擅长带动邻居坚持健康打卡，每天早上提醒大家量血压。",
    phoneHelp: true,
    elderCare: true,
    healthCheckHelp: true,
    checkInActive: true,
    antiScam: true,
    avatarColor: "#C47A5A",
  },
  {
    id: "leader-li",
    name: "李叔叔",
    age: 72,
    area: "海湾社区",
    building: "5号楼",
    chronicTags: ["高血压", "冠心病"],
    strengths: ["运动指导", "健康知识", "邻里互助"],
    description: "退休体育老师，热心帮助邻居做适合老年人的运动。",
    phoneHelp: false,
    elderCare: true,
    healthCheckHelp: true,
    checkInActive: true,
    antiScam: false,
    avatarColor: "#5A7A94",
  },
  {
    id: "leader-zhang",
    name: "居委张老师",
    age: 55,
    area: "海湾社区",
    building: "1号楼",
    chronicTags: [],
    strengths: ["政策咨询", "登记协助", "活动组织"],
    description: "居委会工作人员，负责社区健康活动组织和登记协助。",
    phoneHelp: true,
    elderCare: false,
    healthCheckHelp: true,
    checkInActive: false,
    antiScam: true,
    avatarColor: "#6A8A6A",
  },
  {
    id: "leader-chen",
    name: "楼组长陈阿姨",
    age: 65,
    area: "海湾社区",
    building: "2号楼",
    chronicTags: ["高血压"],
    strengths: ["邻里关怀", "手机教学", "防诈提醒"],
    description: "2号楼楼组长，经常帮独居老人解决手机操作问题，也会提醒大家防范电信诈骗。",
    phoneHelp: true,
    elderCare: true,
    healthCheckHelp: false,
    checkInActive: true,
    antiScam: true,
    avatarColor: "#8A6A94",
  },
  {
    id: "leader-zhao",
    name: "赵阿姨",
    age: 70,
    area: "滨海花园",
    building: "8号楼",
    chronicTags: ["糖尿病", "骨质疏松"],
    strengths: ["饮食管理", "打卡提醒", "陪伴就医"],
    description: "热心肠的退休护士，擅长帮助邻居做好饮食控制和日常健康打卡。",
    phoneHelp: false,
    elderCare: true,
    healthCheckHelp: true,
    checkInActive: true,
    antiScam: false,
    avatarColor: "#94785A",
  },
  {
    id: "leader-zhou",
    name: "周老师",
    age: 62,
    area: "滨海花园",
    building: "6号楼",
    chronicTags: ["高血压"],
    strengths: ["健康讲座", "心理疏导", "社区活动"],
    description: "退休心理老师，定期组织健康讲座，关注老年人心理健康。",
    phoneHelp: true,
    elderCare: false,
    healthCheckHelp: true,
    checkInActive: false,
    antiScam: true,
    avatarColor: "#5A6A8A",
  },
];
