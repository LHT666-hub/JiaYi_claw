"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import {
  buildResidentFriendlyTaskSnapshot,
  getCurrentServiceOwnerLabel,
  getCurrentServiceStepTitle,
  getNextPendingServiceStepTitle,
} from "@/lib/agentTaskPayload";
import { mapLocalTodoToProgress, serviceStatusLabelMap } from "@/lib/serviceProgress";
import {
  getFamilyBindingsForFamily,
  getTodoStatusEvents,
  readDoctorTodos,
} from "@/lib/storage";
import { DemoUser, ProfileRow, ResidentTodoProgressItem } from "@/lib/types";
import { useDemoUser } from "@/lib/useDemoUser";

type AuthMode = "loading" | "supabase" | "demo" | "none";
type HomeSummary = {
  residentId: string;
  residentName: string;
  followupConfirmed: boolean;
  followupResponse: string | null;
  followupConfirmedAt: string | null;
};

function timelineTitle(item: { note?: string; newStatus: string }) {
  if (item.note?.includes("建议携带材料联系")) {
    return "建议联系谁";
  }
  if (item.note?.includes("已提交给家医团队")) {
    return "已提交给家医团队";
  }
  if (item.newStatus === "processing") {
    return "正在处理";
  }
  if (item.newStatus === "done") {
    return "已处理";
  }
  if (item.newStatus === "ignored") {
    return "已关闭";
  }
  return "已提交给家医团队";
}

function buildLocalProgressItems(currentUser: DemoUser, residentId?: string | null) {
  const todos = readDoctorTodos();
  const bindings =
    currentUser.role === "family" ? getFamilyBindingsForFamily(currentUser.id) : [];

  const filtered = todos.filter((todo) => {
    if (currentUser.role === "resident") {
      return (
        todo.residentId === currentUser.id ||
        todo.residentName === currentUser.name
      );
    }

    if (currentUser.role === "family") {
      const byBinding = bindings.some(
        (binding) =>
          (residentId ? binding.residentId === residentId : true) &&
          (todo.residentId === binding.residentId || todo.residentName === binding.residentName),
      );
      return byBinding;
    }

    if (currentUser.role === "admin") {
      return residentId ? todo.residentId === residentId : true;
    }

    return false;
  });

  return filtered.map((todo) =>
    mapLocalTodoToProgress({
      todo,
      statusEvents: getTodoStatusEvents(todo.id),
    }),
  );
}

