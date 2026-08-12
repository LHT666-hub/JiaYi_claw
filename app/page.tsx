"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  HeartPulse,
  Stethoscope,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";
import { PrimaryClawCard } from "@/components/PrimaryClawCard";
import { SectionCard } from "@/components/SectionCard";
import { TopBar } from "@/components/TopBar";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type HomeData = {
  demo?: boolean;
  profile: { displayName: string; role: string };
  careSubject: import("@/lib/careSubjects").CareSubject;
  careSubjects: import("@/lib/careSubjects").CareSubject[];
  network: null | {
    name: string;
    community?: { name?: string; service_phone?: string | null };
  };
  serviceRequests: Array<{
    id: string;
    title: string;
    status: keyof typeof serviceStatusLabels;
    updated_at: string;
  }>;
  notifications: Array<{ id: string; is_read: boolean }>;
  schedules: Array<Record<string, unknown>>;
  content: Array<Record<string, unknown>>;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const quickServices = [
  {
    href: "/appointments",
    label: "帮预约",
    detail: "人工确认号源",
    icon: Stethoscope,
  },
  {
    href: "/health-records",
    label: "健康记录",
    detail: "血压血糖体重",
    icon: HeartPulse,
  },
  {
    href: "/public-info",
    label: "公开信息",
    detail: "流程与联系方式",
    icon: BookOpen,
  },
  {
    href: "/appointments?type=referral_assistance",
    label: "转诊协助",
    detail: "社区首诊上转",
    icon: Activity,
  },
];

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/v1/home", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 401) return router.replace("/login");
        if (!response.ok) setError(payload.error?.message ?? "首页加载失败");
        else setData(payload.data);
        setLoading(false);
      })
      .catch(() => {
        setError("网络连接失败，请稍后重试。");
        setLoading(false);
      });
  }, [router]);

  const nextRequest = data?.serviceRequests.find(
    (item) => !["failed", "completed", "cancelled"].includes(item.status),
  );
  const nextSchedule = data?.schedules[0];
  const practitioner = relation(
    nextSchedule?.practitioner as
      Record<string, unknown> | Record<string, unknown>[] | null,
  );
  const unread =
    data?.notifications.filter((item) => !item.is_read).length ?? 0;

  return (
    <PhoneShell showBottomNav>
      <main className="space-y-4 px-4 pb-8 pt-1">
        <TopBar
          name={data?.profile.displayName ?? "家"}
          hasUnreadNotifications={unread > 0}
          onBellClick={() => router.push("/messages")}
        />

        {data?.demo ? (
          <div className="rounded-full border border-sage/20 bg-health-soft px-4 py-2 text-center text-xs font-semibold text-sage">
            当前为只读展示数据 · 正式服务需登录后办理
          </div>
        ) : null}

        {loading ? (
          <div className="ios-material rounded-[30px] px-5 py-16 text-center text-sm text-navy/50">
            正在连接家医服务...
          </div>
        ) : error ? (
          <div className="rounded-[26px] border border-danger/20 bg-risk-soft px-5 py-4 text-sm text-danger">
            {error}
          </div>
        ) : data ? (
          <>
            <PrimaryClawCard
              onVoice={() => router.push("/ask?voice=1")}
              onPhoto={() => router.push("/ask?photo=1")}
              onText={() => router.push("/ask")}
              onQuickQuestion={(question) =>
                router.push(`/ask?q=${encodeURIComponent(question)}`)
              }
            />

            <CareSubjectSwitcher
              initialSelected={data.careSubject}
              initialSubjects={data.careSubjects}
            />

            <div className="rounded-[24px] border border-danger/15 bg-risk-soft px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertTriangle className="h-4 w-4" />
                紧急情况
              </p>
              <p className="mt-1.5 text-xs leading-5 text-navy/60">
                胸痛、呼吸困难、意识不清或大出血，请立即拨打 120。
              </p>
            </div>

            <SectionCard title="我的家医服务">
              <div className="rounded-[24px] bg-navy px-5 py-5 text-white shadow-[0_18px_38px_rgba(16,42,67,0.18)]">
                <p className="text-xs text-white/58">已绑定服务网络</p>
                <h2 className="mt-2 text-lg font-semibold">
                  {data.network?.name ?? "尚未绑定家医网络"}
                </h2>
                <p className="mt-1.5 text-sm text-white/68">
                  {data.network?.community?.name ??
                    "请联系社区工作人员完成绑定"}
                </p>
                <Link
                  href="/services"
                  className="mt-4 flex items-center justify-between rounded-full bg-white/12 px-4 py-3 text-sm font-semibold"
                >
                  查看我的服务网络
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </SectionCard>

            <SectionCard
              title="常用服务"
              action={
                <Link
                  href="/services"
                  className="text-xs font-semibold text-sage"
                >
                  全部服务
                </Link>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                {quickServices.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="rounded-[22px] border border-line/60 bg-surface-card p-4 transition active:scale-[0.98]"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-health-muted text-sage">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-navy">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-navy/50">
                      {item.detail}
                    </p>
                  </Link>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="服务进度"
              action={
                <Link
                  href="/appointments"
                  className="text-xs font-semibold text-sage"
                >
                  查看全部
                </Link>
              }
            >
              {nextRequest ? (
                <Link
                  href={`/service-requests/${nextRequest.id}`}
                  className="block rounded-[22px] border border-line/60 bg-surface-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">
                        {nextRequest.title}
                      </p>
                      <p className="mt-1.5 text-xs text-navy/45">
                        更新于{" "}
                        {new Date(nextRequest.updated_at).toLocaleString(
                          "zh-CN",
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-sage/15 bg-health-soft px-3 py-1 text-[11px] font-semibold text-sage">
                      {serviceStatusLabels[nextRequest.status]}
                    </span>
                  </div>
                </Link>
              ) : (
                <div className="rounded-[22px] border border-dashed border-line bg-surface-card px-4 py-6 text-center text-sm text-navy/50">
                  当前没有处理中服务。
                </div>
              )}
            </SectionCard>

            <SectionCard title="近期坐班">
              {nextSchedule ? (
                <div className="flex items-center gap-3 rounded-[22px] bg-surface-card p-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-health-muted text-sage">
                    <Stethoscope className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      {String(practitioner?.name ?? "家医团队")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-navy/52">
                      {new Date(String(nextSchedule.starts_at)).toLocaleString(
                        "zh-CN",
                      )}{" "}
                      · {String(nextSchedule.location ?? "以机构通知为准")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-line bg-surface-card px-4 py-6 text-center text-sm text-navy/50">
                  暂无已核验排班。
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="社区动态与小课堂"
              action={
                <Link
                  href="/services"
                  className="text-xs font-semibold text-sage"
                >
                  更多
                </Link>
              }
            >
              {data.content.length ? (
                <div className="space-y-3">
                  {data.content.slice(0, 3).map((item) => (
                    <a
                      key={String(item.id)}
                      href={String(item.original_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-[22px] border border-line/60 bg-surface-card p-4"
                    >
                      <p className="text-xs font-semibold text-sage">
                        {String(item.source_name)}
                      </p>
                      <h3 className="mt-1.5 text-sm font-semibold text-navy">
                        {String(item.title)}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-navy/52">
                        {String(item.summary)}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-line bg-surface-card px-4 py-6 text-center text-sm text-navy/50">
                  暂无已审核内容。
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </main>
    </PhoneShell>
  );
}
