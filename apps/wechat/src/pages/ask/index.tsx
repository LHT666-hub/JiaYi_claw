import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  getCareSubjectId,
  uploadVoice,
  withCareSubject,
} from "../../lib/api";

type AssistantAction = {
  id: string;
  kind: "service" | "schedule" | "public_info" | "progress" | "emergency";
  label: string;
  description: string;
  href: string;
  requiresConfirmation: boolean;
};

type AssistantActivity = {
  id: string;
  title: string;
  detail: string;
  badge: string;
  riskLevel: "low" | "medium" | "high" | "emergency";
  occurredAt: string;
  primaryAction: { label: string; href: string } | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  nextStep?: string;
  actions?: AssistantAction[];
};

type State = "idle" | "recording" | "transcribing" | "asking" | "error";

export default function AskPage() {
  const recorder = useMemo(() => Taro.getRecorderManager(), []);
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [activities, setActivities] = useState<AssistantActivity[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "您好，直接告诉我想办什么。我可以查已核验信息、整理预约或转诊诉求，再把下一步交给您确认。",
    },
  ]);

  useLoad((params) => {
    if (params.voice === "1") setTimeout(() => start(), 180);
  });

  useDidShow(() => {
    void loadActivities();
  });

  useEffect(() => {
    recorder.onStart(() => {
      setSeconds(0);
      setError("");
      setState("recording");
    });
    recorder.onStop(({ tempFilePath }) => {
      setState("transcribing");
      void uploadVoice(tempFilePath)
        .then((result) => {
          setText(result.text);
          setState("idle");
          void Taro.showToast({ title: "请核对识别文字", icon: "none" });
        })
        .catch((reason) => {
          setError(reason instanceof Error ? reason.message : "语音识别失败");
          setState("error");
        });
    });
    recorder.onError(() => {
      setError("录音没有启动成功，请检查麦克风权限。");
      setState("error");
    });
  }, [recorder]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  async function loadActivities() {
    try {
      const result = await apiRequest<{ activities: AssistantActivity[] }>(
        withCareSubject("/api/v1/assistant/session"),
      );
      setActivities(result.activities ?? []);
    } catch {
      // The assistant remains usable if continuity is temporarily unavailable.
    }
  }

  function start() {
    setText("");
    setError("");
    recorder.start({
      duration: 30_000,
      sampleRate: 16_000,
      numberOfChannels: 1,
      encodeBitRate: 48_000,
      format: "mp3",
    });
  }

  async function ask() {
    const question = text.trim();
    if (!question || state === "asking") return;
    setText("");
    setError("");
    setMessages((items) => [
      ...items,
      { id: `${Date.now()}-user`, role: "user", text: question },
    ]);
    setState("asking");
    try {
      const residentId = getCareSubjectId();
      const result = await apiRequest<{
        reply: { answer?: string; nextStep?: string };
        actions: AssistantAction[];
        activity: AssistantActivity | null;
      }>("/api/v1/assistant/messages", {
        method: "POST",
        data: {
          question,
          ...(residentId ? { residentId } : {}),
        },
      });
      setMessages((items) => [
        ...items,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          text: result.reply.answer ?? "已收到您的问题。",
          nextStep: result.reply.nextStep,
          actions: result.actions ?? [],
        },
      ]);
      if (result.activity) {
        setActivities((items) => [
          result.activity as AssistantActivity,
          ...items.filter((item) => item.id !== result.activity?.id),
        ].slice(0, 12));
      }
      setState("idle");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Claw 暂时无法回答";
      setError(message);
      setMessages((items) => [
        ...items,
        { id: `${Date.now()}-error`, role: "assistant", text: message },
      ]);
      setState("error");
    }
  }

  async function clearActivities() {
    if (clearing) return;
    setClearing(true);
    try {
      await apiRequest(withCareSubject("/api/v1/assistant/session"), {
        method: "DELETE",
      });
      setActivities([]);
      setActivityOpen(false);
      void Taro.showToast({ title: "服务轨迹已清除", icon: "success" });
    } catch (reason) {
      void Taro.showToast({
        title: reason instanceof Error ? reason.message : "清除失败",
        icon: "none",
      });
    } finally {
      setClearing(false);
    }
  }

  function openAction(action: AssistantAction | { href: string }) {
    if (action.href === "tel:120") {
      void Taro.makePhoneCall({ phoneNumber: "120" });
      return;
    }
    if (action.href.startsWith("/appointments")) {
      const query = action.href.includes("?")
        ? action.href.slice(action.href.indexOf("?"))
        : "";
      void Taro.navigateTo({ url: `/pages/appointments/index${query}` });
      return;
    }
    if (action.href.startsWith("/services")) {
      void Taro.switchTab({ url: "/pages/services/index" });
      return;
    }
    if (action.href.startsWith("/public-info")) {
      void Taro.navigateTo({ url: "/pages/public-info/index" });
      return;
    }
    void Taro.navigateTo({ url: "/pages/progress/index" });
  }

  function activityTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "最近";
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <View className="page claw-chat-page">
      <View className="claw-chat-heading">
        <View>
          <Text className="eyebrow">服务型 AI 助手</Text>
          <Text className="brand-title left">问 Claw</Text>
        </View>
        <View className="claw-online">
          <View className="claw-online-dot" />
          <Text>服务中</Text>
        </View>
      </View>

      {activities.length ? (
        <View className="continuity-card">
          <View
            className="continuity-head pressable"
            onClick={() => setActivityOpen((value) => !value)}
          >
            <View className="continuity-icon">↻</View>
            <View className="grow">
              <Text className="subject-label">继续上次服务</Text>
              <Text className="continuity-title">{activities[0].title}</Text>
            </View>
            <Text className="continuity-count">{activities.length} 条</Text>
            <Text className="continuity-chevron">{activityOpen ? "⌄" : "›"}</Text>
          </View>
          {activityOpen ? (
            <View className="continuity-body">
              {activities.slice(0, 5).map((activity) => (
                <View key={activity.id} className="continuity-row">
                  <View
                    className={`continuity-dot ${activity.riskLevel === "emergency" ? "danger" : ""}`}
                  />
                  <View className="grow">
                    <View className="row">
                      <Text className="continuity-row-title">{activity.title}</Text>
                      <Text className="continuity-badge">{activity.badge}</Text>
                    </View>
                    <Text className="continuity-detail">{activity.detail}</Text>
                    <Text className="continuity-time">
                      {activityTime(activity.occurredAt)}
                    </Text>
                  </View>
                  {activity.primaryAction ? (
                    <Button
                      className="continuity-action pressable"
                      size="mini"
                      onClick={() => openAction(activity.primaryAction!)}
                    >
                      继续
                    </Button>
                  ) : null}
                </View>
              ))}
              <View className="continuity-footer">
                <Text>原对话不保存，结构化轨迹保留 30 天</Text>
                <Button
                  className="continuity-clear"
                  size="mini"
                  disabled={clearing}
                  onClick={() => void clearActivities()}
                >
                  清除
                </Button>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="privacy-hint">
          <Text>对话原文不保存；办理动作会形成可清除的服务轨迹</Text>
        </View>
      )}

      <View className="safety-strip">
        胸痛、呼吸困难、意识不清或大出血请立即拨打 120。
      </View>

      <View className="chat-stream">
        {messages.map((message) => (
          <View
            key={message.id}
            className={`chat-row ${message.role === "user" ? "chat-row-user" : ""}`}
          >
            <View className={`chat-bubble ${message.role}`}>
              <Text className="chat-copy">{message.text}</Text>
              {message.nextStep ? (
                <Text className="assistant-next">下一步：{message.nextStep}</Text>
              ) : null}
              {message.actions?.length ? (
                <View className="assistant-actions">
                  {message.actions.map((action) => (
                    <View key={action.id} className="assistant-action">
                      <View className="grow">
                        <Text className="assistant-action-title">{action.label}</Text>
                        <Text className="assistant-action-copy">
                          {action.description}
                        </Text>
                        {action.requiresConfirmation ? (
                          <Text className="assistant-confirmation">确认后才会提交</Text>
                        ) : null}
                      </View>
                      <Button
                        className="assistant-action-button pressable"
                        size="mini"
                        onClick={() => openAction(action)}
                      >
                        {action.requiresConfirmation ? "去核对" : "查看"}
                      </Button>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ))}
        {state === "asking" ? (
          <View className="chat-row">
            <View className="typing-pill">
              <View className="typing-mini-dot" />
              <View className="typing-mini-dot delay" />
              <View className="typing-mini-dot delay-two" />
            </View>
          </View>
        ) : null}
      </View>

      <View className="composer-card">
        {state === "recording" ? (
          <View className="recording-state">
            <View className="recording-pulse" />
            <Text>正在录音 {seconds} 秒</Text>
            <Button className="recording-stop" size="mini" onClick={() => recorder.stop()}>
              停止识别
            </Button>
          </View>
        ) : null}
        {state === "transcribing" ? (
          <Text className="composer-status">正在识别语音，请稍候...</Text>
        ) : null}
        <Textarea
          className="chat-textarea"
          value={text}
          placeholder="问服务、排班、活动或准备材料"
          maxlength={3000}
          onInput={(event) => setText(event.detail.value)}
        />
        <View className="composer-actions">
          <Button
            className="voice-trigger pressable"
            disabled={state === "recording" || state === "transcribing"}
            onClick={start}
          >
            语音
          </Button>
          <Button
            className="send-trigger pressable"
            disabled={!text.trim() || state === "asking"}
            onClick={() => void ask()}
          >
            发送
          </Button>
        </View>
        {error ? <Text className="voice-error">{error}</Text> : null}
      </View>

      <Text className="claw-privacy-note">
        音频转写后立即删除。Claw 只做服务导航和资料整理，不替代医生。
      </Text>
    </View>
  );
}
