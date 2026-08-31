import { Button, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useState } from "react";
import {
  Bell,
  Camera,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Droplets,
  Footprints,
  HeartHandshake,
  HeartPulse,
  LockKeyhole,
  Mic,
  Scale,
  ShieldCheck,
  Stethoscope,
} from "lucide-react-taro";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
import { useReloadOnNetworkRestore } from "../../components/NetworkStatus";
import CustomTabBar from "../../custom-tab-bar";
import {
  apiRequest,
  isLoggedIn,
  saveCareSubjectId,
  withCareSubject,
} from "../../lib/api";

type CareSubject = {
  residentId: string;
  displayName: string;
  relationship: string;
  isSelf: boolean;
};

type Schedule = {
  id: string;
  starts_at: string;
  location?: string | null;
  practitioner?: { name?: string; title?: string | null } | null;
  department?: { name?: string } | null;
  institution?: { name?: string } | null;
};

type HomeData = {
  profile: { displayName: string };
  careSubject: CareSubject;
  careSubjects: CareSubject[];
  access: {
    level: "registered" | "verified" | "unbound" | "revoked";
    bindingStatus: "pending" | "active" | "revoked" | "unbound";
    canSubmitService: boolean;
    canStoreHealthData: boolean;
    message: string;
  };
  network: null | { name: string; community?: { name?: string } };
  serviceRequests: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
  }>;
  schedules: Schedule[];
  notifications: Array<{ id: string; is_read: boolean }>;
  healthSummary?: Array<{
    id: string;
    type: "blood_pressure" | "blood_glucose" | "weight" | "steps";
    value: number;
    secondaryValue: number | null;
    unit: string;
    measuredAt: string;
    delta: number | null;
    secondaryDelta: number | null;
  }>;
  assistant?: {
    lastActivity: null | {
      id: string;
      title: string;
      detail: string;
      badge: string;
      occurredAt: string;
      primaryAction: { label: string; href: string } | null;
    };
    lastActivityAt: string | null;
    retentionDays: number;
    rawTranscriptStored: false;
  };
};

type HealthSummaryItem = NonNullable<HomeData["healthSummary"]>[number];

const statusLabels: Record<string, string> = {
  submitted: "已提交",
  needs_info: "待补资料",
  accepted: "团队已受理",
  checking_availability: "核对资源中",
  awaiting_user_confirmation: "待您确认",
  booked: "已预约",
  waitlisted: "候补中",
};

const healthLabels = {
  blood_pressure: "血压",
  blood_glucose: "血糖",
  weight: "体重",
  steps: "步数",
} as const;

