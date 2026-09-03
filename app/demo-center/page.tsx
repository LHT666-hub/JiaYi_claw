"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Play, RotateCcw, Sparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { demoUsers } from "@/data/demoUsers";
import {
  STORAGE_CHANGE_EVENT,
  getLocalUnreadNotificationCount,
  readAskLogs,
  readDoctorTodos,
  readFeedbacks,
  resetDemoLocalData,
  seedServiceShowcaseScenario,
  seedShowcaseScenario,
} from "@/lib/storage";
import { loginAs, useDemoUser } from "@/lib/useDemoUser";

const walkthroughs = [
  {
    title: "居民闭环体验",
    description: "首页提问 -> 生成家医待办 -> 服务进度跟踪",
    href: "/ask?q=最近两天血压都在155/98，需要马上去医院吗？",
  },
  {
    title: "家属协助体验",
    description: "家属查看提醒 -> 查看任务和进度 -> 帮老人代问 Claw",
    href: "/family",
  },
  {
    title: "团队处理体验",
    description: "家医工作台处理待办 -> 通知联动 -> 状态更新",
    href: "/doctor",
  },
  {
    title: "后台运营体验",
    description: "FAQ 管理 -> 课程和任务配置 -> 反馈与看板查看",
    href: "/admin",
  },
];

const teacherDemoFlows = [
  {
    title: "演示 1: 今日坐班到一键挂号",
    summary: "展示 Agent 识别“看哪个门诊、什么时间”并给出排班卡片和预约入口。",
    launchHref: "/ask?q=帮我预约明天下午看心脏病，推荐合适医生",
    primaryLabel: "开始这条演示",
    secondaryLabel: "看服务中心",
    secondaryHref:
      "/services",
    steps: [
      "先从问 Claw 进入，提问“帮我预约明天下午看心脏病，推荐合适医生”",
      "查看推荐医生、坐班时间、剩余号源和立即预约按钮",
      "点击预约后，再去服务进度页看任务是否已进入团队流转",
    ],
  },
  {
    title: "演示 2: 慢病续方到药房流转",
    summary: "展示 AI 不直接开药，而是自动生成续方申请并经过医生、药师、药房节点。",
    launchHref:
      "/ask?q=我药快吃完了，帮我续上次那个降压药&serviceType=refill&medicineName=苯磺酸氨氯地平片&disease=高血压&stockLeft=还剩3天&deliveryMethod=mail",
    primaryLabel: "发起续方申请",
    secondaryLabel: "看团队工作台",
    secondaryHref: "/doctor",
    steps: [
      "居民端先发起“我药快吃完了，帮我续上次那个降压药”",
      "查看续方任务里的目录判断、库存、是否需复诊等服务判断",
      "切到团队工作台模拟医生审核、药师审方、药房配药，再回服务进度页查看结果",
    ],
  },
  {
    title: "演示 3: 家医预约与后续提醒",
    summary: "展示家医服务不是一次性答复，而是会进入时段确认、提醒和后续随访。",
    launchHref:
      "/ask?q=帮我约一下家庭医生，明天下午电话回访也可以&serviceType=familyDoctor&serviceMode=phone&preferredDate=明天&preferredTime=下午",
    primaryLabel: "发起家医服务",
    secondaryLabel: "看服务进度",
    secondaryHref: "/service-progress",
    steps: [
      "从居民端发起家庭医生预约或回访需求",
      "观察任务被整理成结构化服务卡片，并提示当前处理节点",
      "再去服务进度页看一句话结果和下一步安排，体现老人友好",
    ],
  },
];

