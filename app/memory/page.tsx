"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  PencilLine,
  Trash2,
  XCircle,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/ToastProvider";
import { useCurrentProfile } from "@/lib/useCurrentProfile";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MemoryType =
  | "symptom_report"
  | "medication_statement"
  | "daily_living"
  | "care_preference"
  | "health_experience"
  | "allergy_self_reported"
  | "lifestyle";

type Candidate = {
  id: string;
  memory_type: MemoryType;
  content: Record<string, unknown>;
  confidence: number | null;
  source_type: string | null;
  evidence_level: string | null;
  occurred_at: string | null;
  confirmation_status: string;
  created_at: string;
  updated_at: string;
};

type Memory = {
  id: string;
  memory_type: MemoryType;
  content: Record<string, unknown>;
  confidence: number | null;
  evidence_level: string | null;
  occurred_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  last_verified_at: string | null;
  confirmation_status: string;
  created_at: string;
  updated_at: string;
};

type Preference = {
  id: string;
  preference_type: string;
  structured_value: unknown;
  source_type: string | null;
  source_ref: string | null;
  confirmation_status: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type TimelineEvent = {
  date: string;
  event: string;
  source: string;
  type: string;
  memoryId?: string;
  observationId?: string;
};

type Tab = "pending" | "confirmed" | "preferences" | "timeline";

/* ------------------------------------------------------------------ */
/*  Labels                                                             */
/* ------------------------------------------------------------------ */

const memoryTypeLabels: Record<string, string> = {
  symptom_report: "症状自述",
  medication_statement: "用药记录",
  daily_living: "日常生活",
  care_preference: "照护偏好",
  health_experience: "健康经历",
  allergy_self_reported: "过敏自述",
  lifestyle: "生活方式",
};

const evidenceLabels: Record<string, string> = {
  self_reported: "本人自述",
  user_uploaded: "本人上传",
  staff_observed: "医护观察",
  clinician_verified: "医生确认",
  system_imported: "系统导入",
  system_derived: "系统推算",
};

const evidenceColors: Record<string, string> = {
  self_reported: "bg-navy/8 text-navy/70",
  user_uploaded: "bg-sage/10 text-sage",
  staff_observed: "bg-amber/10 text-amber",
  clinician_verified: "bg-amber/15 text-amber",
  system_imported: "bg-navy/5 text-navy/45",
  system_derived: "bg-navy/5 text-navy/45",
};

const timelineSourceColors: Record<string, string> = {
  self_reported: "bg-navy/8 text-navy/70",
  user_uploaded: "bg-sage/12 text-sage",
  clinician_verified: "bg-amber/12 text-amber",
  staff_observed: "bg-amber/12 text-amber",
  system: "bg-navy/5 text-navy/45",
  system_imported: "bg-navy/5 text-navy/45",
  system_derived: "bg-navy/5 text-navy/45",
};

const preferenceTypeLabels: Record<string, string> = {
  contact_channel: "联系渠道",
  preferred_time: "偏好时段",
  language: "语言偏好",
  communication_style: "沟通方式",
  visit_preference: "就诊偏好",
  pharmacy_preference: "药房偏好",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractSummary(content: Record<string, unknown>): string {
  const parts: string[] = [];
  if (content.symptom) parts.push(String(content.symptom));
  if (content.allergen) parts.push(`过敏: ${content.allergen}`);
  if (content.medication) parts.push(String(content.medication));
  if (content.dosage) parts.push(`剂量: ${content.dosage}`);
  if (content.frequency) parts.push(`频率: ${content.frequency}`);
  if (content.activity) parts.push(String(content.activity));
  if (content.action) parts.push(String(content.action));
  if (content.note) parts.push(String(content.note));
  if (content.description) parts.push(String(content.description));
  if (content.detail) parts.push(String(content.detail));
  if (parts.length === 0) {
    const raw = JSON.stringify(content);
    return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;
  }
  const joined = parts.join("；");
  return joined.length > 120 ? `${joined.slice(0, 120)}…` : joined;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

export default function MemoryPage() {
  const { profile } = useCurrentProfile();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("pending");

  /* ---------- Data states ---------- */
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingMemories, setLoadingMembers] = useState(true);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  const [error, setError] = useState("");

  /* ---------- Action states ---------- */
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editPrefId, setEditPrefId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  /* ---------- Fetch helpers ---------- */
  const rid = profile?.id ?? "";

  const loadCandidates = useCallback(async () => {
    if (!rid) return;
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/v1/memory/candidates?resident_id=${rid}&status=pending`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setCandidates(json.data?.candidates ?? []);
      else setError(json.error?.message ?? "候选列表加载失败");
    } catch {
      setError("网络连接失败，请检查网络。");
    } finally {
      setLoadingCandidates(false);
    }
  }, [rid]);

  const loadMemories = useCallback(async () => {
    if (!rid) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/v1/memory/items?resident_id=${rid}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setMemories(json.data?.memories ?? []);
      else if (!error) setError(json.error?.message ?? "记忆列表加载失败");
    } catch {
      if (!error) setError("网络连接失败，请检查网络。");
    } finally {
      setLoadingMembers(false);
    }
  }, [rid, error]);

  const loadPreferences = useCallback(async () => {
    if (!rid) return;
    setLoadingPrefs(true);
    try {
      const res = await fetch(`/api/v1/memory/preferences?resident_id=${rid}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setPreferences(json.data?.preferences ?? []);
      else if (!error) setError(json.error?.message ?? "偏好列表加载失败");
    } catch {
      if (!error) setError("网络连接失败，请检查网络。");
    } finally {
      setLoadingPrefs(false);
    }
  }, [rid, error]);

  const loadTimeline = useCallback(async () => {
    if (!rid) return;
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/v1/memory/health-timeline?resident_id=${rid}&months=3`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTimeline(json.data?.timeline ?? []);
      else if (!error) setError(json.error?.message ?? "健康轨迹加载失败");
    } catch {
      if (!error) setError("网络连接失败，请检查网络。");
    } finally {
      setLoadingTimeline(false);
    }
  }, [rid, error]);

  /* ---------- Initial loads ---------- */
  useEffect(() => { void loadCandidates(); }, [loadCandidates]);
  useEffect(() => { void loadMemories(); }, [loadMemories]);
  useEffect(() => { void loadPreferences(); }, [loadPreferences]);
  useEffect(() => { void loadTimeline(); }, [loadTimeline]);

  /* ---------- Actions ---------- */
  async function confirmCandidate(id: string) {
    if (!profile) return;
    setOperatingId(id);
    try {
      const res = await fetch(`/api/v1/memory/candidates/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_by: profile.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
        showToast("已确认并记入记忆", "success");
        void loadMemories();
      } else {
        showToast(json.error?.message ?? "操作失败", "warning");
      }
    } catch {
      showToast("网络错误，请重试", "danger");
    } finally {
      setOperatingId(null);
    }
  }

  async function rejectCandidate(id: string) {
    if (!profile) return;
    setOperatingId(id);
    try {
      const res = await fetch(`/api/v1/memory/candidates/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejected_by: profile.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
        showToast("已拒绝该候选", "info");
      } else {
        showToast(json.error?.message ?? "操作失败", "warning");
      }
    } catch {
      showToast("网络错误，请重试", "danger");
    } finally {
      setOperatingId(null);
    }
  }

  async function deleteMemory(id: string) {
    setOperatingId(id);
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/v1/memory/items/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        showToast("记忆已删除", "success");
      } else {
        showToast(json.error?.message ?? "删除失败", "warning");
      }
    } catch {
      showToast("网络错误，请重试", "danger");
    } finally {
      setOperatingId(null);
    }
  }

  async function savePreferenceEdit(id: string) {
    setEditPrefId(null);
    try {
      const res = await fetch(`/api/v1/memory/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structured_value: editValue }),
      });
      const json = await res.json();
      if (res.ok) {
        setPreferences((prev) => prev.map((preference) => (
          preference.id === id
            ? { ...preference, structured_value: editValue, updated_at: new Date().toISOString() }
            : preference
        )));
        showToast("偏好已更新", "success");
        if (!json.data?.simulated) void loadPreferences();
      } else {
        showToast(json.error?.message ?? "更新失败", "warning");
      }
    } catch {
      showToast("网络错误，请重试", "danger");
    }
  }

  /* ---------- Grouped memories ---------- */
  const groupedMemories = useMemo(() => {
    const groups = new Map<string, Memory[]>();
    for (const m of memories) {
      const key = m.memory_type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries());
  }, [memories]);

  /* ---------- Tab badge ---------- */
  const pendingCount = candidates.length;

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  return (
    <PhoneShell showBottomNav>
      <div className="resident-ui">
        <BackHeader title="CLAW 记忆" subtitle="查看和管理 AI 记忆" />

        <div className="space-y-4 px-4 pb-8 pt-2">
          {/* ---- Tab Switcher ---- */}
          <div className="ios-control grid grid-cols-4 gap-1 rounded-[26px] p-1.5">
            {([
              { key: "pending" as Tab, label: "待确认", badge: pendingCount },
              { key: "confirmed" as Tab, label: "已记住" },
              { key: "preferences" as Tab, label: "偏好" },
              { key: "timeline" as Tab, label: "健康轨迹" },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative rounded-[20px] px-1 py-3 text-sm font-semibold transition ${
                  tab === t.key
                    ? "bg-navy text-white shadow-[0_10px_24px_rgba(16,42,67,0.18)]"
                    : "text-navy/50"
                }`}
              >
                {t.label}
                {t.badge ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {t.badge > 99 ? "99+" : t.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* ---- Error ---- */}
          {error ? (
            <div className="rounded-[22px] border border-danger/20 bg-risk-soft p-4 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {/* ============================================================ */}
          {/*  Pending Candidates                                           */}
          {/* ============================================================ */}
          {tab === "pending" ? (
            loadingCandidates ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-[28px] border border-line/60 bg-surface-card p-4 space-y-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-10 w-20 rounded-full" />
                      <Skeleton className="h-10 w-20 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <EmptyState title="暂无待确认记忆" description="AI 从对话中提取的候选记忆会出现在这里，等待您确认。" />
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => (
                  <article
                    key={c.id}
                    className="ios-material rounded-[28px] p-4 animate-in"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-health-soft px-2.5 py-1 text-[11px] font-semibold text-sage">
                        {memoryTypeLabels[c.memory_type] ?? c.memory_type}
                      </span>
                      {c.evidence_level ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidenceColors[c.evidence_level] ?? "bg-navy/5 text-navy/45"}`}>
                          {evidenceLabels[c.evidence_level] ?? c.evidence_level}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-navy">{extractSummary(c.content)}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-navy/40">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{formatTime(c.created_at)}</span>
                      <span className="mx-1">·</span>
                      <span>来自对话</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={operatingId === c.id}
                        onClick={() => void confirmCandidate(c.id)}
                        className="ios-pressable flex h-11 min-w-[80px] items-center justify-center gap-1.5 rounded-full bg-sage px-4 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                        确认
                      </button>
                      <button
                        disabled={operatingId === c.id}
                        onClick={() => void rejectCandidate(c.id)}
                        className="ios-pressable flex h-11 min-w-[80px] items-center justify-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-semibold text-navy/60 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        拒绝
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : null}

          {/* ============================================================ */}
          {/*  Confirmed Memories                                           */}
          {/* ============================================================ */}
          {tab === "confirmed" ? (
            loadingMemories ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-[28px] border border-line/60 bg-surface-card p-4 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : memories.length === 0 ? (
              <EmptyState title="暂无已记住内容" description="确认候选记忆后，它们会出现在这里。" />
            ) : (
              <div className="space-y-4">
                {groupedMemories.map(([type, items]) => (
                  <SectionCard
                    key={type}
                    title={memoryTypeLabels[type] ?? type}
                    subtitle={`${items.length} 条记录`}
                  >
                    <div className="space-y-3">
                      {items.map((m) => (
                        <div
                          key={m.id}
                          className="relative rounded-[22px] border border-line/50 bg-surface-tint-soft p-4"
                        >
                          <p className="text-sm leading-6 text-navy">{extractSummary(m.content)}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {m.evidence_level ? (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${evidenceColors[m.evidence_level] ?? "bg-navy/5 text-navy/45"}`}>
                                {evidenceLabels[m.evidence_level] ?? m.evidence_level}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-navy/40">{formatTime(m.created_at)}</span>
                          </div>
                          {/* Action menu */}
                          <button
                            onClick={() => setMenuOpenId(menuOpenId === m.id ? null : m.id)}
                            className="ios-pressable absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-navy/30 hover:text-navy/60"
                            aria-label="操作菜单"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                          {menuOpenId === m.id ? (
                            <div className="absolute right-3 top-11 z-10 w-32 overflow-hidden rounded-[18px] border border-line bg-white shadow-float">
                              <button
                                onClick={() => void deleteMemory(m.id)}
                                className="ios-pressable flex w-full items-center gap-2 px-4 py-3 text-sm text-danger hover:bg-risk-soft"
                              >
                                <Trash2 className="h-4 w-4" />
                                删除
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ))}
              </div>
            )
          ) : null}

          {/* ============================================================ */}
          {/*  Preferences                                                  */}
          {/* ============================================================ */}
          {tab === "preferences" ? (
            loadingPrefs ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-[28px] border border-line/60 bg-surface-card p-4 space-y-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-3/4" />
                  </div>
                ))}
              </div>
            ) : preferences.length === 0 ? (
              <EmptyState title="暂无偏好设置" description="AI 识别到的沟通与服务偏好会出现在这里。" />
            ) : (
              <div className="space-y-3">
                {preferences.map((p) => {
                  const displayValue =
                    typeof p.structured_value === "string"
                      ? p.structured_value
                      : JSON.stringify(p.structured_value);
                  const isEditing = editPrefId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="ios-material rounded-[28px] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-sage">
                            {preferenceTypeLabels[p.preference_type] ?? p.preference_type}
                          </span>
                          {isEditing ? (
                            <div className="mt-2 flex gap-2">
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="h-11 flex-1 rounded-md border border-line bg-cream px-3 text-sm"
                                placeholder="输入新值"
                                autoFocus
                              />
                              <button
                                onClick={() => void savePreferenceEdit(p.id)}
                                className="ios-pressable flex h-11 items-center rounded-full bg-sage px-4 text-sm font-semibold text-white"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setEditPrefId(null)}
                                className="ios-pressable flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-navy/60"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="mt-1 text-sm font-semibold text-navy">{displayValue}</p>
                              <p className="mt-1 text-[11px] text-navy/40">
                                {formatTime(p.created_at)}
                                {p.confirmation_status === "user_confirmed" ? " · 已确认" : p.confirmation_status === "staff_confirmed" ? " · 医护确认" : ""}
                              </p>
                            </>
                          )}
                        </div>
                        {!isEditing ? (
                          <button
                            onClick={() => {
                              setEditPrefId(p.id);
                              setEditValue(displayValue);
                            }}
                            className="ios-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy/30 hover:text-sage"
                            aria-label="编辑"
                          >
                            <PencilLine className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}

          {/* ============================================================ */}
          {/*  Health Timeline                                              */}
          {/* ============================================================ */}
          {tab === "timeline" ? (
            loadingTimeline ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-4 w-16 shrink-0" />
                    <Skeleton className="h-16 flex-1" />
                  </div>
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <EmptyState title="暂无健康轨迹" description="已确认的记忆和健康观测将形成时间线。" />
            ) : (
              <div className="relative space-y-0">
                {/* Vertical line */}
                <div className="absolute bottom-0 left-[58px] top-0 w-px bg-line/60" />
                {timeline.map((evt, idx) => (
                  <div
                    key={`${evt.date}-${idx}`}
                    className="relative flex gap-3 pb-5"
                  >
                    {/* Date column */}
                    <div className="w-[50px] shrink-0 pt-0.5 text-right">
                      <p className="text-[11px] font-semibold leading-4 text-navy/50">
                        {new Date(evt.date).toLocaleDateString("zh-CN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    {/* Dot */}
                    <div className="relative z-10 flex w-4 shrink-0 items-start justify-center pt-1.5">
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-sage bg-white" />
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1 rounded-[22px] border border-line/50 bg-surface-tint-soft px-4 py-3">
                      <p className="text-sm leading-6 text-navy">{evt.event}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            timelineSourceColors[evt.source] ?? "bg-navy/5 text-navy/45"
                          }`}
                        >
                          {evidenceLabels[evt.source] ?? evt.source}
                        </span>
                        <span className="text-[11px] text-navy/35">
                          {new Date(evt.date).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}
