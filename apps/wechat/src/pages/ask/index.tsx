import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, getCareSubjectId, uploadVoice } from "../../lib/api";

type AssistantAction = {
  id: string;
  kind: "service" | "schedule" | "public_info" | "progress" | "emergency";
  label: string;
  description: string;
  href: string;
  requiresConfirmation: boolean;
};

type State =
  "idle" | "recording" | "transcribing" | "result" | "asking" | "error";

export default function AskPage() {
  const recorder = useMemo(() => Taro.getRecorderManager(), []);
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [error, setError] = useState("");

  useLoad((params) => {
    if (params.voice === "1") setState("idle");
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
          setState("result");
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

  function start() {
    setText("");
    setAnswer("");
    setNextStep("");
    setActions([]);
    recorder.start({
      duration: 30_000,
      sampleRate: 16_000,
      numberOfChannels: 1,
      encodeBitRate: 48_000,
      format: "mp3",
    });
  }

  async function ask() {
    if (!text.trim()) return;
    setState("asking");
    try {
      const residentId = getCareSubjectId();
      const result = await apiRequest<{
        reply: { answer?: string; nextStep?: string };
        actions: AssistantAction[];
      }>("/api/v1/assistant/messages", {
        method: "POST",
        data: {
          question: text.trim(),
          ...(residentId ? { residentId } : {}),
        },
      });
      setAnswer(result.reply.answer ?? "已收到您的问题。");
      setNextStep(result.reply.nextStep ?? "");
      setActions(result.actions ?? []);
      setState("result");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Claw 暂时无法回答");
      setState("error");
    }
  }

  function openAction(action: AssistantAction) {
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

  return (
    <View className="page voice-page">
      <View className="voice-hero">
        <Text className="title">语音问 Claw</Text>
        <Text className="subtitle">普通话、上海话和吴语都可以试试</Text>
      </View>
      <View className="card voice-card">
        {state === "recording" ? (
          <>
            <Text className="voice-status">正在录音 {seconds} 秒</Text>
            <Button className="danger-button" onClick={() => recorder.stop()}>
              停止并识别
            </Button>
          </>
        ) : null}
        {state === "transcribing" ? (
          <Text className="voice-status">正在识别语音，请稍候...</Text>
        ) : null}
        {state === "asking" ? (
          <Text className="voice-status">Claw 正在整理回答...</Text>
        ) : null}
        {state === "idle" || state === "error" ? (
          <Button className="primary" onClick={start}>
            开始录音
          </Button>
        ) : null}
        {error ? <Text className="voice-error">{error}</Text> : null}
        {text ? (
          <>
            <Text className="label">识别文字</Text>
            <Textarea
              className="textarea"
              value={text}
              onInput={(event) => setText(event.detail.value)}
              maxlength={3000}
            />
            <Button
              className="primary"
              disabled={state === "asking"}
              onClick={() => void ask()}
            >
              确认文字并提问
            </Button>
            <Button className="secondary" onClick={start}>
              重新录音
            </Button>
          </>
        ) : null}
      </View>
      {answer ? (
        <View className="card">
          <Text className="label">Claw</Text>
          <Text className="voice-answer">{answer}</Text>
          {nextStep ? <Text className="assistant-next">{nextStep}</Text> : null}
          {actions.length ? (
            <View className="assistant-actions">
              {actions.map((action) => (
                <View key={action.id} className="assistant-action">
                  <View className="grow">
                    <Text className="assistant-action-title">
                      {action.label}
                    </Text>
                    <Text className="assistant-action-copy">
                      {action.description}
                    </Text>
                    {action.requiresConfirmation ? (
                      <Text className="assistant-confirmation">
                        确认后才会提交
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    className="assistant-action-button"
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
      ) : null}
      <View className="card">
        <Text className="muted">
          音频仅用于本次转写，临时处理后立即删除；默认不保存完整健康对话。胸痛、呼吸困难、意识不清或大出血请立即拨打
          120。
        </Text>
      </View>
    </View>
  );
}