const pageGroups = [
  {
    title: "居民体验",
    pages: [
      { name: "首页", href: "/", desc: "总览任务、提醒、找人和小组入口" },
      { name: "问家医 Claw", href: "/ask", desc: "流程问答、安全拦截和待办生成" },
      { name: "一键帮预约", href: "/appointments", desc: "预约、转诊、续方和家医服务申请" },
      { name: "服务中心", href: "/services", desc: "今日坐班、分级诊疗网络、活动和小课堂" },
      { name: "服务进度", href: "/service-progress", desc: "查看团队处理状态、下一步和结果" },
      { name: "消息中心", href: "/messages", desc: "预约、随访、资料补充和活动通知" },
      { name: "健康记录", href: "/health-records", desc: "手工记录血压、血糖、体重和步数" },
      { name: "长期记忆", href: "/memory", desc: "查看待确认事实、长期资料和健康时间线" },
      { name: "任务积分", href: "/tasks", desc: "完成健康小事并领取积分" },
      { name: "家医小课堂", href: "/courses", desc: "学习内容并同步积分记录" },
      { name: "一键找人", href: "/contacts", desc: "联系医生、护士、药师和社区支持" },
      { name: "健康小组", href: "/group", desc: "查看群提醒、打卡和互助消息" },
      { name: "公开信息", href: "/public-info", desc: "查看有来源、有效期和原文入口的信息" },
      { name: "随访确认", href: "/followup", desc: "确认随访安排并补充近期情况" },
    ],
  },
  {
    title: "家属与个人设置",
    pages: [
      { name: "家属协助", href: "/family", desc: "查看老人提醒、任务和服务进度" },
      { name: "家属授权", href: "/family-link", desc: "生成或使用授权码绑定家人" },
      { name: "通知中心", href: "/notifications", desc: "接收处理状态、任务和系统提醒" },
      { name: "通知设置", href: "/notification-settings", desc: "设置短信、企业微信、小程序和免打扰" },
      { name: "隐私授权", href: "/privacy", desc: "管理敏感健康、AI、家属和通知授权" },
      { name: "账号安全", href: "/account-security", desc: "查看登录安全和账号注销入口" },
      { name: "我的", href: "/me", desc: "查看身份、社区、家医网络和服务历史" },
      { name: "帮助与反馈", href: "/support", desc: "联系支持并提交正式反馈" },
    ],
  },
  {
    title: "家庭医生团队",
    pages: [
      { name: "团队今日总览", href: "/doctor", desc: "风险、超时、待认领和群事实概览" },
      { name: "服务工作队列", href: "/workbench/requests", desc: "受理、补资料、核验资源和回写预约结果" },
      { name: "内容与群运营", href: "/workbench/operations", desc: "签约、群事实、内容、排班和广播审核" },
    ],
  },
  {
    title: "机构管理后台",
    pages: [
      { name: "运营总览", href: "/admin", desc: "服务、人员、内容、排班和渠道指标" },
      { name: "分级诊疗网络", href: "/admin/care-network", desc: "配置机构、科室、医生和上转路线" },
      { name: "服务目录", href: "/admin/service-catalog", desc: "配置办理模式、责任岗位和响应时限" },
      { name: "工作人员", href: "/admin/staff", desc: "邀请和管理医生、护士、药师及社区人员" },
      { name: "内容来源", href: "/admin/content-sources", desc: "登记公众号和官网，采集候选内容" },
      { name: "企业微信", href: "/admin/channels", desc: "配置官方群渠道和定时通知" },
      { name: "Agent Skill 与 RAG", href: "/admin/skills", desc: "查看 Skill 来源、许可、评测和知识索引" },
      { name: "审计日志", href: "/admin/audit", desc: "查看关键权限和业务操作证据" },
      { name: "居民反馈处理", href: "/admin/feedback", desc: "受理反馈并记录处理结论" },
      { name: "上线准备度", href: "/admin/readiness", desc: "区分演示可用与正式上线阻断项" },
      { name: "体验反馈", href: "/feedback", desc: "提交使用建议和改进意见" },
      { name: "身份选择", href: "/welcome", desc: "重新选择角色并进入对应入口" },
    ],
  },
];

function getDemoPath(role: string) {
  if (role === "family") {
    return "/family";
  }
  if (role === "admin") {
    return "/admin";
  }
  if (["doctor", "nurse", "pharmacist", "community"].includes(role)) {
    return "/doctor";
  }
  return "/";
}

