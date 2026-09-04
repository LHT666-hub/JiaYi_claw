"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Hash,
  History,
  MapPin,
  PencilLine,
  RefreshCw,
  Send,
  UserRound,
  WandSparkles,
  XCircle,
} from "lucide-react";
import type {
  ServiceAction,
  ServiceStatus,
  ServiceType,
} from "@jiayi/contracts";
import { BackHeader } from "@/components/BackHeader";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";
import { PhoneShell } from "@/components/PhoneShell";
import type { ClawAppointmentDraft } from "@/components/GlobalClawAssistant";
import { useToast } from "@/components/ToastProvider";
import { serviceStatusLabels } from "@/lib/serviceRequests/stateMachine";

type AppointmentDetails = {
  scheduled_at?: string | null;
  institution_name?: string | null;
  department_name?: string | null;
  clinician_name?: string | null;
  booking_reference?: string | null;
};

type RequestEvent = {
  id?: string;
  action?: ServiceAction;
  new_status: ServiceStatus;
  note?: string | null;
  created_at: string;
};

type RequestItem = {
  id: string;
  title: string;
  summary: string;
  service_type: ServiceType;
  status: ServiceStatus;
  priority: string;
  created_at: string;
  appointment_details?: AppointmentDetails[] | AppointmentDetails | null;
  service_request_events?: RequestEvent[];
};

const serviceOptions: Array<{ value: ServiceType; label: string }> = [
  { value: "clinic_registration", label: "门诊挂号" },
  { value: "family_doctor_booking", label: "家庭医生" },
  { value: "referral_assistance", label: "转诊协助" },
  { value: "refill_request", label: "续方配药" },
  { value: "followup_reminder", label: "随访提醒" },
];

