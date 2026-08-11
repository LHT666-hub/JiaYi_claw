import { Button, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
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
  network: null | { name: string; community?: { name?: string } };
  serviceRequests: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
  }>;
  schedules: Schedule[];
  notifications: Array<{ id: string; is_read: boolean }>;
};

const statusLabels: Record<string, string> = {
  submitted: "已提交",
  needs_info: "待补资料",
  accepted: "团队已受理",
  checking_availability: "核对资源中",
  awaiting_user_confirmation: "待您确认",
  booked: "已预约",
  waitlisted: "候补中",
};

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
    if (!isLoggedIn()) void Taro.navigateTo({ url: "/pages/login/index" });
    else void load();
  });

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
  const nextSchedule = data?.schedules[0];
  const unreadCount = data?.notifications.filter((item) => !item.is_read).length ?? 0;

  function scheduleTime(value?: string) {
    if (!value) return "暂无已核验排班";
    const date = new Date(value);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
        >
          <Text>消息</Text>
          {unreadCount ? <View className="home-unread">{unreadCount}</View> : null}
        </View>
      </View>

      {loading && !data ? <PageSkeleton rows={2} /> : null}
      {!loading && error && !data ? (
        <PageFeedback title="首页暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && data ? <InlineRetry message={error} onRetry={() => void load()} /> : null}

      {data?.careSubject ? (
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
            {data.careSubjects.length > 1 ? (
              <Text className="subject-switch">切换 ›</Text>
            ) : (
              <Text className="subject-switch">已绑定</Text>
            )}
          </View>
        </Picker>
      ) : null}

      {data ? <><View className="home-claw-hero">
        <View className="home-claw-orbit">
          <Text>AI</Text>
        </View>
        <Text className="home-claw-title">今天想让 Claw 帮什么？</Text>
        <Text className="home-claw-copy">
          一句话查信息、整理诉求，再由您确认办理。
        </Text>
        <Button
          className="home-claw-primary pressable"
          onClick={() => Taro.navigateTo({ url: "/pages/ask/index?voice=1" })}
        >
          按住想说的，直接告诉我
        </Button>
        <View className="home-claw-shortcuts">
          <View
            className="home-claw-shortcut pressable"
            onClick={() => Taro.navigateTo({ url: "/pages/ask/index" })}
          >
            <Text className="shortcut-symbol">问</Text>
            <Text>打字咨询</Text>
          </View>
          <View
            className="home-claw-shortcut pressable"
            onClick={() => Taro.navigateTo({ url: "/pages/ask/index?photo=1" })}
          >
            <Text className="shortcut-symbol">拍</Text>
            <Text>报告药盒</Text>
          </View>
          <View
            className="home-claw-shortcut pressable"
            onClick={() => Taro.navigateTo({ url: "/pages/appointments/index" })}
          >
            <Text className="shortcut-symbol">约</Text>
            <Text>一键预约</Text>
          </View>
          <View
            className="home-claw-shortcut pressable"
            onClick={() => Taro.switchTab({ url: "/pages/services/index" })}
          >
            <Text className="shortcut-symbol">诊</Text>
            <Text>医生坐班</Text>
          </View>
        </View>
      </View>

      <View className="home-section-head">
        <Text className="home-section-title">今日摘要</Text>
        <Text className="home-section-note">只展示与您相关的信息</Text>
      </View>
      <View className="summary-surface">
        <View
          className="summary-row pressable"
          onClick={() => Taro.navigateTo({ url: "/pages/progress/index" })}
        >
          <View className="summary-icon service">办</View>
          <View className="grow">
            <Text className="summary-kicker">正在办理</Text>
            <Text className="summary-title">
              {activeRequest?.title ?? "当前没有待处理服务"}
            </Text>
            <Text className="summary-detail">
              {activeRequest
                ? statusLabels[activeRequest.status] ?? "团队处理中"
                : "可以直接向 Claw 描述需求"}
            </Text>
          </View>
          <Text className="summary-arrow">›</Text>
        </View>
        <View
          className="summary-row pressable"
          onClick={() => Taro.switchTab({ url: "/pages/services/index" })}
        >
          <View className="summary-icon schedule">诊</View>
          <View className="grow">
            <Text className="summary-kicker">近期坐班</Text>
            <Text className="summary-title">
              {nextSchedule?.practitioner?.name ?? "查看家医网络排班"}
              {nextSchedule?.department?.name ? ` · ${nextSchedule.department.name}` : ""}
            </Text>
            <Text className="summary-detail">
              {scheduleTime(nextSchedule?.starts_at)}
              {nextSchedule?.institution?.name ? ` · ${nextSchedule.institution.name}` : ""}
            </Text>
          </View>
          <Text className="summary-arrow">›</Text>
        </View>
      </View>

      <View className="home-safety">
        <Text className="home-safety-title">紧急情况</Text>
        <Text className="home-safety-copy">
          胸痛、呼吸困难、意识不清或大出血请立即拨打 120。AI 不诊断、不开方、不调药。
        </Text>
      </View>
      </> : null}
    </View>
  );
}
