import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad, usePullDownRefresh } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { apiRequest, withCareSubject } from "../../lib/api";

type RequestEvent = {
  id: string;
  action: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};

type AppointmentDetails = {
  scheduled_at?: string | null;
  institution_name?: string | null;
  department_name?: string | null;
  clinician_name?: string | null;
  booking_reference?: string | null;
  preferred_dates?: string[] | null;
  preferred_time?: string | null;
};

type ServiceRequest = {
  id: string;
  title: string;
  summary: string;
  status: string;
  service_type: string;
  created_at: string;
  updated_at: string;
  appointment_details?: AppointmentDetails[] | AppointmentDetails | null;
  service_request_events?: RequestEvent[] | null;
};

const labels: Record<string, string> = {
  draft: "待确认",
  submitted: "已提交",
  needs_info: "待补充",
  accepted: "已受理",
  checking_availability: "确认资源中",
  awaiting_user_confirmation: "等待您确认",
  booked: "预约成功",
  waitlisted: "候补中",
  failed: "暂未约成",
  completed: "已完成",
  cancelled: "已取消",
};

const statusGuidance: Record<string, string> = {
  submitted: "申请已经进入家医团队队列，请留意后续通知。",
  needs_info: "团队需要您补充资料，提交后会重新进入处理队列。",
  accepted: "团队已受理，正在核验办理条件。",
  checking_availability: "工作人员正在联系机构或核验可用时段。",
  awaiting_user_confirmation: "已为您提出一个方案，请尽快确认或申请改期。",
  booked: "预约已确认，请按时间和地点就诊。",
  waitlisted: "暂时没有合适资源，团队会继续跟进候补。",
  failed: "本次暂未办理成功，可重新发起或联系家医团队。",
  completed: "本次服务已完成，相关记录会保留在服务历史中。",
  cancelled: "申请已取消，团队不会继续办理。",
};

const actionLabels: Record<string, string> = {
  submit: "资料已提交",
  request_info: "团队请求补充资料",
  accept: "团队已受理",
  check_availability: "开始核验资源",
  propose_slot: "团队提出预约方案",
  confirm_booking: "居民确认预约",
  request_reschedule: "居民申请改期",
  waitlist: "进入候补",
  fail: "本次暂未约成",
  complete: "服务已完成",
  cancel: "申请已取消",
};

const finishedStatuses = ["failed", "completed", "cancelled"];

