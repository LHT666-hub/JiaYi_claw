"use client";

import {
  AlertTriangle,
  Award,
  ClipboardList,
  GraduationCap,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";

const dashboardStats = [
  { label: "今日居民提问", value: "12 条", icon: Users },
  { label: "待处理风险提醒", value: "2 条", icon: AlertTriangle },
  { label: "小课堂推送", value: "3 条", icon: GraduationCap },
  { label: "任务完成率", value: "78%", icon: ClipboardList },
];

const residentProgress = [
  "张阿姨：已完成服药、血压记录",
  "李叔叔：未完成血糖记录",
  "王阿姨：已观看小课堂",
  "陈伯伯：随访确认待回复",
];

const groupAlerts = [
  "张阿姨在群里询问“血压很高怎么办”",
  "李叔叔上传了药盒照片，待识别",
  "陈伯伯询问“能不能停药”，已自动分流给家庭医生",
];

const workOrders = [
  "体检通知｜服务通知｜护士/社区支持｜处理中｜贡献值 6",
  "电话随访｜慢病随访｜家庭医生/护士｜待跟进｜贡献值 8",
  "药品规则解释｜配药协助｜药师/家庭医生｜已分流｜贡献值 5",
  "小组活动维护｜群组运营｜小组长/护士｜进行中｜贡献值 4",
  "长护险初筛辅助｜社区协同｜社区支持/护士｜待接收｜贡献值 7",
];

const contributions = [
  { name: "李医生", role: "家庭医生", value: 124, weekly: "+18" },
  { name: "王护士", role: "团队护士", value: 96, weekly: "+12" },
  { name: "陈药师", role: "临床药师", value: 72, weekly: "+9" },
  { name: "王阿姨", role: "小组长", value: 58, weekly: "+11" },
  { name: "楼组长", role: "社区支持", value: 41, weekly: "+5" },
];

export default function DoctorPage() {
  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title="家医团队工作台"
          subtitle="隐藏演示页，不作为居民端主入口"
        />

        <SectionCard title="今日概览">
          <div className="grid grid-cols-2 gap-3">
            {dashboardStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-[24px] bg-[#FFF8ED] px-4 py-4"
                >
                  <div className="flex items-center gap-2 text-sage">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs tracking-[0.14em] text-navy/52">
                      {stat.label}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-navy">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="高频问题">
          <div className="space-y-3">
            {[
              "药吃完了怎么办",
              "体检报告怎么看",
              "长处方是什么意思",
              "血压高了怎么办",
            ].map((question) => (
              <div
                key={question}
                className="rounded-[22px] bg-[#FFF8ED] px-4 py-3 text-sm font-semibold text-navy"
              >
                {question}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="居民任务完成情况">
          <div className="space-y-3">
            {residentProgress.map((line) => (
              <div
                key={line}
                className="rounded-[22px] bg-[#FFF8ED] px-4 py-3 text-sm text-navy"
              >
                {line}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="群聊风险提醒">
          <div className="space-y-3">
            {groupAlerts.map((line) => (
              <div
                key={line}
                className="flex items-center gap-3 rounded-[22px] bg-[#FDEFEA] px-4 py-3 text-sm text-danger"
              >
                <MessageSquareWarning className="h-4 w-4 shrink-0" />
                {line}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="团队任务工单演示">
          <div className="space-y-3">
            {workOrders.map((line) => (
              <div
                key={line}
                className="rounded-[22px] bg-[#FFF8ED] px-4 py-3 text-sm leading-6 text-navy"
              >
                {line}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="团队贡献记录演示">
          <div className="space-y-3">
            {contributions.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F2E2C7] text-navy">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy">{item.name}</p>
                    <p className="mt-1 text-xs text-navy/56">{item.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-navy">
                    {item.value} 分
                  </p>
                  <p className="mt-0.5 text-xs text-sage">本周 {item.weekly}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-navy/55">
            贡献记录用于演示团队工作量可视化，仅供答辩展示，不接真实绩效系统。
          </p>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