function HealthIcon({ type }: { type: HealthSummaryItem["type"] }) {
  const props = { size: 22, strokeWidth: 2.1 } as const;
  if (type === "blood_pressure") return <HeartPulse {...props} color="#A64F45" />;
  if (type === "blood_glucose") return <Droplets {...props} color="#8B5E83" />;
  if (type === "weight") return <Scale {...props} color="#35617F" />;
  return <Footprints {...props} color="#2F6C56" />;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<HomeData>(withCareSubject("/api/v1/home"));
      saveCareSubjectId(result.careSubject.residentId);
      setData(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "首页暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    if (!isLoggedIn()) {
      void Taro.reLaunch({ url: "/pages/login/index" });
      return;
    }
    void load();
  });

  usePullDownRefresh(() => {
    if (!isLoggedIn()) {
      Taro.stopPullDownRefresh();
      return;
    }
    void load().finally(() => Taro.stopPullDownRefresh());
  });
  useReloadOnNetworkRestore(() => void load());

  async function switchSubject(index: number) {
    const subject = data?.careSubjects[index];
    if (!subject) return;
    await apiRequest("/api/v1/care-subject", {
      method: "PUT",
      data: { residentId: subject.residentId },
    });
    saveCareSubjectId(subject.residentId);
    await load();
  }

  const activeRequest = data?.serviceRequests.find(
    (item) => !["completed", "cancelled", "failed"].includes(item.status),
  );
  const requestNeedsAttention = activeRequest
    ? ["needs_info", "awaiting_user_confirmation"].includes(activeRequest.status)
    : false;
  const nextSchedule = data?.schedules[0];
  const unreadCount = data?.notifications.filter((item) => !item.is_read).length ?? 0;

  function scheduleTime(value?: string) {
    if (!value) return "暂无已核验排班";
    const date = new Date(value);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function openProtectedFeature(url: string, permission: "service" | "health" = "service") {
    const allowed = permission === "health"
      ? data?.access.canStoreHealthData
      : data?.access.canSubmitService;
    if (!allowed) {
      Taro.showModal({
        title: "签约关系待核验",
        content: data?.access.message ?? "工作人员核验后即可使用。",
        showCancel: false,
        confirmText: "我知道了",
      });
      return;
    }
    void Taro.navigateTo({ url });
  }

  function continueAssistantActivity() {
    const href = data?.assistant?.lastActivity?.primaryAction?.href;
    if (!href) {
      void Taro.navigateTo({ url: "/pages/ask/index" });
      return;
    }
    if (href === "tel:120") {
      void Taro.makePhoneCall({ phoneNumber: "120" });
      return;
    }
    if (href.startsWith("/services")) {
      void Taro.switchTab({ url: "/pages/services/index" });
      return;
    }
    if (href.startsWith("/public-info")) {
      void Taro.navigateTo({ url: "/pages/public-info/index" });
      return;
    }
    if (href.startsWith("/appointments")) {
      if (href.includes("type=report_explanation")) {
        void Taro.navigateTo({ url: "/pages/ask/index?photo=1" });
        return;
      }
      const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
      openProtectedFeature(`/pages/appointments/index${query}`);
      return;
    }
    if (href.startsWith("/ask")) {
      const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
      void Taro.navigateTo({ url: `/pages/ask/index${query}` });
      return;
    }
    void Taro.navigateTo({ url: "/pages/ask/index" });
  }

  function activityTime(value?: string | null) {
    if (!value) return "";
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "今天";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function healthValue(item: HealthSummaryItem) {
    if (item.type === "blood_pressure" && item.secondaryValue !== null)
      return `${item.value}/${item.secondaryValue}`;
    return Number.isInteger(item.value) ? String(item.value) : item.value.toFixed(1);
  }

  function healthTime(value: string) {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "今天记录";
    return `${date.getMonth() + 1}月${date.getDate()}日记录`;
  }

  function healthDelta(item: HealthSummaryItem) {
    if (item.delta === null) return "首次记录";
    if (item.type === "blood_pressure" && item.secondaryDelta !== null) {
      if (Math.abs(item.delta) < 0.001 && Math.abs(item.secondaryDelta) < 0.001)
        return "与上次相同";
      const primary = Number.isInteger(item.delta) ? item.delta : Number(item.delta.toFixed(1));
      const secondary = Number.isInteger(item.secondaryDelta)
        ? item.secondaryDelta
        : Number(item.secondaryDelta.toFixed(1));
      return `较上次 ${primary > 0 ? "+" : ""}${primary}/${secondary > 0 ? "+" : ""}${secondary} ${item.unit}`;
    }
    if (Math.abs(item.delta) < 0.001) return "与上次相同";
    const value = Number.isInteger(item.delta) ? item.delta : Number(item.delta.toFixed(1));
    return `较上次 ${value > 0 ? "+" : ""}${value}${item.type === "steps" ? " 步" : ` ${item.unit}`}`;
  }

  return (
    <View className="page home-page">
      <View className="home-topbar">
        <View className="home-avatar">
          {(data?.profile.displayName ?? "家").slice(0, 1)}
        </View>
        <View className="grow">
          <Text className="home-greeting">
            {data ? `${data.profile.displayName}，您好` : "家医 Claw"}
          </Text>
          <Text className="home-context">
            {data?.network?.community?.name ?? "正在连接您的家医团队"}
          </Text>
        </View>
        <View
          className="home-message-button pressable"
          onClick={() => Taro.switchTab({ url: "/pages/messages/index" })}
          role="button"
          aria-label={unreadCount ? `消息，${unreadCount} 条未读` : "消息"}
        >
          <Bell size={21} color="#102A43" strokeWidth={2} />
          {unreadCount ? <View className="home-unread">{unreadCount}</View> : null}
        </View>
      </View>

      {loading && !data ? <PageSkeleton rows={2} /> : null}
      {!loading && error && !data ? (
        <PageFeedback title="首页暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && data ? <InlineRetry message={error} onRetry={() => void load()} /> : null}

      {data?.careSubject && data.careSubjects.length > 1 ? (
        <Picker
          mode="selector"
          range={data.careSubjects.map(
            (item) => `${item.displayName} · ${item.isSelf ? "本人" : item.relationship}`,
          )}
          onChange={(event) => void switchSubject(Number(event.detail.value))}
        >
          <View className="home-subject pressable">
            <View className="subject-avatar">
              {data.careSubject.displayName.slice(0, 1)}
            </View>
            <View className="grow">
              <Text className="subject-label">当前服务对象</Text>
              <Text className="subject-name">
                {data.careSubject.displayName} · {data.careSubject.isSelf ? "本人" : "家属代办"}
              </Text>
            </View>
            <Text className="subject-switch">切换 ›</Text>
          </View>
        </Picker>
      ) : null}

      {data && data.access.level !== "verified" ? (
        <View className={`home-access-strip access-${data.access.bindingStatus}`}>
          <View className="home-access-mark"><ShieldCheck size={20} color="#795427" strokeWidth={2.2} /></View>
          <View className="grow">
            <Text className="home-access-title">
              {data.access.bindingStatus === "pending" ? "社区登记待核验" : "家医服务尚未开通"}
            </Text>
            <Text className="home-access-copy">{data.access.message}</Text>
          </View>
        </View>
      ) : null}

      {data ? <>
      {activeRequest ? (
        <View
          className={`home-now-card pressable ${requestNeedsAttention ? "attention" : ""}`}
          onClick={() => Taro.navigateTo({ url: "/pages/progress/index" })}
        >
          <View className="home-now-state"><ClipboardCheck size={24} color={requestNeedsAttention ? "#8C5D20" : "#2F6C56"} strokeWidth={2.1} /></View>
          <View className="grow">
            <Text className="home-now-kicker">{requestNeedsAttention ? "需要您处理" : "家医团队正在办理"}</Text>
            <Text className="home-now-title">{activeRequest.title}</Text>
            <Text className="home-now-copy">{statusLabels[activeRequest.status] ?? "团队处理中"} · 查看完整进度</Text>
          </View>
          <ChevronRight className="home-now-arrow" size={21} color="rgba(16,42,67,.3)" />
        </View>
      ) : null}

      <View className="home-claw-hero">
        <View className="home-claw-heading">
          <View className="home-claw-mark"><HeartHandshake size={25} color="#D6E8E2" strokeWidth={1.9} /></View>
          <View className="grow">
            <Text className="home-claw-eyebrow">家医 Claw</Text>
            <Text className="home-claw-title">有事，直接告诉我</Text>
          </View>
          <View className="home-claw-private"><LockKeyhole size={13} color="rgba(255,255,255,.66)" /><Text>原文不入档</Text></View>
        </View>
        <Text className="home-claw-copy">
          查公开信息、整理就医资料；需要办理时由您确认，再交给家医团队。
        </Text>
        {data.assistant?.lastActivity ? (
          <View className="home-claw-continuity pressable" onClick={continueAssistantActivity}>
            <View className="home-claw-continuity-line" />
            <View className="grow">
              <View className="home-claw-continuity-meta">
                <Text>继续上次</Text>
                <Text>{activityTime(data.assistant.lastActivity.occurredAt)}</Text>
              </View>
              <Text className="home-claw-continuity-title">{data.assistant.lastActivity.title}</Text>
              <Text className="home-claw-continuity-copy">
                {data.assistant.lastActivity.primaryAction?.label ?? "继续向 Claw 提问"}
              </Text>
            </View>
            <ChevronRight size={19} color="rgba(255,255,255,.58)" />
          </View>
        ) : null}
        <Button
          className="home-claw-primary pressable"
          onClick={() => Taro.navigateTo({ url: "/pages/ask/index?voice=1" })}
        >
          <View className="home-claw-primary-icon"><Mic size={20} color="#2F6C56" strokeWidth={2.2} /></View>
          <Text>开始语音咨询</Text>
          <ChevronRight className="home-claw-primary-arrow" size={20} color="rgba(16,42,67,.38)" />
        </Button>
        <View className="home-claw-shortcuts">
          <View
            className="home-claw-shortcut pressable"
            onClick={() => Taro.navigateTo({ url: "/pages/ask/index" })}
          >
            <View className="shortcut-symbol"><HeartHandshake size={19} color="#FFFFFF" /></View>
            <Text>文字输入</Text>
          </View>
          <View
            className="home-claw-shortcut pressable"
            onClick={() => openProtectedFeature("/pages/ask/index?photo=1", "health")}
          >
            <View className="shortcut-symbol"><Camera size={19} color="#FFFFFF" /></View>
            <Text>拍报告药盒</Text>
          </View>
          <View
            className="home-claw-shortcut pressable"
            onClick={() => openProtectedFeature("/pages/appointments/index")}
          >
            <View className="shortcut-symbol"><CalendarPlus size={19} color="#FFFFFF" /></View>
            <Text>预约协助</Text>
          </View>
        </View>
        <Text className="home-claw-retention">
          仅保留 30 天服务类别与进度，不保存原始对话
        </Text>
      </View>

      <View className="home-section-head">
        <Text className="home-section-title">近期安排</Text>
        <Text className="home-section-note">已核验信息</Text>
      </View>
      <View className="summary-surface">
        <View
          className="summary-row pressable"
          onClick={() => Taro.switchTab({ url: "/pages/services/index" })}
        >
          <View className="summary-icon schedule"><Stethoscope size={23} color="#365F8A" /></View>
          <View className="grow">
            <Text className="summary-kicker">家医排班</Text>
            <Text className="summary-title">
              {nextSchedule?.practitioner?.name ?? "查看家医网络排班"}
              {nextSchedule?.department?.name ? ` · ${nextSchedule.department.name}` : ""}
            </Text>
            <Text className="summary-detail">
              {scheduleTime(nextSchedule?.starts_at)}
              {nextSchedule?.institution?.name ? ` · ${nextSchedule.institution.name}` : ""}
            </Text>
          </View>
          <ChevronRight className="summary-arrow" size={21} color="rgba(16,42,67,.3)" />
        </View>
      </View>

      {data.access.canStoreHealthData ? (
        <>
          <View className="home-section-head">
            <Text className="home-section-title">最近健康记录</Text>
            <Text
              className="home-section-link pressable"
              onClick={() => openProtectedFeature("/pages/health-records/index", "health")}
            >
              全部记录 <ChevronRight size={14} color="#2F6C56" />
            </Text>
          </View>
          {(data.healthSummary ?? []).length ? (
            <View className="home-health-grid">
              {(data.healthSummary ?? []).slice(0, 4).map((item) => (
                <View
                  key={item.id}
                  className={`home-health-card health-${item.type} pressable`}
                  onClick={() => openProtectedFeature("/pages/health-records/index", "health")}
                >
                  <View className="home-health-card-head">
                    <View className="home-health-icon"><HealthIcon type={item.type} /></View>
                    <Text className="home-health-label">{healthLabels[item.type]}</Text>
                  </View>
                  <View className="home-health-value-line">
                    <Text className="home-health-value">{healthValue(item)}</Text>
                    <Text className="home-health-unit">{item.unit}</Text>
                  </View>
                  <Text className="home-health-time">{healthTime(item.measuredAt)}</Text>
                  <Text className="home-health-delta">{healthDelta(item)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View
              className="home-health-empty pressable"
              onClick={() => openProtectedFeature("/pages/health-records/index", "health")}
            >
              <View className="home-health-empty-icon"><HeartPulse size={23} color="#2F6C56" /></View>
              <View className="grow">
                <Text className="home-health-empty-title">还没有健康记录</Text>
                <Text className="home-health-empty-copy">可手工记录血压、血糖、体重和步数</Text>
              </View>
              <ChevronRight size={20} color="rgba(16,42,67,.3)" />
            </View>
          )}
        </>
      ) : null}

      <View className="home-safety">
        <Text className="home-safety-title">紧急情况</Text>
        <Text className="home-safety-copy">
          胸痛、呼吸困难、意识不清或大出血请立即拨打 120。AI 不诊断、不开方、不调药。
        </Text>
      </View>
      </> : null}
      {process.env.TARO_ENV === "h5" ? <CustomTabBar /> : null}
    </View>
  );
}