function firstDetails(value: ServiceRequest["appointment_details"]) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ProgressPage() {
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"active" | "history">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useLoad((params) => setSubmitted(params.submitted === "1"));

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "history" ? finishedStatuses.includes(item.status) : !finishedStatuses.includes(item.status)),
    [items, filter],
  );

  const activeCount = items.filter((item) => !finishedStatuses.includes(item.status)).length;
  const historyCount = items.length - activeCount;

  async function load() {
    setError("");
    try {
      const data = await apiRequest<{ requests: ServiceRequest[] }>(withCareSubject("/api/v1/service-requests"));
      setItems(data.requests);
      if (!expandedId && data.requests[0]) setExpandedId(data.requests[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "服务进度加载失败");
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load();
  });

  async function action(id: string, name: string, note: string) {
    setActingId(id);
    try {
      await apiRequest(`/api/v1/service-requests/${id}/actions/${name}`, { method: "POST", data: { note } });
      Taro.showToast({ title: name === "cancel" ? "申请已取消" : "已提交", icon: "success" });
      setEditingId(null);
      setDraftNote("");
      await load();
    } catch (actionError) {
      Taro.showToast({ title: actionError instanceof Error ? actionError.message : "操作失败", icon: "none" });
    } finally {
      setActingId(null);
    }
  }

  async function cancel(id: string) {
    const result = await Taro.showModal({ title: "取消这项申请？", content: "取消后家医团队将停止继续办理。", confirmText: "确认取消", confirmColor: "#a44a3f" });
    if (result.confirm) await action(id, "cancel", "居民确认取消本次服务申请。");
  }

  async function confirmBooking(id: string) {
    const result = await Taro.showModal({ title: "确认预约方案", content: "确认后团队将按当前时间和机构完成预约记录。", confirmText: "确认预约" });
    if (result.confirm) await action(id, "confirm_booking", "居民已核对并确认预约方案。");
  }

  async function submitDraft(id: string, mode: "supplement" | "reschedule") {
    if (draftNote.trim().length < 2) {
      Taro.showToast({ title: mode === "supplement" ? "请填写需要补充的资料" : "请填写希望调整的时间", icon: "none" });
      return;
    }
    await action(id, mode === "supplement" ? "submit" : "request_reschedule", `${mode === "supplement" ? "居民补充资料" : "居民申请改期"}：${draftNote.trim()}`);
  }

  return (
    <View className="page progress-page">
      <View className="progress-head">
        <Text className="eyebrow">服务中心</Text>
        <Text className="progress-title">办理进度</Text>
        <Text className="progress-subtitle">每次状态变化都由系统留痕，重要方案需要您再次确认。</Text>
      </View>

      {submitted ? <View className="progress-success"><View className="progress-success-mark">✓</View><View className="grow"><Text className="progress-success-title">申请已进入家医团队队列</Text><Text className="progress-success-copy">后续补资料、时段方案和办理结果会在这里更新。</Text></View><Text className="progress-success-close" onClick={() => setSubmitted(false)}>×</Text></View> : null}

      <View className="progress-segments">
        <View className={`progress-segment pressable ${filter === "active" ? "selected" : ""}`} onClick={() => setFilter("active")}>处理中 <Text>{activeCount}</Text></View>
        <View className={`progress-segment pressable ${filter === "history" ? "selected" : ""}`} onClick={() => setFilter("history")}>已结束 <Text>{historyCount}</Text></View>
      </View>

      {loading ? <View className="progress-state"><View className="loading-mark" /><Text>正在同步服务进度</Text></View> : null}
      {!loading && error ? <View className="progress-state"><Text className="onboarding-error-title">进度暂时无法加载</Text><Text className="onboarding-error-copy">{error}</Text><Button className="primary pressable" onClick={() => void load()}>重新加载</Button></View> : null}

      {!loading && !error && visibleItems.length ? visibleItems.map((item) => {
        const details = firstDetails(item.appointment_details);
        const events = [...(item.service_request_events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const expanded = expandedId === item.id;
        const editing = editingId === item.id;
        return (
          <View className={`progress-card ${item.status === "awaiting_user_confirmation" || item.status === "needs_info" ? "needs-action" : ""}`} key={item.id}>
            <View className="progress-card-head pressable" onClick={() => setExpandedId(expanded ? null : item.id)}>
              <View className={`progress-status-mark status-${item.status}`}>{finishedStatuses.includes(item.status) ? "✓" : "•"}</View>
              <View className="grow"><Text className="progress-card-title">{item.title}</Text><Text className="progress-card-time">更新于 {formatTime(item.updated_at)}</Text></View>
              <View className="progress-card-status"><Text>{labels[item.status] ?? item.status}</Text><Text className="progress-card-chevron">{expanded ? "⌃" : "⌄"}</Text></View>
            </View>

            <View className="progress-guidance">{statusGuidance[item.status] ?? "家医团队正在处理这项服务。"}</View>

            {details?.scheduled_at ? (
              <View className="appointment-result">
                <Text className="appointment-result-label">当前预约方案</Text>
                <Text className="appointment-result-time">{new Date(details.scheduled_at).toLocaleString("zh-CN")}</Text>
                <Text className="appointment-result-place">{[details.institution_name, details.department_name, details.clinician_name].filter(Boolean).join(" · ") || "机构信息待补充"}</Text>
                {details.booking_reference ? <Text className="appointment-result-code">预约编号 {details.booking_reference}</Text> : null}
              </View>
            ) : details?.preferred_dates?.length ? (
              <View className="preferred-summary"><Text>期望时间</Text><Text>{details.preferred_dates.join("、")} · {details.preferred_time ?? "时段不限"}</Text></View>
            ) : null}

            {item.status === "needs_info" ? <Button className="progress-primary pressable" onClick={() => { setEditingId(editing ? null : item.id); setDraftNote(""); }}>补充资料</Button> : null}
            {item.status === "awaiting_user_confirmation" ? <View className="progress-action-row"><Button className="progress-primary pressable" loading={actingId === item.id} onClick={() => void confirmBooking(item.id)}>确认预约</Button><Button className="progress-secondary pressable" onClick={() => { setEditingId(editing ? null : item.id); setDraftNote(""); }}>申请改期</Button></View> : null}

            {editing ? (
              <View className="progress-editor">
                <Text className="progress-editor-title">{item.status === "needs_info" ? "补充团队需要了解的资料" : "填写希望调整到的日期或时段"}</Text>
                <Textarea className="textarea progress-editor-input" value={draftNote} maxlength={600} onInput={(event) => setDraftNote(event.detail.value)} placeholder={item.status === "needs_info" ? "例如：补充最近一次检查结果、既往就诊机构" : "例如：下周二下午或周四上午"} />
                <Button className="progress-primary pressable" loading={actingId === item.id} onClick={() => void submitDraft(item.id, item.status === "needs_info" ? "supplement" : "reschedule")}>提交给团队</Button>
              </View>
            ) : null}

            {expanded ? (
              <View className="progress-detail">
                <Text className="progress-detail-label">申请内容</Text>
                <Text className="progress-summary">{item.summary}</Text>
                <Text className="progress-detail-label timeline-label">办理记录</Text>
                <View className="progress-timeline">
                  {events.length ? events.map((event, index) => (
                    <View className="timeline-row" key={event.id}>
                      <View className="timeline-axis"><View className={`timeline-dot ${index === events.length - 1 ? "latest" : ""}`} />{index < events.length - 1 ? <View className="timeline-line" /> : null}</View>
                      <View className="grow"><View className="timeline-title-row"><Text className="timeline-title">{actionLabels[event.action] ?? labels[event.new_status] ?? "状态更新"}</Text><Text className="timeline-time">{formatTime(event.created_at)}</Text></View>{event.note ? <Text className="timeline-note">{event.note}</Text> : null}</View>
                    </View>
                  )) : <Text className="timeline-empty">暂无办理记录</Text>}
                </View>
                {!finishedStatuses.includes(item.status) ? <Button className="progress-cancel" loading={actingId === item.id} onClick={() => void cancel(item.id)}>取消这项申请</Button> : null}
              </View>
            ) : null}
          </View>
        );
      }) : null}

      {!loading && !error && !visibleItems.length ? (
        <View className="progress-empty"><View className="progress-empty-mark">{filter === "active" ? "进度" : "记录"}</View><Text className="progress-empty-title">{filter === "active" ? "当前没有处理中服务" : "还没有已结束服务"}</Text><Text className="progress-empty-copy">{filter === "active" ? "需要预约、转诊或随访时，可以从服务页发起。" : "完成或取消的服务会保留在这里。"}</Text>{filter === "active" ? <Button className="primary pressable" onClick={() => Taro.switchTab({ url: "/pages/services/index" })}>去服务页</Button> : null}</View>
      ) : null}
    </View>
  );
}
