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
  seedShowcaseScenario,
} from "@/lib/storage";
import { loginAs, useDemoUser } from "@/lib/useDemoUser";

const walkthroughs = [
  {
    title: "居民闭环演示",
    description: "首页提问 → 生成家医待办 → 服务进度跟踪",
    href: "/ask?q=最近两天血压都在155/98，需要马上去医院吗？",
  },
  {
    title: "家属协助演示",
    description: "家属看老人提醒 → 查看任务/进度 → 帮老人问 Claw",
    href: "/family",
  },
  {
    title: "团队处理演示",
    description: "医生工作台处理待办 → 通知/状态联动",
    href: "/doctor",
  },
  {
    title: "后台运营演示",
    description: "FAQ 管理 → 任务课程配置 → 反馈看板",
    href: "/admin",
  },
];

const pageGroups = [
  {
    title: "居民体验",
    pages: [
      { name: "首页", href: "/", desc: "总览任务、提醒、找人和小组入口" },
      { name: "问家医 Claw", href: "/ask", desc: "流程问答、安全拦截、生成待办" },
      { name: "任务积分", href: "/tasks", desc: "完成健康小事并兑换积分" },
      { name: "家医小课堂", href: "/courses", desc: "模拟播放/听讲解并领取积分" },
      { name: "一键找人", href: "/contacts", desc: "医生、护士、药师、社区支持入口" },
      { name: "健康小组", href: "/group", desc: "群提醒、打卡和互助消息" },
      { name: "服务进度", href: "/service-progress", desc: "查看家医团队处理状态轨迹" },
    ],
  },
  {
    title: "家属与团队",
    pages: [
      { name: "家属协助", href: "/family", desc: "看老人提醒、任务和服务进度" },
      { name: "团队工作台", href: "/doctor", desc: "分角色处理待办与风险提醒" },
      { name: "通知中心", href: "/notifications", desc: "接收处理状态、任务与系统提醒" },
    ],
  },
  {
    title: "管理与设置",
    pages: [
      { name: "管理后台", href: "/admin", desc: "看板、FAQ、课程、任务、反馈管理" },
      { name: "我的", href: "/me", desc: "身份资料、入口设置、反馈提交" },
      { name: "体验反馈", href: "/feedback", desc: "收集演示反馈建议" },
      { name: "身份选择", href: "/welcome", desc: "选择角色并快速进入演示" },
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

  const quickUsers = useMemo(() => demoUsers.slice(0, 6), []);

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="演示中心" subtitle="一页看全应用结构、演示路线和体验入口" />

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

        <SectionCard title="推荐演示路线">
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

        <SectionCard title="演示数据工具">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                resetDemoLocalData({ keepCurrentUser: true, keepCustomContent: true });
                showToast("已重置为可演示初始数据。", "success");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              一键重置演示数据
            </button>
            <button
              type="button"
              onClick={() => {
                seedShowcaseScenario();
                showToast("已生成高风险演示案例，可去团队工作台查看。", "success");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
            >
              <Sparkles className="h-4 w-4" />
              生成高风险闭环案例
            </button>
            <p className="text-xs leading-5 text-navy/55">
              第一项恢复到干净可演示状态；第二项用于快速展示“提问到待办再到进度追踪”闭环。
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
