"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpen, ClipboardList, MessageSquareText } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import {
  STORAGE_CHANGE_EVENT,
  clearFeedbacks,
  createManagedCourseDraft,
  createManagedFaqDraft,
  createManagedTaskDraft,
  getDashboardMetrics,
  readCustomFaqs,
  readCustomCourses,
  readCustomTasks,
  readFeedbacks,
  readMergedCourses,
  readMergedFaqs,
  readMergedTasks,
  upsertCustomCourse,
  upsertCustomFaq,
  upsertCustomTask,
} from "@/lib/storage";
import { useDemoUser } from "@/lib/useDemoUser";
import {
  FeedbackItem,
  ManagedCourseItem,
  ManagedFaqItem,
  ManagedTaskItem,
  ProfileRow,
} from "@/lib/types";

const tabs = [
  "运行看板",
  "FAQ 管理",
  "小课堂管理",
  "任务与积分管理",
  "体验反馈",
] as const;

type AdminTab = (typeof tabs)[number];
type AdminMode = "local" | "supabase";

type DashboardMetrics = ReturnType<typeof getDashboardMetrics>;

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-line/50 bg-[#FFF8ED] px-4 py-4">
      <p className="text-[11px] tracking-wide text-navy/50">{title}</p>
      <p className="mt-2 text-2xl font-bold text-navy">{value}</p>
      <p className="mt-2 text-xs leading-5 text-navy/55">{description}</p>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: AdminTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
        active
          ? "bg-navy text-white shadow-soft"
          : "border border-line/70 bg-[#FFF8ED] text-navy hover:bg-[#FAF0DD]"
      }`}
    >
      {label}
    </button>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-navy">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-[18px] border border-line/70 bg-[#FFF8ED] px-4 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30 placeholder:text-navy/35"
      />
    </label>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-navy">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-24 w-full rounded-[18px] border border-line/70 bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30 placeholder:text-navy/35"
      />
    </label>
  );
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-3 text-sm leading-6 text-navy/68">
      {children}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser } = useDemoUser();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>("运行看板");
  const [faqSearch, setFaqSearch] = useState("");
  const [faqDraft, setFaqDraft] = useState<ManagedFaqItem>(createManagedFaqDraft());
  const [courseDraft, setCourseDraft] = useState<ManagedCourseItem>(createManagedCourseDraft());
  const [taskDraft, setTaskDraft] = useState<ManagedTaskItem>(createManagedTaskDraft());
  const [faqItems, setFaqItems] = useState<ManagedFaqItem[]>([]);
  const [courseItems, setCourseItems] = useState<ManagedCourseItem[]>([]);
  const [taskItems, setTaskItems] = useState<ManagedTaskItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(() => getDashboardMetrics());
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [adminMode, setAdminMode] = useState<AdminMode>("local");

  const isSupabaseAdmin = profile?.role === "admin";
  const isLocalAdmin = currentUser?.role === "admin";
  const canAccessAdmin = isSupabaseAdmin || isLocalAdmin;

  function syncLocalData() {
    setCourseItems(readMergedCourses());
    setTaskItems(readMergedTasks());
    setFeedbacks(readFeedbacks());
  }

  useEffect(() => {
    syncLocalData();

    function handleStorageChange() {
      syncLocalData();
      if (adminMode === "local") {
        setFaqItems(readMergedFaqs());
        setMetrics(getDashboardMetrics());
      }
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [adminMode]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (supabase) {
        try {
          const currentProfile = await fetchCurrentProfile(supabase);
          if (!active) {
            return;
          }

          if (currentProfile?.role === "admin") {
            setProfile(currentProfile);
            setAdminMode("supabase");
            return;
          }
        } catch {
          // Fall through to local mode.
        }
      }

      if (active) {
        setProfile(null);
        setAdminMode("local");
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function loadSupabaseFaqs() {
    const response = await fetch("/api/faqs", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      items?: ManagedFaqItem[];
    };

    if (!response.ok) {
      throw new Error(payload.message ?? "Failed to load FAQs");
    }

    setFaqItems(payload.items ?? []);
  }

  async function loadSupabaseDashboard() {
    const response = await fetch("/api/admin/dashboard", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      askCountToday?: number;
      faqHitCount?: number;
      safetyBlockCount?: number;
      kimiCount?: number;
      fallbackCount?: number;
      doctorTodoCount?: number;
    };

    if (!response.ok) {
      throw new Error(payload.message ?? "Failed to load dashboard metrics");
    }

    const localMetrics = getDashboardMetrics();
    setMetrics({
      ...localMetrics,
      askCountToday: payload.askCountToday ?? localMetrics.askCountToday,
      faqHitCount: payload.faqHitCount ?? localMetrics.faqHitCount,
      safetyBlockCount: payload.safetyBlockCount ?? localMetrics.safetyBlockCount,
      kimiCount: payload.kimiCount ?? localMetrics.kimiCount,
      fallbackCount: payload.fallbackCount ?? localMetrics.fallbackCount,
      doctorTodoCount: payload.doctorTodoCount ?? localMetrics.doctorTodoCount,
    });
  }

  useEffect(() => {
    let active = true;

    async function syncAdminData() {
      if (adminMode === "supabase" && isSupabaseAdmin) {
        try {
          await Promise.all([loadSupabaseFaqs(), loadSupabaseDashboard()]);
          return;
        } catch {
          if (!active) {
            return;
          }
          setAdminMode("local");
          setFaqItems(readMergedFaqs());
          setMetrics(getDashboardMetrics());
          return;
        }
      }

      setFaqItems(readMergedFaqs());
      setMetrics(getDashboardMetrics());
    }

    void syncAdminData();

    return () => {
      active = false;
    };
  }, [adminMode, isSupabaseAdmin]);

  const filteredFaqItems = useMemo(() => {
    const keyword = faqSearch.trim().toLowerCase();

    if (!keyword) {
      return faqItems;
    }

    return faqItems.filter((item) =>
      [item.question, item.category, item.answer, item.keywords.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [faqItems, faqSearch]);

  if (!canAccessAdmin) {
    return (
      <PhoneShell>
        <div className="space-y-5 bg-[#F3DDC2] px-4 pb-8">
          <BackHeader title="管理后台" subtitle="当前页面仅对管理员开放。" />
          <SectionCard>
            <div className="rounded-[24px] bg-[#FFF8ED] p-5 text-center">
              <p className="text-lg font-semibold text-navy">当前身份暂无管理员权限</p>
              <p className="mt-3 text-sm leading-6 text-navy/66">
                请切换到管理员身份后，再查看运行看板和内容配置。
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
                >
                  返回首页
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="rounded-full border border-line bg-cream px-4 py-2 text-sm font-semibold text-navy"
                >
                  切换身份
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  async function saveFaqDraft() {
    const next: ManagedFaqItem = {
      ...faqDraft,
      question: faqDraft.question.trim(),
      keywords: faqDraft.keywords.filter(Boolean),
      category: faqDraft.category.trim(),
      answer: faqDraft.answer.trim(),
      nextStep: faqDraft.nextStep.trim(),
      isActive: faqDraft.isActive ?? true,
    };

    if (!next.question || !next.answer) {
      showToast("FAQ 至少需要填写问题和回答。", "warning");
      return;
    }

    if (adminMode === "supabase" && isSupabaseAdmin) {
      try {
        const response = await fetch("/api/faqs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: next.id.startsWith("faq-") ? undefined : next.id,
            question: next.question,
            keywords: next.keywords,
            category: next.category,
            answer: next.answer,
            nextStep: next.nextStep,
            suggestDoctor: next.suggestDoctor,
            riskLevel: next.riskLevel,
            isActive: next.isActive,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          item?: ManagedFaqItem;
        };

        if (!response.ok || !payload.item) {
          throw new Error(payload.message ?? "FAQ 保存失败");
        }

        await loadSupabaseFaqs();
        setFaqDraft(createManagedFaqDraft());
        showToast("FAQ 已保存到 Supabase。", "success");
        return;
      } catch {
        showToast("Supabase FAQ 保存失败，当前未改动本地 FAQ。", "warning");
        return;
      }
    }

    upsertCustomFaq(next);
    setFaqDraft(createManagedFaqDraft());
    showToast("FAQ 已保存，本页与问答页会优先读取新配置。", "success");
  }

  function saveCourseDraft() {
    const next: ManagedCourseItem = {
      ...courseDraft,
      title: courseDraft.title.trim(),
      category: courseDraft.category.trim(),
      audience: courseDraft.audience.trim(),
      summary: courseDraft.summary.trim(),
      duration: courseDraft.duration.trim(),
      points: Number(courseDraft.points) || 0,
      isActive: courseDraft.isActive ?? true,
    };

    if (!next.title || !next.summary) {
      showToast("小课堂至少需要填写标题和摘要。", "warning");
      return;
    }

    upsertCustomCourse(next);
    setCourseDraft(createManagedCourseDraft());
    showToast("小课堂内容已保存，课程页会优先读取本地配置。", "success");
  }

  function saveTaskDraft() {
    const next: ManagedTaskItem = {
      ...taskDraft,
      title: taskDraft.title.trim(),
      description: taskDraft.description.trim(),
      points: Number(taskDraft.points) || 0,
      isActive: taskDraft.isActive ?? true,
    };

    if (!next.title) {
      showToast("任务至少需要填写名称。", "warning");
      return;
    }

    upsertCustomTask(next);
    setTaskDraft(createManagedTaskDraft());
    showToast("任务配置已保存，任务页会优先读取本地配置。", "success");
  }

  async function toggleFaq(item: ManagedFaqItem) {
    if (adminMode === "supabase" && isSupabaseAdmin) {
      try {
        const response = await fetch("/api/faqs", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.id,
            isActive: !item.isActive,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? "FAQ 状态更新失败");
        }
        await loadSupabaseFaqs();
        showToast(item.isActive ? "FAQ 已停用。" : "FAQ 已启用。", "success");
        return;
      } catch {
        showToast("Supabase FAQ 状态更新失败。", "warning");
        return;
      }
    }

    upsertCustomFaq({
      ...item,
      isActive: !item.isActive,
    });
  }

  function renderDashboard() {
    const cards = [
      {
        title: "今日提问数",
        value: metrics.askCountToday,
        description: "统计今天在问 Claw 页面提交的问题数量。",
      },
      {
        title: "FAQ 命中数",
        value: metrics.faqHitCount,
        description: "说明有多少问题被标准问答直接接住。",
      },
      {
        title: "安全拦截数",
        value: metrics.safetyBlockCount,
        description: "说明有多少停药、诊断、急症类问题被系统拦截。",
      },
      {
        title: "Kimi 生成数",
        value: metrics.kimiCount,
        description: "说明有多少问题进入了模型生成链路。",
      },
      {
        title: "兜底提示数",
        value: metrics.fallbackCount,
        description: "说明有多少问题没有命中 FAQ 或知识库，进入兜底提示。",
      },
      {
        title: "今日任务完成数",
        value: metrics.taskCompleteCountToday,
        description: "统计今天已写入任务记录的完成次数。",
      },
      {
        title: "积分发放总数",
        value: metrics.totalPointsAwarded,
        description: "当前仍按本地演示积分统计，用于原型展示。",
      },
      {
        title: "医生待办数",
        value: metrics.doctorTodoCount,
        description: "说明有多少问题需要转给家医团队处理。",
      },
      {
        title: "健康小组消息数",
        value: metrics.groupMessageCount,
        description: "统计当前原型中的群消息总数。",
      },
      {
        title: "体验反馈数",
        value: metrics.feedbackCount,
        description: "统计当前已提交的体验反馈数量。",
      },
    ];

    return (
      <SectionCard title="运行看板">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <MetricCard key={card.title} {...card} />
          ))}
        </div>
      </SectionCard>
    );
  }

  function renderFaqTab() {
    const customIds = new Set(adminMode === "local" ? readCustomFaqs().map((item) => item.id) : []);

    return (
      <div className="space-y-5">
        <SectionCard title="FAQ 管理" action={<Activity className="h-4 w-4 text-sage" />}>
          <div className="space-y-4">
            <FormInput
              label="搜索 FAQ"
              value={faqSearch}
              onChange={setFaqSearch}
              placeholder="按问题、关键词、分类或回答搜索"
            />

            <SectionHint>
              {adminMode === "supabase"
                ? "/ask 会优先读取 Supabase FAQ；安全拦截仍然始终最高优先级。"
                : "/ask 会优先读取这里保存的本地 FAQ，再补充默认 FAQ；安全拦截仍然始终最高优先级。"}
            </SectionHint>

            <div className="space-y-3">
              {filteredFaqItems.map((item) => (
                <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">{item.question}</p>
                      <p className="mt-1 text-xs text-navy/56">
                        {item.category} / {item.riskLevel} / {item.isActive ? "启用中" : "已停用"}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F3E4CD] px-3 py-1 text-xs font-semibold text-navy">
                      {adminMode === "supabase"
                        ? "数据库"
                        : customIds.has(item.id)
                          ? "本地配置"
                          : "默认"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-navy/72 line-clamp-3">{item.answer}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFaqDraft(item)}
                      className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleFaq(item)}
                      className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
                    >
                      {item.isActive ? "停用" : "启用"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="新增 / 编辑 FAQ">
          <div className="space-y-4">
            <FormInput
              label="问题"
              value={faqDraft.question}
              onChange={(value) => setFaqDraft((current) => ({ ...current, question: value }))}
            />
            <FormInput
              label="关键词"
              value={faqDraft.keywords.join(", ")}
              onChange={(value) =>
                setFaqDraft((current) => ({
                  ...current,
                  keywords: value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="用逗号分隔，例如：健康云, 登录, 不会用"
            />
            <FormInput
              label="分类"
              value={faqDraft.category}
              onChange={(value) => setFaqDraft((current) => ({ ...current, category: value }))}
            />
            <FormTextarea
              label="回答"
              value={faqDraft.answer}
              onChange={(value) => setFaqDraft((current) => ({ ...current, answer: value }))}
            />
            <FormTextarea
              label="下一步建议"
              value={faqDraft.nextStep}
              onChange={(value) => setFaqDraft((current) => ({ ...current, nextStep: value }))}
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-navy">风险等级</span>
              <select
                value={faqDraft.riskLevel}
                onChange={(event) =>
                  setFaqDraft((current) => ({
                    ...current,
                    riskLevel: event.target.value as ManagedFaqItem["riskLevel"],
                  }))
                }
                className="h-12 w-full rounded-[18px] border border-line/70 bg-[#FFF8ED] px-4 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
              >
                <option value="low">low - 低风险</option>
                <option value="medium">medium - 中风险</option>
                <option value="high">high - 高风险</option>
                <option value="emergency">emergency - 紧急</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-[18px] border border-line/70 bg-[#FFF8ED] px-4 py-3.5 transition hover:bg-[#FAF0DD]">
              <input
                type="checkbox"
                checked={faqDraft.suggestDoctor}
                onChange={(event) =>
                  setFaqDraft((current) => ({ ...current, suggestDoctor: event.target.checked }))
                }
                className="h-5 w-5 rounded border-line accent-navy"
              />
              <span className="text-sm font-semibold text-navy">建议联系医生</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void saveFaqDraft()}
                className="flex-1 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
              >
                保存 FAQ
              </button>
              <button
                type="button"
                onClick={() => setFaqDraft(createManagedFaqDraft())}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                新建
              </button>
            </div>
            {adminMode === "supabase" ? (
              <SectionHint>当前使用 Supabase FAQ。保存后，/ask 会优先命中新 FAQ。</SectionHint>
            ) : (
              <SectionHint>当前使用本地 FAQ 演示模式。保存后无需刷新页面也能立即生效。</SectionHint>
            )}
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderCourseTab() {
    const customIds = new Set(readCustomCourses().map((item) => item.id));

    return (
      <div className="space-y-5">
        <SectionCard title="小课堂管理" action={<BookOpen className="h-4 w-4 text-sage" />}>
          <div className="space-y-3">
            <SectionHint>/courses 继续优先读取这里保存的本地课程内容，再回退到默认课程。</SectionHint>
            {courseItems.map((item) => (
              <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{item.title}</p>
                    <p className="mt-1 text-xs text-navy/56">
                      {item.category} / {item.duration} / {item.points} 分 / {item.isActive ? "启用中" : "已停用"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F3E4CD] px-3 py-1 text-xs font-semibold text-navy">
                    {customIds.has(item.id) ? "本地配置" : "默认"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-navy/72">{item.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCourseDraft(item)}
                    className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      upsertCustomCourse({
                        ...item,
                        isActive: !item.isActive,
                      })
                    }
                    className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
                  >
                    {item.isActive ? "停用" : "启用"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="新增 / 编辑小课堂">
          <div className="space-y-4">
            <FormInput
              label="标题"
              value={courseDraft.title}
              onChange={(value) => setCourseDraft((current) => ({ ...current, title: value }))}
            />
            <FormInput
              label="分类"
              value={courseDraft.category}
              onChange={(value) => setCourseDraft((current) => ({ ...current, category: value }))}
            />
            <FormInput
              label="适用人群"
              value={courseDraft.audience}
              onChange={(value) => setCourseDraft((current) => ({ ...current, audience: value }))}
            />
            <FormTextarea
              label="摘要"
              value={courseDraft.summary}
              onChange={(value) => setCourseDraft((current) => ({ ...current, summary: value }))}
            />
            <FormInput
              label="时长"
              value={courseDraft.duration}
              onChange={(value) => setCourseDraft((current) => ({ ...current, duration: value }))}
            />
            <FormInput
              label="积分"
              type="number"
              value={courseDraft.points}
              onChange={(value) =>
                setCourseDraft((current) => ({ ...current, points: Number(value) || 0 }))
              }
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={saveCourseDraft}
                className="flex-1 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
              >
                保存小课堂
              </button>
              <button
                type="button"
                onClick={() => setCourseDraft(createManagedCourseDraft())}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                新建
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderTaskTab() {
    const customIds = new Set(readCustomTasks().map((item) => item.id));

    return (
      <div className="space-y-5">
        <SectionCard title="任务与积分管理" action={<ClipboardList className="h-4 w-4 text-sage" />}>
          <div className="space-y-3">
            <SectionHint>/tasks 继续保留数据库优先 + 本地 fallback，管理员本地配置仍用于演示模式。</SectionHint>
            {taskItems.map((item) => (
              <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{item.title}</p>
                    <p className="mt-1 text-xs text-navy/56">
                      {item.category} / {item.points} 分 / {item.isActive ? "启用中" : "已停用"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F3E4CD] px-3 py-1 text-xs font-semibold text-navy">
                    {customIds.has(item.id) ? "本地配置" : "默认"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-navy/72">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskDraft(item)}
                    className="rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      upsertCustomTask({
                        ...item,
                        isActive: !item.isActive,
                      })
                    }
                    className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
                  >
                    {item.isActive ? "停用" : "启用"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="新增 / 编辑任务">
          <div className="space-y-4">
            <FormInput
              label="任务名称"
              value={taskDraft.title}
              onChange={(value) => setTaskDraft((current) => ({ ...current, title: value }))}
            />
            <FormTextarea
              label="任务说明"
              value={taskDraft.description}
              onChange={(value) => setTaskDraft((current) => ({ ...current, description: value }))}
            />
            <FormInput
              label="分类"
              value={taskDraft.category}
              onChange={(value) =>
                setTaskDraft((current) => ({
                  ...current,
                  category: value as ManagedTaskItem["category"],
                }))
              }
              placeholder="medicine / record / course / group / followup / other"
            />
            <FormInput
              label="积分"
              type="number"
              value={taskDraft.points}
              onChange={(value) =>
                setTaskDraft((current) => ({ ...current, points: Number(value) || 0 }))
              }
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={saveTaskDraft}
                className="flex-1 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white"
              >
                保存任务
              </button>
              <button
                type="button"
                onClick={() => setTaskDraft(createManagedTaskDraft())}
                className="rounded-full border border-line bg-cream px-4 py-3 text-sm font-semibold text-navy"
              >
                新建
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="积分规则说明" action={<Activity className="h-4 w-4 text-sage" />}>
          <div className="space-y-3 rounded-[22px] bg-[#FFF8ED] px-4 py-4 text-sm leading-6 text-navy/72">
            <p>积分不能提现。</p>
            <p>积分不能充值。</p>
            <p>积分不能购买处方药。</p>
            <p>积分不能医保支付。</p>
            <p>积分不承诺疗效。</p>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderFeedbackTab() {
    return (
      <div className="space-y-5">
        <SectionCard title="体验反馈" action={<MessageSquareText className="h-4 w-4 text-sage" />}>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[22px] bg-[#FFF8ED] px-4 py-3">
            <p className="text-sm text-navy/72">当前共收到 {feedbacks.length} 条反馈。</p>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("确认清空全部体验反馈吗？此操作仅清除本地演示数据。")) {
                  return;
                }

                clearFeedbacks();
                showToast("体验反馈已清空。", "success");
              }}
              className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-navy"
            >
              清空反馈
            </button>
          </div>

          <div className="space-y-3">
            {feedbacks.length ? (
              feedbacks.map((item) => (
                <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
                  <p className="text-xs text-navy/56">{new Date(item.createdAt).toLocaleString()}</p>
                  <p className="mt-2 text-sm font-semibold text-navy">{item.identity}</p>
                  <p className="mt-3 text-sm text-navy/72">最有用功能：{item.mostUseful || "未填写"}</p>
                  <p className="mt-2 text-sm text-navy/72">不好懂的地方：{item.unclearPart || "未填写"}</p>
                  <p className="mt-2 text-sm text-navy/72">是否愿意推荐：{item.recommend}</p>
                  <p className="mt-2 text-sm text-navy/72">其他建议：{item.otherSuggestion || "未填写"}</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="还没有体验反馈"
                description="居民或家属在反馈页提交后，这里会自动显示本地演示数据。"
              />
            )}
          </div>

          <div className="mt-4 text-right">
            <Link href="/feedback" className="text-sm text-navy/58 underline underline-offset-4">
              前往反馈页查看用户提交流程
            </Link>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <PhoneShell>
      <div className="space-y-5 bg-[#F3DDC2] px-4 pb-8">
        <BackHeader
          title="家医 Claw 管理后台"
          subtitle={
            adminMode === "supabase"
              ? "当前为 Supabase 管理模式：FAQ 和问答运行数据优先读取数据库。"
              : "当前为本地演示模式：FAQ、反馈和看板统计继续使用 localStorage。"
          }
        />

        <div className="flex flex-wrap gap-2 rounded-[22px] border border-line/60 bg-cream p-3">
          {tabs.map((tab) => (
            <TabButton
              key={tab}
              label={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            />
          ))}
        </div>

        {activeTab === "运行看板" ? renderDashboard() : null}
        {activeTab === "FAQ 管理" ? renderFaqTab() : null}
        {activeTab === "小课堂管理" ? renderCourseTab() : null}
        {activeTab === "任务与积分管理" ? renderTaskTab() : null}
        {activeTab === "体验反馈" ? renderFeedbackTab() : null}
      </div>
    </PhoneShell>
  );
}
