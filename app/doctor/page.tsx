"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ClipboardList,
  GraduationCap,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { getDoctorTodosForUser } from "@/lib/db/doctorTodos";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchCurrentProfile,
  getRoleLabel,
  isWorkbenchRole,
} from "@/lib/supabase/mvp";
import { AppRole, DoctorTodoRow } from "@/lib/types";

const demoResidentProgress = [
  "张阿姨：已完成服药、血压记录",
  "李叔叔：未完成血糖记录",
  "王阿姨：已观看小课堂",
  "陈伯伯：随访确认待回复",
];

const demoGroupAlerts = [
  "有居民询问“血压很高怎么办”",
  "有居民上传“药盒照片”",
  "有居民询问“能不能停药”",
];

const statusLabelMap: Record<DoctorTodoRow["status"], string> = {
  pending: "待处理",
  processing: "处理中",
  done: "已完成",
  ignored: "已忽略",
};

export default function DoctorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { showToast } = useToast();
  const [role, setRole] = useState<AppRole | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [todos, setTodos] = useState<DoctorTodoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTodos() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const profile = await fetchCurrentProfile(supabase);

      if (!active || !profile) {
        setIsLoading(false);
        return;
      }

      setRole(profile.role);
      setProfileId(profile.id);

      if (!isWorkbenchRole(profile.role)) {
        router.replace("/me");
        setIsLoading(false);
        return;
      }

      const todoRows = await getDoctorTodosForUser(profile.id, profile.role, supabase);

      if (!active) {
        return;
      }

      setTodos(todoRows);
      setIsSupabaseMode(todoRows.length > 0);
      setIsLoading(false);
    }

    void loadTodos();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function updateStatus(todoId: string, status: DoctorTodoRow["status"]) {
    const response = await fetch("/api/doctor/todos", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ todoId, status }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      message?: string;
      todo?: DoctorTodoRow;
    };

    if (!response.ok) {
      showToast(payload.message || "状态更新失败。", "warning");
      return;
    }

    setTodos((current) =>
      current.map((item) => (item.id === todoId ? { ...item, status } : item)),
    );
    showToast("任务状态已更新。", "success");
  }

  const pendingCount = todos.filter((item) => item.status === "pending").length;
  const riskCount = todos.filter(
    (item) => item.risk_level === "high" || item.risk_level === "emergency",
  ).length;

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title="家医团队工作台"
          subtitle={
            role
              ? `当前角色：${getRoleLabel(role)}`
              : "隐藏演示页，不作为居民端主入口"
          }
        />

        <SectionCard title="今日概览">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "待处理工单",
                value: isSupabaseMode ? `${todos.length} 条` : "12 条",
                icon: Users,
              },
              {
                label: "高风险提醒",
                value: isSupabaseMode ? `${riskCount} 条` : "2 条",
                icon: AlertTriangle,
              },
              {
                label: "处理中任务",
                value: isSupabaseMode ? `${pendingCount} 条` : "3 条",
                icon: ClipboardList,
              },
              {
                label: "小课堂推送",
                value: isSupabaseMode ? "已接演示数据" : "3 条",
                icon: GraduationCap,
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-[24px] bg-[#FFF8ED] px-4 py-4">
                  <div className="flex items-center gap-2 text-sage">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs tracking-[0.14em] text-navy/52">{stat.label}</span>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-navy">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="角色可处理任务">
          {isLoading ? (
            <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4 text-sm text-navy/66">
              正在读取 Supabase 工作台数据...
            </div>
          ) : todos.length ? (
            <div className="space-y-3">
              {todos.map((todo) => (
                <div key={todo.id} className="rounded-[24px] bg-[#FFF8ED] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">{todo.title}</p>
                      <p className="mt-1 text-xs text-navy/56">
                        {todo.type}｜风险 {todo.risk_level}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-navy/72">
                        {todo.description}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F3E4CD] px-3 py-1 text-xs font-semibold text-navy">
                      {statusLabelMap[todo.status]}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["pending", "processing", "done"] as DoctorTodoRow["status"][]).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void updateStatus(todo.id, status)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            todo.status === status
                              ? "bg-navy text-white"
                              : "border border-line bg-cream text-navy"
                          }`}
                        >
                          {statusLabelMap[status]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4 text-sm leading-6 text-navy/66">
              当前没有读取到可处理工单。若 Supabase 未配置，下面仍保留演示内容。
            </div>
          )}
        </SectionCard>

        <SectionCard title="居民任务完成情况">
          <div className="space-y-3">
            {demoResidentProgress.map((line) => (
              <div key={line} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3 text-sm text-navy">
                {line}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="群聊风险提醒">
          <div className="space-y-3">
            {demoGroupAlerts.map((line) => (
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

        {profileId ? (
          <p className="px-1 text-xs text-navy/52">
            {isSupabaseMode
              ? "当前工作台任务优先从 Supabase doctor_todos 读取。"
              : "当前仍保留演示工单内容，Supabase 未命中时会自动回退。"}
          </p>
        ) : null}
      </div>
    </PhoneShell>
  );
}
