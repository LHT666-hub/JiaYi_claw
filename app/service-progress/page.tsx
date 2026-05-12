"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { mapLocalTodoToProgress, serviceStatusLabelMap } from "@/lib/serviceProgress";
import {
  getFamilyBindingsForFamily,
  getTodoStatusEvents,
  readDoctorTodos,
} from "@/lib/storage";
import { DemoUser, ProfileRow, ResidentTodoProgressItem } from "@/lib/types";
import { useDemoUser } from "@/lib/useDemoUser";

type AuthMode = "loading" | "supabase" | "demo" | "none";

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

function ServiceProgressPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser, isReady } = useDemoUser();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [items, setItems] = useState<ResidentTodoProgressItem[]>([]);
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
            const query = residentId ? `?residentId=${residentId}` : "";
            const response = await fetch(`/api/resident/todos${query}`, {
              method: "GET",
              cache: "no-store",
            });
            const payload = (await response.json().catch(() => ({}))) as {
              todos?: ResidentTodoProgressItem[];
            };
            setItems(payload.todos ?? buildLocalProgressItems(currentUser ?? {
              id: currentProfile.id,
              name: currentProfile.display_name,
              role: currentProfile.role,
              roleLabel: "当前身份",
              description: "",
              tags: [],
            }, residentId));
            return;
          }
        } catch {
          // fall through
        }
      }

      if (!isReady) {
        return;
      }

      if (currentUser) {
        setAuthMode("demo");
        setItems(buildLocalProgressItems(currentUser, residentId));
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

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[22px] border border-line/50 bg-[#FFF8ED] px-4 py-4">
            <p className="text-[11px] text-navy/50">待处理</p>
            <p className="mt-2 text-2xl font-bold text-navy">{pendingCount}</p>
          </div>
          <div className="rounded-[22px] border border-sage/20 bg-[#E8F0EE] px-4 py-4">
            <p className="text-[11px] text-sage">处理中</p>
            <p className="mt-2 text-2xl font-bold text-sage">{processingCount}</p>
          </div>
          <div className="rounded-[22px] border border-[#2F6C56]/20 bg-[#DDEFE4] px-4 py-4">
            <p className="text-[11px] text-[#2F6C56]">已处理</p>
            <p className="mt-2 text-2xl font-bold text-[#2F6C56]">{doneCount}</p>
          </div>
        </div>

        <SectionCard title="我的问题">
          {items.length ? (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-line/60 bg-[#FFF8ED] p-4">
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
                  <div className="mt-3 space-y-1.5 text-xs leading-5 text-navy/56">
                    <p>当前进度：{serviceStatusLabelMap[item.status]}</p>
                    <p>建议联系谁：{item.recommendedRoleLabel ?? "家庭医生"}</p>
                    <p>Claw 已帮我整理：{item.clawAnswer}</p>
                    <p>最近更新时间：{new Date(item.updatedAt).toLocaleString("zh-CN")}</p>
                  </div>
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
            <EmptyState title="目前没有需要家医团队处理的问题。" description="问 Claw 触发家医团队提醒后，这里会显示处理进度。" />
          )}
        </SectionCard>

        <div className="rounded-[20px] bg-[#FFF8ED] px-4 py-3 text-xs leading-5 text-navy/58">
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