function ServiceTaskPanel({ item }: { item: ResidentTodoProgressItem }) {
  if (!item.serviceTask) {
    return null;
  }

  const currentStepTitle = getCurrentServiceStepTitle(item.serviceTask);
  const currentOwnerLabel = getCurrentServiceOwnerLabel(item.serviceTask);
  const nextStepTitle = getNextPendingServiceStepTitle(item.serviceTask);
  const snapshot = buildResidentFriendlyTaskSnapshot(item.serviceTask, item.status);
  const request = item.serviceTask.serviceRequest;
  const requestRows: Array<{ label: string; value: string }> =
    request?.kind === "registration"
      ? [
          request.symptom ? { label: "症状/问题", value: request.symptom } : null,
          request.department ? { label: "目标门诊", value: request.department } : null,
          request.preferredDoctor ? { label: "优先医生", value: request.preferredDoctor } : null,
          request.preferredDate || request.preferredTime
            ? { label: "期望时段", value: `${request.preferredDate ?? ""}${request.preferredTime ?? ""}`.trim() }
            : null,
        ].filter((row): row is { label: string; value: string } => Boolean(row))
      : request?.kind === "refill"
        ? [
            request.medicineName ? { label: "药品名称", value: request.medicineName } : null,
            request.disease ? { label: "慢病类型", value: request.disease } : null,
            request.stockLeft ? { label: "剩余药量", value: request.stockLeft } : null,
            request.deliveryMethod
              ? {
                  label: "交付方式",
                  value:
                    request.deliveryMethod === "pickup"
                      ? "到店自取"
                      : request.deliveryMethod === "mail"
                        ? "邮寄到家"
                        : "自取或邮寄都可以",
                }
              : null,
          ].filter((row): row is { label: string; value: string } => Boolean(row))
        : request?.kind === "family_doctor"
          ? [
              request.serviceMode
                ? {
                    label: "服务方式",
                    value:
                      request.serviceMode === "clinic"
                        ? "线下面诊"
                        : request.serviceMode === "phone"
                          ? "电话回访"
                          : request.serviceMode === "home_visit"
                            ? "上门服务"
                            : "面诊、电话或上门均可",
                  }
                : null,
              request.preferredDate || request.preferredTime
                ? { label: "期望时段", value: `${request.preferredDate ?? ""}${request.preferredTime ?? ""}`.trim() }
                : null,
              request.note ? { label: "补充说明", value: request.note } : null,
            ].filter((row): row is { label: string; value: string } => Boolean(row))
          : request?.kind === "dispense_status"
            ? [
                request.medicineName ? { label: "药品名称", value: request.medicineName } : null,
                request.progressFocus
                  ? {
                      label: "关注环节",
                      value:
                        request.progressFocus === "review"
                          ? "医生/药师审核"
                          : request.progressFocus === "dispense"
                            ? "药房配药"
                            : request.progressFocus === "delivery"
                              ? "配送或自取"
                              : "整体进度",
                    }
                  : null,
                request.deliveryMethod
                  ? {
                      label: "交付方式",
                      value:
                        request.deliveryMethod === "pickup"
                          ? "到店自取"
                          : request.deliveryMethod === "mail"
                            ? "邮寄到家"
                            : "自取或邮寄都可以",
                    }
                  : null,
              ].filter((row): row is { label: string; value: string } => Boolean(row))
            : request?.kind === "followup"
              ? [
                  request.followupType
                    ? {
                        label: "提醒类型",
                        value:
                          request.followupType === "phone_followup"
                            ? "电话随访"
                            : request.followupType === "checkup"
                              ? "复查提醒"
                              : request.followupType === "medication_reminder"
                                ? "用药提醒"
                                : "复诊提醒",
                      }
                    : null,
                  request.preferredDate ? { label: "期望时间", value: request.preferredDate } : null,
                  request.note ? { label: "补充说明", value: request.note } : null,
                ].filter((row): row is { label: string; value: string } => Boolean(row))
        : [];

  return (
    <div className="mt-4 rounded-[18px] border border-sage/20 bg-[#EDF5EF] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-sage">{item.serviceTask.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{item.serviceTask.task.title}</p>
        </div>
        <span className="rounded-full border border-sage/20 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-sage">
          {item.serviceTask.needsHumanReview ? "需要人工协同" : "可继续自助推进"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-navy/70">{item.serviceTask.task.summary}</p>
      <div className="mt-3 rounded-[14px] border border-sage/20 bg-white/85 px-3 py-3">
        <p className="text-[11px] text-navy/45">一句话当前结果</p>
        <p className="mt-1 text-sm font-semibold text-navy">{snapshot.headline}</p>
        <p className="mt-1 text-xs leading-5 text-navy/58">{snapshot.nextAction}</p>
      </div>
      {requestRows.length ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {requestRows.map((row) => (
            <div key={`${item.id}-${row.label}`} className="rounded-[14px] border border-white/80 bg-white/75 px-3 py-2">
              <p className="text-[11px] text-navy/45">{row.label}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-navy">{row.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {item.serviceTask.task.serviceFacts?.length ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {item.serviceTask.task.serviceFacts.map((fact) => (
            <div
              key={`${item.id}-${fact.label}`}
              className={`rounded-[14px] border px-3 py-2 ${
                fact.tone === "warning"
                  ? "border-amber/20 bg-[#FFF8ED]"
                  : "border-white/80 bg-white/75"
              }`}
            >
              <p className="text-[11px] text-navy/45">{fact.label}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-navy">{fact.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {currentStepTitle ? (
        <div className="mt-3 rounded-[14px] border border-sage/20 bg-white/80 px-3 py-3">
          <p className="text-[11px] text-navy/45">当前节点</p>
          <p className="mt-1 text-sm font-semibold text-navy">{currentStepTitle}</p>
          <p className="mt-1 text-xs leading-5 text-navy/58">
            当前由 {currentOwnerLabel ?? "家医团队"} 处理
            {nextStepTitle ? `，之后进入 ${nextStepTitle}` : "，完成后会自动回写服务结果"}
          </p>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {item.serviceTask.task.steps.map((step) => (
          <div key={`${item.id}-${step.title}`} className="flex items-center gap-2 rounded-[14px] bg-white/70 px-3 py-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                step.status === "done"
                  ? "bg-success"
                  : step.status === "current"
                    ? "bg-sage"
                    : "bg-navy/20"
              }`}
            />
            <p className="flex-1 text-xs font-medium text-navy">{step.title}</p>
            <span className="text-[11px] text-navy/45">{step.owner}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceProgressPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser, isReady } = useDemoUser();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [items, setItems] = useState<ResidentTodoProgressItem[]>([]);
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const residentId = searchParams.get("residentId");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (supabase) {
        try {
          const currentProfile = await fetchCurrentProfile(supabase);
          if (!active) {
            return;
          }

          if (currentProfile) {
            setProfile(currentProfile);
            setAuthMode("supabase");
            setRemoteError(null);
            const query = residentId ? `?residentId=${residentId}` : "";
            const response = await fetch(`/api/resident/todos${query}`, {
              method: "GET",
              cache: "no-store",
            });
            const payload = (await response.json().catch(() => ({}))) as {
              message?: string;
              todos?: ResidentTodoProgressItem[];
            };
            if (response.ok) {
              setItems(payload.todos ?? []);
            } else {
              setItems([]);
              setRemoteError(
                payload.message ?? "当前账号的服务进度暂时还没同步成功，请稍后刷新再试。",
              );
            }

            const summaryResponse = await fetch(`/api/home/summary${query}`, {
              method: "GET",
              cache: "no-store",
            });
            const summaryPayload = (await summaryResponse.json().catch(() => ({}))) as {
              message?: string;
              summary?: HomeSummary | null;
              summaries?: HomeSummary[];
            };

            if (summaryResponse.ok) {
              if (currentProfile.role === "resident") {
                setHomeSummary(summaryPayload.summary ?? null);
              } else if (residentId && summaryPayload.summaries?.length) {
                setHomeSummary(summaryPayload.summaries[0] ?? null);
              } else {
                setHomeSummary(summaryPayload.summary ?? null);
              }
            } else if (!response.ok) {
              setHomeSummary(null);
            } else {
              setRemoteError(
                summaryPayload.message ?? "服务回执暂时还没同步成功，请稍后刷新再试。",
              );
            }
            return;
          }
        } catch {
          if (!active) {
            return;
          }

          setRemoteError("当前账号的服务进度暂时还没同步成功，请稍后刷新再试。");
        }
      }

      if (!isReady) {
        return;
      }

      if (currentUser) {
        setAuthMode("demo");
        setItems(buildLocalProgressItems(currentUser, residentId));
        setHomeSummary(null);
        setRemoteError(null);
        return;
      }

      setAuthMode("none");
      router.replace("/welcome");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [currentUser, isReady, residentId, router, supabase]);

  const role = profile?.role ?? currentUser?.role;
  const canView = role === "resident" || role === "family" || role === "admin";
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const processingCount = items.filter((item) => item.status === "processing").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  if (authMode === "loading") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的服务进度" subtitle="正在读取当前身份..." />
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return null;
  }

  if (!canView) {
    return (
      <PhoneShell showBottomNav>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的服务进度" subtitle="当前页面适合居民和家属查看。" />
          <SectionCard>
            <EmptyState title="当前身份暂无服务进度权限" description="请切换到居民、家属或管理员身份后查看。" />
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title="我的服务进度"
          subtitle={
            role === "family"
              ? "这里会显示已绑定老人的服务处理进度。"
              : role === "admin"
                ? "这里会显示居民问题的服务处理进度。"
                : "这里会显示家医团队的处理进度。"
          }
        />

        {authMode === "supabase" && remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[22px] border border-line/50 bg-surface-card px-4 py-4">
            <p className="text-[11px] text-navy/50">待处理</p>
            <p className="mt-2 text-2xl font-bold text-navy">{pendingCount}</p>
          </div>
          <div className="rounded-[22px] border border-sage/20 bg-health-muted px-4 py-4">
            <p className="text-[11px] text-sage">处理中</p>
            <p className="mt-2 text-2xl font-bold text-sage">{processingCount}</p>
          </div>
          <div className="rounded-[22px] border border-success/20 bg-health-success px-4 py-4">
            <p className="text-[11px] text-success">已处理</p>
            <p className="mt-2 text-2xl font-bold text-success">{doneCount}</p>
          </div>
        </div>

        <SectionCard title="我的问题">
          {homeSummary?.followupConfirmed ? (
            <div className="mb-4 rounded-[22px] border border-[#BFD9CB] bg-[#EAF4EE] px-4 py-4">
              <p className="text-sm font-semibold text-[#355C52]">最近随访回执</p>
              <p className="mt-2 text-sm leading-6 text-[#355C52]">
                已回复：{homeSummary.followupResponse ?? "可以按时参加"}
              </p>
              <p className="mt-2 text-xs text-[#355C52]/80">
                更新时间：{new Date(homeSummary.followupConfirmedAt ?? Date.now()).toLocaleString("zh-CN")}
              </p>
            </div>
          ) : null}

          {items.length ? (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-line/60 bg-surface-card p-4">
                  {role !== "resident" ? (
                    <p className="mb-2 text-xs font-semibold text-sage">{item.residentName}</p>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-navy">
                      {item.originalQuestion}
                    </p>
                    <span className="rounded-full border border-amber/20 bg-amber/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber">
                      {serviceStatusLabelMap[item.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-navy/72">{item.summary}</p>
                  {item.serviceTask ? (
                    <div className="mt-3 rounded-[18px] border border-sage/15 bg-[#EDF5EF] px-3 py-3">
                      <p className="text-[11px] text-navy/45">一句话当前结果</p>
                      <p className="mt-1 text-sm font-semibold text-navy">
                        {buildResidentFriendlyTaskSnapshot(item.serviceTask, item.status).headline}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-navy/58">
                        {buildResidentFriendlyTaskSnapshot(item.serviceTask, item.status).nextAction}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-1.5 text-xs leading-5 text-navy/56">
                    <p>当前进度：{serviceStatusLabelMap[item.status]}</p>
                    <p>建议联系谁：{item.recommendedRoleLabel ?? "家庭医生"}</p>
                    <p>Claw 已帮我整理：{item.clawAnswer}</p>
                    <p>最近更新时间：{new Date(item.updatedAt).toLocaleString("zh-CN")}</p>
                  </div>
                  <ServiceTaskPanel item={item} />
                  <div className="mt-3 rounded-[18px] bg-cream px-3 py-3 text-xs leading-5 text-navy/62">
                    <p className="font-semibold text-navy">建议准备什么材料</p>
                    <div className="mt-1 space-y-1">
                      {item.preparedMaterials.map((material) => (
                        <p key={material}>{material}</p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-[18px] bg-cream px-3 py-3">
                    <p className="mb-2 text-xs font-semibold text-navy">服务进度</p>
                    <div className="space-y-2">
                      {item.statusEvents.map((event) => (
                        <div key={event.id} className="flex gap-3 text-xs leading-5 text-navy/68">
                          <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-sage" />
                          <div>
                            <p className="font-semibold text-navy">{timelineTitle(event)}</p>
                            <p>{event.note || "家医团队已更新处理进度。"}</p>
                            <p className="text-navy/45">{new Date(event.createdAt).toLocaleString("zh-CN")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                authMode === "supabase" && remoteError
                  ? "暂时还没有同步到可展示的处理进度"
                  : "目前没有需要家医团队处理的问题。"
              }
              description={
                authMode === "supabase" && remoteError
                  ? "请稍后刷新，等真实进度同步成功后，这里会显示最新状态。"
                  : "问 Claw 触发家医团队提醒后，这里会显示处理进度。"
              }
            />
          )}
        </SectionCard>

        <div className="rounded-[20px] bg-surface-card px-4 py-3 text-xs leading-5 text-navy/58">
          家医 Claw 只显示服务处理状态和协助说明，不显示诊断结果，也不提供处方、停药、换药或剂量调整建议。
        </div>
      </div>
    </PhoneShell>
  );
}

export default function ServiceProgressPage() {
  return (
    <Suspense
      fallback={
        <PhoneShell>
          <div className="space-y-5 px-4 pb-8">
            <BackHeader title="我的服务进度" subtitle="正在读取处理进度..." />
          </div>
        </PhoneShell>
      }
    >
      <ServiceProgressPageContent />
    </Suspense>
  );
}