const serviceTitles: Partial<Record<ServiceType, string>> = {
  clinic_registration: "门诊挂号协助",
  family_doctor_booking: "家庭医生预约",
  referral_assistance: "分级转诊协助",
  refill_request: "续方配药申请",
  followup_reminder: "随访提醒申请",
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function resolveClawDate(value?: string) {
  if (!value) return "";
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  if (value === "明天") date.setDate(date.getDate() + 1);
  else if (value === "后天") date.setDate(date.getDate() + 2);
  else {
    const weekday = value.match(/下周([一二三四五六日天])/);
    if (!weekday) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
    const target = "一二三四五六日天".indexOf(weekday[1]) % 7 + 1;
    const current = date.getDay() || 7;
    date.setDate(date.getDate() + (7 - current) + target);
  }
  return date.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const actionKeys = useRef(new Map<string, string>());
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>(
    "clinic_registration",
  );
  const [target, setTarget] = useState("");
  const [department, setDepartment] = useState("");
  const [doctor, setDoctor] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("上午");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [acceptWaitlist, setAcceptWaitlist] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [fromClaw, setFromClaw] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v1/service-requests", {
      cache: "no-store",
    });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    const payload = await response.json();
    if (response.ok) setItems(payload.data.requests ?? []);
    else showToast(payload.error?.message ?? "服务进度读取失败。", "warning");
    setLoading(false);
  }, [router, showToast]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get("type");
    if (serviceOptions.some((item) => item.value === requestedType)) {
      setServiceType(requestedType as ServiceType);
    }
    setTarget(params.get("target")?.slice(0, 160) ?? "");
    setDepartment(params.get("department")?.slice(0, 80) ?? "");
    setDoctor(params.get("doctor")?.slice(0, 80) ?? "");
    setNote(params.get("note")?.slice(0, 600) ?? "");
    setFromClaw(params.get("from") === "claw");
  }, []);

  const canSubmit = useMemo(
    () =>
      target.trim().length >= 2 &&
      preferredDate &&
      phone.replace(/\D/g, "").length >= 11 &&
      confirmed,
    [confirmed, phone, preferredDate, target],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit)
      return showToast("请补齐预约目标、日期、手机号并确认提交。", "warning");
    setSubmitting(true);
    const summary = `${target}${department ? `，希望就诊科室：${department}` : ""}${doctor ? `，优先医生：${doctor}` : ""}${note ? `。补充：${note}` : ""}`;
    const response = await fetch("/api/v1/service-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        serviceType,
        title: serviceTitles[serviceType] ?? "家医服务申请",
        summary,
        priority: "low",
        requestedRole:
          serviceType === "refill_request"
            ? "pharmacist"
            : serviceType === "family_doctor_booking" ||
                serviceType === "followup_reminder"
              ? "nurse"
              : "community",
        confirmed: true,
        appointment: {
          target,
          department: department || null,
          preferredDoctor: doctor || null,
          preferredDates: [preferredDate],
          preferredTime,
          contactPhone: phone,
          acceptWaitlist,
          note: note || null,
        },
      }),
    });
    const payload = await response.json();
    setSubmitting(false);
    if (!response.ok)
      return showToast(
        payload.error?.message ?? "预约申请提交失败。",
        "warning",
      );
    showToast(
      payload.data.deduplicated
        ? "这条申请已经提交过了。"
        : "预约申请已提交给家医团队。",
      "success",
    );
    setTarget("");
    setDepartment("");
    setDoctor("");
    setPreferredDate("");
    setNote("");
    setConfirmed(false);
    setIdempotencyKey(crypto.randomUUID());
    await loadRequests();
  }

  async function runAction(
    id: string,
    action: "confirm_booking" | "request_reschedule" | "cancel",
  ) {
    if (action === "request_reschedule" && rescheduleNote.trim().length < 2) {
      return showToast("请告诉家医团队希望如何调整时间。", "warning");
    }
    setActionId(id);
    const operation = `${id}:${action}:${rescheduleNote.trim()}`;
    const actionKey = actionKeys.current.get(operation) ?? crypto.randomUUID();
    actionKeys.current.set(operation, actionKey);
    const response = await fetch(
      `/api/v1/service-requests/${id}/actions/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": actionKey },
        body: JSON.stringify({
          note:
            action === "cancel"
              ? "居民申请取消。"
              : action === "request_reschedule"
                ? `居民申请改期：${rescheduleNote.trim()}`
                : "居民已确认团队提出的预约时间。",
        }),
      },
    );
    const payload = await response.json();
    setActionId(null);
    if (!response.ok)
      return showToast(payload.error?.message ?? "操作失败。", "warning");
    actionKeys.current.delete(operation);
    showToast(
      action === "cancel"
        ? "申请已取消。"
        : action === "request_reschedule"
          ? "改期需求已发送。"
          : "已确认预约。",
      "success",
    );
    setRescheduleId(null);
    setRescheduleNote("");
    await loadRequests();
  }

  function applyClawDraft(draft: ClawAppointmentDraft) {
    if (draft.serviceType && serviceOptions.some((item) => item.value === draft.serviceType)) setServiceType(draft.serviceType);
    if (draft.target) setTarget(draft.target.slice(0, 160));
    if (draft.department) setDepartment(draft.department.slice(0, 80));
    if (draft.doctor) setDoctor(draft.doctor.slice(0, 80));
    if (draft.note) setNote(draft.note.slice(0, 600));
    const resolvedDate = resolveClawDate(draft.preferredDate);
    if (resolvedDate) setPreferredDate(resolvedDate);
    if (draft.preferredTime) setPreferredTime(draft.preferredTime);
    if (draft.contactPhone) setPhone(draft.contactPhone);
    setFromClaw(true);
    setConfirmed(false);
    showToast("Claw 已填入可确定的信息，请核对仍为空的项目后提交。", "success");
  }

  return (
    <PhoneShell showBottomNav onClawAppointmentDraft={applyClawDraft}>
      <main className="space-y-5 px-4 pb-8">
        <div className="relative">
          <BackHeader
            title="一键帮预约"
            subtitle="提交后由家医团队人工确认，不展示虚假号源。"
          />
          <button
            type="button"
            onClick={() => void loadRequests()}
            aria-label="刷新预约进度"
            className="ios-control absolute right-1 top-7 flex h-11 w-11 items-center justify-center rounded-full text-navy"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <CareSubjectSwitcher compact />

        {fromClaw ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-sage/15 bg-health-soft px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sage">
              <WandSparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-navy">Claw 已生成办理草稿</p>
              <p className="mt-1 text-xs leading-5 text-navy/55">
                请核对服务对象、诉求、日期和联系电话。勾选确认并提交前，不会写入服务申请。
              </p>
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className="ios-material rounded-[30px] p-5">
          <h1 className="flex items-center gap-2 text-base font-semibold text-navy">
            <CalendarCheck2 className="h-5 w-5 text-sage" />
            预约申请
          </h1>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {serviceOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setServiceType(item.value)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${serviceType === item.value ? "border-navy bg-navy text-white shadow-[0_10px_22px_rgba(16,42,67,0.16)]" : "border-line bg-cream text-navy"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="这次主要想解决什么问题？"
              className="h-12 w-full rounded-[18px] border border-line bg-cream px-4 outline-none focus:border-sage"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="希望科室（可选）"
                className="h-12 min-w-0 rounded-[18px] border border-line bg-cream px-3 outline-none focus:border-sage"
              />
              <input
                value={doctor}
                onChange={(event) => setDoctor(event.target.value)}
                placeholder="优先医生（可选）"
                className="h-12 min-w-0 rounded-[18px] border border-line bg-cream px-3 outline-none focus:border-sage"
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
              <input
                type="date"
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
                className="h-12 min-w-0 rounded-[18px] border border-line bg-cream px-3 outline-none focus:border-sage"
              />
              <select
                value={preferredTime}
                onChange={(event) => setPreferredTime(event.target.value)}
                className="h-12 min-w-0 rounded-[18px] border border-line bg-cream px-3 outline-none"
              >
                <option>上午</option>
                <option>下午</option>
                <option>均可</option>
              </select>
            </div>
            <input
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="接收确认电话的手机号"
              className="h-12 w-full rounded-[18px] border border-line bg-cream px-4 outline-none focus:border-sage"
            />
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="补充说明（可选）"
              rows={3}
              className="w-full resize-none rounded-[18px] border border-line bg-cream px-4 py-3 outline-none focus:border-sage"
            />
            <label className="flex items-center gap-3 text-sm text-navy/70">
              <input
                type="checkbox"
                checked={acceptWaitlist}
                onChange={(event) => setAcceptWaitlist(event.target.checked)}
              />
              没有合适号源时接受候补
            </label>
            <label className="flex items-start gap-3 rounded-[20px] bg-health-soft p-3 text-xs leading-5 text-navy/70">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1"
              />
              <span>
                我确认以上信息准确，同意将本次诉求发送给家医团队人工处理。
              </span>
            </label>
            <button
              disabled={!canSubmit || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? "提交中..." : "确认提交预约"}
            </button>
          </div>
        </form>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy">我的预约进度</h2>
            <span className="text-xs text-navy/45">{items.length} 条</span>
          </div>
          {loading ? (
            <div className="ios-material rounded-[26px] p-6 text-center text-sm text-navy/50">
              正在读取...
            </div>
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((item) => {
                const details = one(item.appointment_details);
                const events = [...(item.service_request_events ?? [])].sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime(),
                );
                return (
                  <article
                    key={item.id}
                    className="ios-material rounded-[28px] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/service-requests/${item.id}`} className="font-semibold text-navy underline-offset-4 hover:underline">
                          {item.title}
                        </Link>
                        <p className="mt-1 text-xs text-navy/45">
                          {new Date(item.created_at).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-health-soft px-3 py-1 text-xs font-semibold text-sage">
                        {serviceStatusLabels[item.status]}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-navy/70">
                      {item.summary}
                    </p>

                    {details?.scheduled_at ? (
                      <div className="mt-4 space-y-2 rounded-[22px] bg-health-soft p-4 text-sm text-navy/70">
                        <p className="flex items-center gap-2 font-semibold text-navy">
                          <CalendarDays className="h-4 w-4 text-sage" />
                          {new Date(details.scheduled_at).toLocaleString(
                            "zh-CN",
                          )}
                        </p>
                        {details.institution_name ? (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-sage" />
                            {details.institution_name}
                            {details.department_name
                              ? ` · ${details.department_name}`
                              : ""}
                          </p>
                        ) : null}
                        {details.clinician_name ? (
                          <p className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-sage" />
                            {details.clinician_name}
                          </p>
                        ) : null}
                        {details.booking_reference ? (
                          <p className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-sage" />
                            预约编号：{details.booking_reference}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {item.status === "awaiting_user_confirmation" ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={actionId === item.id}
                          onClick={() =>
                            void runAction(item.id, "confirm_booking")
                          }
                          className="flex items-center justify-center gap-2 rounded-full bg-success px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          确认时间
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRescheduleId(
                              rescheduleId === item.id ? null : item.id,
                            )
                          }
                          className="flex items-center justify-center gap-2 rounded-full border border-sage/25 bg-white px-3 py-2.5 text-sm font-semibold text-sage"
                        >
                          <PencilLine className="h-4 w-4" />
                          申请改期
                        </button>
                      </div>
                    ) : null}

                    {rescheduleId === item.id ? (
                      <div className="mt-3 rounded-[22px] border border-sage/20 bg-white p-3">
                        <label className="text-xs font-semibold text-navy">
                          希望如何调整
                        </label>
                        <textarea
                          autoFocus
                          value={rescheduleNote}
                          onChange={(event) =>
                            setRescheduleNote(event.target.value)
                          }
                          rows={3}
                          placeholder="例如：下周二下午或周四上午均可"
                          className="mt-2 w-full resize-none rounded-[16px] border border-line bg-cream p-3 text-sm outline-none focus:border-sage"
                        />
                        <button
                          type="button"
                          disabled={actionId === item.id}
                          onClick={() =>
                            void runAction(item.id, "request_reschedule")
                          }
                          className="mt-2 w-full rounded-full bg-navy px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          提交改期需求
                        </button>
                      </div>
                    ) : null}

                    {events.length ? (
                      <details className="mt-4 border-t border-line/60 pt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-navy/55">
                          <History className="h-4 w-4" />
                          查看处理记录（{events.length}）
                        </summary>
                        <ol className="mt-3 space-y-3 border-l border-sage/25 pl-4">
                          {events.map((event, index) => (
                            <li
                              key={event.id ?? `${event.created_at}-${index}`}
                              className="relative text-xs leading-5 text-navy/55 before:absolute before:-left-[19px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-sage"
                            >
                              <p className="font-semibold text-navy/75">
                                {serviceStatusLabels[event.new_status]}
                              </p>
                              {event.note ? <p>{event.note}</p> : null}
                              <p className="text-navy/35">
                                {new Date(event.created_at).toLocaleString(
                                  "zh-CN",
                                )}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}

                    {!["failed", "completed", "cancelled"].includes(
                      item.status,
                    ) ? (
                      <button
                        type="button"
                        disabled={actionId === item.id}
                        onClick={() => void runAction(item.id, "cancel")}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-danger/20 bg-risk-soft px-3 py-2 text-xs font-semibold text-danger disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        取消申请
                      </button>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2 text-xs text-navy/40">
                      <Clock3 className="h-3.5 w-3.5" />
                      所有处理步骤均记录操作者和时间
                    </div>
                    <Link href={`/service-requests/${item.id}`} className="mt-3 flex w-full items-center justify-center rounded-full bg-health-soft px-3 py-2.5 text-xs font-semibold text-sage">打开完整办理详情</Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ios-material rounded-[26px] p-6 text-center">
              <CalendarCheck2 className="mx-auto h-8 w-8 text-sage/60" />
              <p className="mt-3 text-sm text-navy/55">还没有预约申请。</p>
            </div>
          )}
        </section>
      </main>
    </PhoneShell>
  );
}
