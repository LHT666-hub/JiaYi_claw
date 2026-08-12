import { Button, Image, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  History,
  Mic,
  SendHorizontal,
  X,
} from "lucide-react-taro";
import {
  apiRequest,
  type DocumentAnalysisResult,
  getCareSubjectId,
  uploadDocumentImage,
  uploadVoice,
  uploadVoiceBlob,
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

type State = "idle" | "recording" | "transcribing" | "analyzing" | "asking" | "error";

const documentTypeLabels: Record<DocumentAnalysisResult["documentType"], string> = {
  lab_report: "化验报告",
  exam_report: "检查报告",
  prescription: "处方",
  medicine_package: "药盒或药品包装",
  discharge_summary: "出院小结",
  other: "医疗文件",
};

const quickPrompts = [
  { label: "查近期排班", prompt: "请帮我查询所属社区近期已核验的医生排班。" },
  { label: "预约家庭医生", prompt: "我想预约家庭医生，请帮我整理需要确认的信息。" },
  { label: "了解转诊流程", prompt: "如果社区看不了，我该怎么申请分级转诊？" },
] as const;

export default function AskPage() {
  const recorder = useMemo(
    () => process.env.TARO_ENV === "weapp" ? Taro.getRecorderManager() : null,
    [],
  );
  const browserRecorder = useRef<MediaRecorder | null>(null);
  const browserStream = useRef<MediaStream | null>(null);
  const browserChunks = useRef<Blob[]>([]);
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [sourceContext, setSourceContext] = useState<{ type: "content"; id: string; label: string } | null>(null);
  const [error, setError] = useState("");
  const [activities, setActivities] = useState<AssistantActivity[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [documentPreview, setDocumentPreview] = useState("");
  const [documentAnalysis, setDocumentAnalysis] =
    useState<DocumentAnalysisResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "您好，直接告诉我想办什么。我可以查已核验信息、整理预约或转诊诉求，再把下一步交给您确认。",
    },
  ]);

  useLoad((params) => {
    if (params.voice === "1") setTimeout(() => void start(), 180);
    if (params.photo === "1") setTimeout(() => void chooseDocumentImage(), 180);
    if (typeof params.prompt === "string" && params.prompt.trim()) {
      let prompt = params.prompt;
      try {
        prompt = decodeURIComponent(prompt);
      } catch {
        // Taro may already decode route parameters. Keep the readable value.
      }
      setText(prompt.slice(0, 3000));
    }
    if (params.contentId?.trim()) {
      setSourceContext({ type: "content", id: params.contentId.trim(), label: params.sourceLabel?.trim() ? decodeURIComponent(params.sourceLabel) : "已审核内容" });
    }
    if (params.history === "1") setActivityOpen(true);
  });

  useDidShow(() => {
    void loadActivities();
  });

  useEffect(() => {
    if (!recorder) return undefined;
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
    return undefined;
  }, [recorder]);

  useEffect(() => () => {
    if (browserRecorder.current?.state === "recording") browserRecorder.current.stop();
    browserStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

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

  async function start() {
    setText("");
    setError("");
    if (recorder) {
      recorder.start({
        duration: 30_000,
        sampleRate: 16_000,
        numberOfChannels: 1,
        encodeBitRate: 48_000,
        format: "mp3",
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("当前浏览器不支持录音，请使用微信小程序或文字输入。");
      setState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      browserStream.current = stream;
      browserChunks.current = [];
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      browserRecorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) browserChunks.current.push(event.data);
      };
      mediaRecorder.onerror = () => {
        setError("录音没有启动成功，请检查麦克风权限。");
        setState("error");
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(browserChunks.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        browserStream.current?.getTracks().forEach((track) => track.stop());
        browserStream.current = null;
        browserRecorder.current = null;
        if (!blob.size) {
          setError("没有录到声音，请再试一次。");
          setState("error");
          return;
        }
        setState("transcribing");
        void uploadVoiceBlob(blob)
          .then((result) => {
            setText(result.text);
            setState("idle");
            void Taro.showToast({ title: "请核对识别文字", icon: "none" });
          })
          .catch((reason) => {
            setError(reason instanceof Error ? reason.message : "语音识别失败");
            setState("error");
          });
      };
      mediaRecorder.start();
      setSeconds(0);
      setState("recording");
      setTimeout(() => {
        if (mediaRecorder.state === "recording") mediaRecorder.stop();
      }, 30_000);
    } catch {
      setError("无法使用麦克风，请在系统设置中允许录音权限。");
      setState("error");
    }
  }

  function stopRecording() {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (browserRecorder.current?.state === "recording") browserRecorder.current.stop();
  }

  async function chooseDocumentImage() {
    if (state === "analyzing" || state === "asking") return;
    setError("");
    try {
      const media = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["camera", "album"],
        sizeType: ["compressed"],
      });
      const file = media.tempFiles[0];
      if (!file?.tempFilePath) return;
      if (file.size && file.size > 4 * 1024 * 1024) {
        void Taro.showToast({ title: "图片不能超过 4MB", icon: "none" });
        return;
      }
      setDocumentPreview(file.tempFilePath);
      setDocumentAnalysis(null);
      setState("analyzing");
      const result = await uploadDocumentImage(file.tempFilePath);
      setDocumentAnalysis(result);
      setState("idle");
      void Taro.showToast({ title: "已完成临时识别", icon: "success" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "图片识别失败";
      if (!message.includes("cancel")) {
        setError(message);
        setState("error");
      }
    }
  }

  function useDocumentAnalysis() {
    if (!documentAnalysis) return;
    const visible = documentAnalysis.visibleText.slice(0, 8).join("；");
    const questions = documentAnalysis.questionsForClinician.join("；");
    setText(
      `请帮我整理这份${documentTypeLabels[documentAnalysis.documentType]}，图片识别到：${visible || "没有清晰识别到文字"}。我想向家庭医生确认：${questions || "下一步需要准备什么"}`,
    );
    setDocumentPreview("");
    setDocumentAnalysis(null);
    void Taro.showToast({ title: "请核对文字后发送", icon: "none" });
  }

  async function ask(questionOverride?: string) {
    const question = (questionOverride ?? text).trim();
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
          ...(sourceContext ? { sourceContext: { type: sourceContext.type, id: sourceContext.id } } : {}),
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
    if (action.href.startsWith("/content/")) {
      const id = action.href.slice("/content/".length);
      void Taro.navigateTo({ url: `/pages/content-detail/index?id=${encodeURIComponent(id)}` });
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
            <View className="continuity-icon"><History size={24} color="#2F6C56" strokeWidth={2} /></View>
            <View className="grow">
              <Text className="subject-label">继续上次服务</Text>
              <Text className="continuity-title">{activities[0].title}</Text>
            </View>
            <Text className="continuity-count">{activities.length} 条</Text>
            <View className="continuity-chevron">{activityOpen ? <ChevronDown size={20} color="rgba(16,42,67,.4)" /> : <ChevronRight size={20} color="rgba(16,42,67,.4)" />}</View>
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

      {sourceContext ? <View className="ask-source-context"><View className="grow"><Text className="ask-source-context-label">基于已审核内容继续问</Text><Text className="ask-source-context-title">{sourceContext.label}</Text></View><View className="ask-source-context-close" onClick={() => setSourceContext(null)}><X size={19} color="rgba(16,42,67,.5)" /></View></View> : null}

      {documentPreview ? (
        <View className="document-review-card">
          <View className="document-review-head">
            <Image
              className="document-preview-image"
              src={documentPreview}
              mode="aspectFill"
              aria-label="待识别医疗文件预览"
            />
            <View className="grow">
              <Text className="document-review-kicker">图片临时识别</Text>
              <Text className="document-review-title">
                {state === "analyzing"
                  ? "正在读取清晰可见的文字..."
                  : documentAnalysis
                    ? documentTypeLabels[documentAnalysis.documentType]
                    : "识别未完成"}
              </Text>
              <Text className="document-review-privacy">图片不会保存到居民档案</Text>
            </View>
            <View
              className="document-review-close"
              onClick={() => {
                if (state === "analyzing") return;
                setDocumentPreview("");
                setDocumentAnalysis(null);
              }}
            >
              <X size={21} color="rgba(16,42,67,.58)" />
            </View>
          </View>
          {state === "analyzing" ? (
            <View className="document-analyzing">
              <View className="typing-mini-dot" />
              <View className="typing-mini-dot delay" />
              <View className="typing-mini-dot delay-two" />
              <Text>正在进行文字提取与适老整理</Text>
            </View>
          ) : null}
          {documentAnalysis ? (
            <View className="document-result">
              {documentAnalysis.plainSummary.map((item) => (
                <View className="document-result-row" key={item}>
                  <View className="document-result-dot" />
                  <Text>{item}</Text>
                </View>
              ))}
              {documentAnalysis.uncertainItems.length ? (
                <View className="document-uncertain">
                  <Text>需要人工核对：{documentAnalysis.uncertainItems.join("；")}</Text>
                </View>
              ) : null}
              <Text className="document-safety">{documentAnalysis.safetyNotice}</Text>
              <Button
                className="document-use-button pressable"
                onClick={useDocumentAnalysis}
              >
                核对文字并继续问 Claw
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

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
        {messages.length === 1 && state === "idle" && !documentPreview ? (
          <View className="claw-starters">
            <Text className="claw-starters-label">您可以直接说</Text>
            <View className="claw-starter-list">
              {quickPrompts.map((item) => (
                <View
                  key={item.label}
                  className="claw-starter-chip pressable"
                  onClick={() => void ask(item.prompt)}
                  role="button"
                >
                  <Text>{item.label}</Text>
                  <ChevronRight size={16} color="rgba(16,42,67,.38)" />
                </View>
              ))}
              <View
                className="claw-starter-chip report pressable"
                onClick={() => void chooseDocumentImage()}
                role="button"
              >
                <Camera size={16} color="#365F8A" />
                <Text>拍报告或药盒</Text>
              </View>
            </View>
          </View>
        ) : null}
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
            <Button className="recording-stop" size="mini" onClick={stopRecording}>
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
            className="photo-trigger pressable"
            disabled={state === "recording" || state === "transcribing" || state === "analyzing"}
            onClick={() => void chooseDocumentImage()}
          >
            <Camera size={20} color="#315B7D" strokeWidth={2.1} />
            <Text>拍报告</Text>
          </Button>
          <Button
            className="voice-trigger pressable"
            disabled={state === "recording" || state === "transcribing" || state === "analyzing"}
            onClick={() => void start()}
          >
            <Mic size={20} color="#2F6C56" strokeWidth={2.1} />
            <Text>语音</Text>
          </Button>
          <Button
            className="send-trigger pressable"
            disabled={!text.trim() || state === "asking"}
            onClick={() => void ask()}
          >
            <SendHorizontal size={20} color="#FFFFFF" strokeWidth={2.1} />
            <Text>发送</Text>
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