export default function DemoCenterPage() {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const { showToast } = useToast();
  const [stats, setStats] = useState({
    askCount: 0,
    todoCount: 0,
    feedbackCount: 0,
    unreadCount: 0,
  });

  const activeRole = currentUser?.roleLabel ?? "未选择身份";
  const activeName = currentUser?.name ?? "访客";

  useEffect(() => {
    function refreshStats() {
      setStats({
        askCount: readAskLogs().length,
        todoCount: readDoctorTodos().length,
        feedbackCount: readFeedbacks().length,
        unreadCount: getLocalUnreadNotificationCount(),
      });
    }

    refreshStats();
    window.addEventListener(STORAGE_CHANGE_EVENT, refreshStats);
    window.addEventListener("storage", refreshStats);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, refreshStats);
      window.removeEventListener("storage", refreshStats);
    };
  }, []);

  const quickUsers = useMemo(() => demoUsers, []);

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="体验中心" subtitle="一页看全应用结构、推荐体验路径和常用入口。" />

        <SectionCard>
          <div className="rounded-[24px] bg-surface-card p-4">
            <p className="text-sm text-navy/60">
              当前身份：<span className="font-semibold text-navy">{activeName}</span> / {activeRole}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[18px] bg-cream px-3 py-3">
                <p className="text-xs text-navy/55">提问记录</p>
                <p className="mt-1 text-lg font-semibold text-navy">{stats.askCount}</p>
              </div>
              <div className="rounded-[18px] bg-cream px-3 py-3">
                <p className="text-xs text-navy/55">团队待办</p>
                <p className="mt-1 text-lg font-semibold text-navy">{stats.todoCount}</p>
              </div>
              <div className="rounded-[18px] bg-cream px-3 py-3">
                <p className="text-xs text-navy/55">未读通知</p>
                <p className="mt-1 text-lg font-semibold text-navy">{stats.unreadCount}</p>
              </div>
              <div className="rounded-[18px] bg-cream px-3 py-3">
                <p className="text-xs text-navy/55">体验反馈</p>
                <p className="mt-1 text-lg font-semibold text-navy">{stats.feedbackCount}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="推荐体验路线">
          <div className="space-y-3">
            {walkthroughs.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => router.push(item.href)}
                className="flex w-full items-start justify-between gap-3 rounded-[22px] border border-line/60 bg-surface-card px-4 py-4 text-left active:scale-[0.98]"
              >
                <span>
                  <span className="block text-sm font-semibold text-navy">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-navy/58">{item.description}</span>
                </span>
                <Play className="mt-0.5 h-5 w-5 shrink-0 text-sage" />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="老师演示路径">
          <div className="space-y-4">
            {teacherDemoFlows.map((flow) => (
              <div key={flow.title} className="rounded-[24px] border border-sage/20 bg-health-soft p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{flow.title}</p>
                    <p className="mt-1 text-xs leading-5 text-navy/60">{flow.summary}</p>
                  </div>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sage">
                    Agent 闭环
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {flow.steps.map((step, index) => (
                    <div key={`${flow.title}-${step}`} className="flex items-start gap-2 rounded-[16px] bg-white/78 px-3 py-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-health-muted text-[11px] font-semibold text-sage">
                        {index + 1}
                      </span>
                      <p className="text-xs leading-5 text-navy/70">{step}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(flow.launchHref)}
                    className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
                  >
                    {flow.primaryLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(flow.secondaryHref)}
                    className="rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
                  >
                    {flow.secondaryLabel}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="体验数据工具">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                resetDemoLocalData({ keepCurrentUser: true, keepCustomContent: true });
                showToast("已重置为可体验的初始数据。", "success");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              一键重置体验数据
            </button>
            <button
              type="button"
              onClick={() => {
                seedShowcaseScenario();
                showToast("已生成高风险体验案例，可去团队工作台查看。", "success");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
            >
              <Sparkles className="h-4 w-4" />
              生成高风险闭环案例
            </button>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  seedServiceShowcaseScenario("registration");
                  showToast("已生成挂号协助演示案例，可去服务进度或团队工作台查看。", "success");
                }}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                生成挂号协助案例
              </button>
              <button
                type="button"
                onClick={() => {
                  seedServiceShowcaseScenario("refill");
                  showToast("已生成续方配药演示案例，可去团队工作台继续流转。", "success");
                }}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                生成续方配药案例
              </button>
              <button
                type="button"
                onClick={() => {
                  seedServiceShowcaseScenario("family_doctor");
                  showToast("已生成家医回访演示案例，可去服务进度查看老人友好结果。", "success");
                }}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                生成家医回访案例
              </button>
            </div>
            <p className="text-xs leading-5 text-navy/55">
              第一项会恢复到干净可体验状态；后面几项可以分别快速注入高风险、挂号、续方、家医回访这几条代表性演示链路。
            </p>
          </div>
        </SectionCard>

        <SectionCard title="角色快速切换">
          <div className="space-y-2">
            {quickUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  loginAs(user);
                  router.push(getDemoPath(user.role));
                }}
                className="flex w-full items-center justify-between rounded-[20px] border border-line/60 bg-surface-card px-3 py-3 text-left active:scale-[0.98]"
              >
                <span>
                  <span className="text-sm font-semibold text-navy">{user.name}</span>
                  <span className="ml-2 text-xs text-sage">{user.roleLabel}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-navy/40" />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="全页面清单">
          <div className="space-y-4">
            {pageGroups.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.12em] text-navy/45">{group.title}</p>
                <div className="space-y-2">
                  {group.pages.map((page) => (
                    <Link
                      key={page.href}
                      href={page.href}
                      className="flex items-center justify-between rounded-[18px] border border-line/55 bg-surface-card px-3 py-3 active:scale-[0.98]"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-navy">{page.name}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-navy/56">{page.desc}</span>
                      </span>
                      <span className="text-xs font-semibold text-sage">打开</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
