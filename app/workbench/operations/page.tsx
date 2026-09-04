"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ExternalLink,
  History,
  MessageCircleMore,
  RefreshCw,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { WorkbenchHeader } from "@/components/workbench/WorkbenchHeader";

type Tab = "bindings" | "facts" | "content" | "schedules" | "broadcasts";
type ModuleState = "available" | "forbidden" | "error";
export default function OperationsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("facts");
  const [bindings, setBindings] = useState<Array<Record<string, unknown>>>([]);
  const [facts, setFacts] = useState<Array<Record<string, unknown>>>([]);
  const [content, setContent] = useState<Array<Record<string, unknown>>>([]);
  const [schedules, setSchedules] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [broadcasts, setBroadcasts] = useState<Array<Record<string, unknown>>>(
    [],
  );
  const [expiryDays, setExpiryDays] = useState<Record<string, number>>({});
  const [contentEdits, setContentEdits] = useState<Record<string, { title: string; summary: string }>>({});
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [moduleState, setModuleState] = useState<Record<Tab, ModuleState>>({
    bindings: "available",
    facts: "available",
    content: "available",
    schedules: "available",
    broadcasts: "available",
  });
  const load = useCallback(async () => {
    setLoading(true);
    const endpoints = [
      "/api/v1/staff/care-bindings?status=pending",
      "/api/v1/staff/group-work-queue",
      "/api/v1/admin/content-sources",
      "/api/v1/admin/schedules",
      "/api/v1/admin/broadcasts",
    ];
    const responses = await Promise.all(
      endpoints.map((url) =>
        fetch(url, { cache: "no-store" })
          .then(async (response) => ({
            ok: response.ok,
            status: response.status,
            payload: await response.json(),
          }))
          .catch(() => ({ ok: false, status: 0, payload: null })),
      ),
    );
    const stateFor = (index: number): ModuleState => responses[index].ok ? "available" : responses[index].status === 401 || responses[index].status === 403 ? "forbidden" : "error";
    setModuleState({
      bindings: stateFor(0),
      facts: stateFor(1),
      content: stateFor(2),
      schedules: stateFor(3),
      broadcasts: stateFor(4),
    });
    if (responses[0].ok) setBindings(responses[0].payload.data.bindings ?? []);
    if (responses[1].ok) {
      setFacts(responses[1].payload.data.candidates ?? []);
      setIsDemo(Boolean(responses[1].payload.data.demo));
    }
    if (responses[2].ok) setContent(responses[2].payload.data.candidates ?? []);
    if (responses[3].ok)
      setSchedules(responses[3].payload.data.schedules ?? []);
    if (responses[4].ok)
      setBroadcasts(responses[4].payload.data.broadcasts ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function fact(id: string, decision: "confirm" | "reject") {
    if (isDemo) {
      setFacts((items) => items.filter((item) => String(item.id) !== id));
      showToast(decision === "confirm" ? "演示：候选事实已模拟确认入档。" : "演示：候选事实已模拟拒绝。", "success");
      return;
    }
    const response = await fetch(
      `/api/v1/staff/fact-candidates/${id}/${decision}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    const payload = await response.json();
    if (!response.ok)
      return showToast(payload.error?.message ?? "操作失败", "warning");
    showToast(
      decision === "confirm"
        ? "事实已确认并写入相应服务记录。"
        : "候选事实已拒绝。",
      "success",
    );
    await load();
  }
  async function review(id: string, decision: "publish" | "reject") {
    const days = expiryDays[id] ?? 90;
    const edit = contentEdits[id];
    const response = await fetch("/api/v1/admin/content-sources/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: id,
        decision,
        note:
          decision === "publish"
            ? `运营人员审核通过，有效期 ${days} 天`
            : "内容不适合发布",
        expiresAt:
          decision === "publish"
            ? new Date(Date.now() + days * 86_400_000).toISOString()
            : null,
        ...(decision === "publish" && edit ? {
          title: edit.title,
          summary: edit.summary,
        } : {}),
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      return showToast(payload.error?.message ?? "审核失败", "warning");
    showToast("内容审核状态已更新。", "success");
    await load();
  }
  async function verify(id: string, decision: "verified" | "cancelled") {
    const response = await fetch("/api/v1/admin/schedules/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleIds: [id],
        decision,
        note: decision === "verified" ? "机构负责人核验" : "排班取消",
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      return showToast(payload.error?.message ?? "核验失败", "warning");
    showToast("排班状态已更新。", "success");
    await load();
  }
  async function reviewBinding(
    id: string,
    decision: "active" | "pending" | "revoked",
  ) {
    const response = await fetch("/api/v1/staff/care-bindings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bindingId: id,
        decision,
        note:
          decision === "active"
            ? "已核对居民所属社区及家医签约关系"
            : "资料不一致，请居民联系社区补充核验",
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      return showToast(payload.error?.message ?? "签约核验失败", "warning");
    showToast(
      decision === "active"
        ? "签约关系已核验，居民服务权限已开放。"
        : "该登记已退回补充核验。",
      "success",
    );
    await load();
  }
  const tabs: Array<{
    id: Tab;
    label: string;
    icon: typeof Activity;
    count: number;
  }> = [
    {
      id: "bindings",
      label: "签约核验",
      icon: UserRoundCheck,
      count: bindings.length,
    },
    {
      id: "facts",
      label: "群事实",
      icon: MessageCircleMore,
      count: facts.length,
    },
    { id: "content", label: "内容审核", icon: BookOpen, count: content.length },
    {
      id: "schedules",
      label: "排班核验",
      icon: CalendarCheck2,
      count: schedules.filter((item) => item.status === "draft").length,
    },
    {
      id: "broadcasts",
      label: "群通知",
      icon: Activity,
      count: broadcasts.length,
    },
  ];
  return (
    <main className="min-h-dvh bg-[#F3F5F4] text-navy">
      <WorkbenchHeader
        title="运营协同"
        subtitle="居民签约、群事实、内容、排班和通知的人工审核中枢"
        actions={
          <button
            onClick={() => void load()}
            aria-label="刷新"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />
      {isDemo ? (
        <div className="border-b border-[#E5C77B] bg-[#FFF8E7] px-5 py-2 text-center text-xs text-[#7A5A12]">
          全功能演示模式：可模拟审核与确认，结果不会写入真实居民档案。
        </div>
      ) : null}
      <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex min-w-0 items-center justify-between rounded-[14px] border p-3 text-left sm:rounded-[8px] ${tab === item.id ? "border-navy bg-navy text-white" : "border-line bg-white"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <item.icon className="h-4 w-4" />
                {item.label}
              </span>
              <span className="text-xs">
                {moduleState[item.id] === "available" ? item.count : moduleState[item.id] === "forbidden" ? "无权限" : "异常"}
              </span>
            </button>
          ))}
        </div>
        {loading ? (
          <div className="py-20 text-center text-sm text-navy/50">
            正在读取工作队列...
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[18px] sm:mt-5 sm:rounded-[8px]">
            {moduleState[tab] !== "available" ? (
              <div className="border border-dashed border-line bg-white p-10 text-center">
                <p className="text-sm font-semibold">{moduleState[tab] === "forbidden" ? "当前岗位没有该模块权限" : "该模块暂时无法读取"}</p>
                <p className="mt-2 text-xs text-navy/45">
                  {moduleState[tab] === "forbidden" ? "内容发布、排班核验和群通知由社区运营或管理员负责；系统不会把无权限误显示成“没有待办”。" : "可能是网络或服务接口异常，请点击右上角刷新；系统不会把读取失败误显示成“没有待办”。"}
                </p>
              </div>
            ) : null}
        {moduleState.bindings === "available" && tab === "bindings" ? (
              bindings.length ? (
                <div className="divide-y divide-line rounded-md border border-line bg-white">
                  {bindings.map((item) => {
                    const resident = Array.isArray(item.resident)
                      ? item.resident[0]
                      : (item.resident as Record<string, unknown> | null);
                    const community = Array.isArray(item.community)
                      ? item.community[0]
                      : (item.community as Record<string, unknown> | null);
                    const network = Array.isArray(item.network)
                      ? item.network[0]
                      : (item.network as Record<string, unknown> | null);
                    return (
                      <article
                        key={String(item.id)}
                        className="flex flex-wrap items-center justify-between gap-4 p-4"
                      >
                        <div>
                          <p className="font-semibold">
                            {String(resident?.display_name ?? "待核验居民")}
                          </p>
                          <p className="mt-1 text-xs text-navy/50">
                            {String(community?.name ?? "未指定社区")} ·{" "}
                            {String(network?.name ?? "未指定家医网络")}
                          </p>
                          <p className="mt-1 text-xs text-navy/40">
                            登记时间：
                            {new Date(String(item.created_at)).toLocaleString(
                              "zh-CN",
                            )}
                            {resident?.phone
                              ? ` · ${String(resident.phone)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              void reviewBinding(String(item.id), "active")
                            }
                            className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-2 text-xs font-semibold text-white"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            核验通过
                          </button>
                          <button
                            onClick={() =>
                              void reviewBinding(String(item.id), "pending")
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-xs font-semibold"
                          >
                            <XCircle className="h-4 w-4" />
                            退回补充
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty text="没有待核验的居民签约登记。" />
              )
            ) : null}
        {moduleState.facts === "available" && tab === "facts" ? (
              facts.length ? (
                <div className="divide-y divide-line rounded-md border border-line bg-white">
                  {facts.map((item) => {
                    const resident = Array.isArray(item.resident)
                      ? item.resident[0]
                      : (item.resident as Record<string, unknown> | null);
                    return (
                      <article key={String(item.id)} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {String(item.fact_type)}
                            </p>
                            <p className="mt-1 text-xs text-navy/45">
                              {String(resident?.display_name ?? "未绑定群成员")}{" "}
                              · 置信度{" "}
                              {Math.round(Number(item.confidence) * 100)}%
                            </p>
                          </div>
                          <span className="rounded bg-risk-soft px-2 py-1 text-xs text-danger">
                            待人工确认
                          </span>
                        </div>
                        <pre className="mt-3 overflow-auto rounded-md bg-[#F4F6F5] p-3 text-xs leading-5">
                          {JSON.stringify(item.structured_value, null, 2)}
                        </pre>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() =>
                              void fact(String(item.id), "confirm")
                            }
                        disabled={!item.resident_id}
                            className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            确认入档
                          </button>
                      <button
                        onClick={() => void fact(String(item.id), "reject")}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-xs font-semibold"
                          >
                            <XCircle className="h-4 w-4" />
                            拒绝
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty text="没有待确认的群事实。" />
              )
            ) : null}
        {moduleState.content === "available" && tab === "content" ? (
              content.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {content.map((item) => {
                    const id = String(item.id);
                    const institution = relation(item.institution);
                    const previous = relation(item.previous_revision);
                    const days = expiryDays[id] ?? 90;
                    return (
                      <article
                        key={id}
                        className="rounded-md border border-line bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded bg-health-soft px-2 py-1 text-xs font-semibold text-sage">
                            {categoryLabel(String(item.category))}
                          </span>
                          {previous ? (
                            <span className="inline-flex items-center gap-1 rounded bg-risk-soft px-2 py-1 text-xs font-semibold text-danger">
                              <History className="h-3.5 w-3.5" />
                              已发布内容有更新
                            </span>
                          ) : (
                            <span className="rounded bg-[#F1F3F2] px-2 py-1 text-xs text-navy/55">
                              首次采集
                            </span>
                          )}
                        </div>
                        <h2 className="mt-3 text-base font-semibold leading-6">
                          {String(item.title)}
                        </h2>
                        <dl className="mt-3 grid gap-x-4 gap-y-2 border-y border-line py-3 text-xs sm:grid-cols-2">
                          <Meta
                            label="来源"
                            value={String(item.source_name ?? "未标注")}
                          />
                          <Meta
                            label="适用机构"
                            value={String(institution?.name ?? "当前社区通用")}
                          />
                          <Meta
                            label="原文发布"
                            value={formatDate(item.published_at)}
                          />
                          <Meta
                            label="采集时间"
                            value={formatDate(item.ingested_at, true)}
                          />
                        </dl>
                        {previous ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <SummaryPanel
                              label="上次审核版本"
                              text={String(previous.summary ?? "无摘要")}
                              muted
                            />
                            <SummaryPanel
                              label="本次待审版本"
                              text={String(item.summary ?? "无摘要")}
                            />
                          </div>
                        ) : (
                          <SummaryPanel
                            label="本次待审摘要"
                            text={String(item.summary ?? "无摘要")}
                          />
                        )}
                        <div className="mt-4 grid gap-3 rounded-md border border-line bg-[#F8FAF9] p-3">
                          <label className="grid gap-1 text-xs font-semibold text-navy/60">
                            居民端标题
                            <input
                              value={contentEdits[id]?.title ?? String(item.title ?? "")}
                              onChange={(event) => setContentEdits((current) => ({
                                ...current,
                                [id]: {
                                  title: event.target.value,
                                  summary: current[id]?.summary ?? String(item.summary ?? ""),
                                },
                              }))}
                              maxLength={200}
                              className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium text-navy outline-none focus:border-sage"
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-semibold text-navy/60">
                            居民端审核摘要
                            <textarea
                              value={contentEdits[id]?.summary ?? String(item.summary ?? "")}
                              onChange={(event) => setContentEdits((current) => ({
                                ...current,
                                [id]: {
                                  title: current[id]?.title ?? String(item.title ?? ""),
                                  summary: event.target.value,
                                },
                              }))}
                              maxLength={800}
                              rows={4}
                              className="resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-navy outline-none focus:border-sage"
                            />
                          </label>
                          <p className="text-[11px] leading-5 text-navy/40">只修改居民端展示文字；官方原文、来源和采集记录保持不变。</p>
                        </div>
                        <a
                          href={String(item.original_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sage"
                        >
                          打开官方原文核对
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                          <label className="text-xs font-semibold text-navy/60">
                            发布有效期
                            <select
                              value={days}
                              onChange={(event) =>
                                setExpiryDays((current) => ({
                                  ...current,
                                  [id]: Number(event.target.value),
                                }))
                              }
                              className="ml-2 h-9 rounded-md border border-line bg-white px-2 text-xs text-navy"
                            >
                              <option value={30}>30 天</option>
                              <option value={90}>90 天</option>
                              <option value={180}>180 天</option>
                            </select>
                            <span className="ml-2 font-normal text-navy/40">
                              至{" "}
                              {new Date(
                                Date.now() + days * 86_400_000,
                              ).toLocaleDateString("zh-CN")}
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => void review(id, "publish")}
                              className="rounded-md bg-success px-3 py-2 text-xs font-semibold text-white"
                            >
                              核对原文并发布
                            </button>
                            <button
                              onClick={() => void review(id, "reject")}
                              className="rounded-md border border-line px-3 py-2 text-xs font-semibold"
                            >
                              拒绝
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty text="没有待审核内容。" />
              )
            ) : null}
        {moduleState.schedules === "available" && tab === "schedules" ? (
              schedules.length ? (
                <div className="divide-y divide-line rounded-md border border-line bg-white">
                  {schedules.map((item) => {
                    const practitioner = Array.isArray(item.practitioner)
                      ? item.practitioner[0]
                      : (item.practitioner as Record<string, unknown> | null);
                    const institution = Array.isArray(item.institution)
                      ? item.institution[0]
                      : (item.institution as Record<string, unknown> | null);
                    return (
                      <article
                        key={String(item.id)}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div>
                          <p className="font-semibold">
                            {String(practitioner?.name ?? "未指定医生")} ·{" "}
                            {String(institution?.name ?? "机构")}
                          </p>
                          <p className="mt-1 text-xs text-navy/45">
                            {new Date(String(item.starts_at)).toLocaleString(
                              "zh-CN",
                            )}{" "}
                            · {String(item.status)}
                          </p>
                        </div>
                        {item.status === "draft" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                void verify(String(item.id), "verified")
                              }
                              className="rounded-md bg-success px-3 py-2 text-xs font-semibold text-white"
                            >
                              核验发布
                            </button>
                            <button
                              onClick={() =>
                                void verify(String(item.id), "cancelled")
                              }
                              className="rounded-md border border-line px-3 py-2 text-xs font-semibold"
                            >
                              取消
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty text="暂无排班。" />
              )
            ) : null}
        {moduleState.broadcasts === "available" && tab === "broadcasts" ? (
              broadcasts.length ? (
                <div className="divide-y divide-line rounded-md border border-line bg-white">
                  {broadcasts.map((item) => (
                    <article key={String(item.id)} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{String(item.title)}</p>
                          <p className="mt-1 text-sm text-navy/55">
                            {String(item.body)}
                          </p>
                        </div>
                        <span className="rounded bg-health-soft px-2 py-1 text-xs text-sage">
                          {String(item.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-navy/40">
                        计划发送：
                        {new Date(String(item.scheduled_at)).toLocaleString(
                          "zh-CN",
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty text="暂无计划发送的群通知。" />
              )
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-white p-10 text-center text-sm text-navy/50">
      {text}
    </div>
  );
}

function relation(value: unknown) {
  if (Array.isArray(value))
    return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function categoryLabel(value: string) {
  return (
    (
      {
        notice: "通知",
        activity: "健康活动",
        health_classroom: "家医小课堂",
        schedule_notice: "排班通知",
        policy: "政策服务",
      } as Record<string, string>
    )[value] ?? value
  );
}

function formatDate(value: unknown, includeTime = false) {
  if (!value) return "原文未标注";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "原文未标注";
  return includeTime
    ? date.toLocaleString("zh-CN")
    : date.toLocaleDateString("zh-CN");
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-navy/40">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy/75">{value}</dd>
    </div>
  );
}

function SummaryPanel({
  label,
  text,
  muted = false,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <section
      className={`mt-3 rounded-md border p-3 ${muted ? "border-line bg-[#F4F6F5]" : "border-sage/25 bg-health-soft/40"}`}
    >
      <p className="text-xs font-semibold text-navy/50">{label}</p>
      <p className="mt-1 text-sm leading-6 text-navy/65">{text}</p>
    </section>
  );
}
