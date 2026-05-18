"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

export type GroupVoiceMode = "voice" | "text";

export type GroupVoiceState =
  | "idle"
  | "recording"
  | "recorded"
  | "transcribing"
  | "transcribed"
  | "error"
  | "permissionDenied";

type GroupVoicePanelProps = {
  open: boolean;
  onClose: () => void;
  onSendVoice: (durationSeconds: number) => void;
  onSendText: (text: string) => void;
};

const MIN_RECORDING_MS = 800;

function formatDurationLabel(durationMs: number) {
  return `${Math.max(1, Math.round(durationMs / 1000))}''`;
}

export function GroupVoicePanel({
  open,
  onClose,
  onSendVoice,
  onSendText,
}: GroupVoicePanelProps) {
  const [mode, setMode] = useState<GroupVoiceMode>("voice");
  const [status, setStatus] = useState<GroupVoiceState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const speech = useSpeechRecognition();

  function clearTimers() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function resetPanel(nextMode: GroupVoiceMode = mode) {
    clearTimers();
    speech.reset();
    startTimeRef.current = null;
    setMode(nextMode);
    setStatus("idle");
    setDurationMs(0);
    setDraftText("");
    setErrorMessage("");
  }

  useEffect(() => {
    if (!open) {
      resetPanel("voice");
    }

    return () => {
      clearTimers();
    };
  }, [open]);

  useEffect(() => {
    if (mode !== "text" || status !== "transcribing") return;

    if (speech.state === "result" && speech.transcript) {
      setDraftText(speech.transcript);
      setStatus("transcribed");
    } else if (speech.state === "error" || speech.state === "unsupported") {
      setDraftText("");
      setStatus("transcribed");
      setErrorMessage(speech.errorMessage ?? "语音识别不可用，请手动输入文字");
    }
  }, [mode, status, speech.state, speech.transcript, speech.errorMessage]);

  const holdLabel = useMemo(() => {
    if (status === "recording") {
      return mode === "voice" ? "松开发送" : "松开识别";
    }

    return mode === "voice" ? "按住说话" : "按住说话，松开识别";
  }, [mode, status]);

  async function beginRecording() {
    if (status === "recording") {
      return;
    }

    clearTimers();
    setErrorMessage("");
    setDraftText("");

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setStatus("permissionDenied");
        setErrorMessage("需要开启麦克风权限");
        return;
      }
    }

    startTimeRef.current = Date.now();
    setDurationMs(0);
    setStatus("recording");
    intervalRef.current = window.setInterval(() => {
      if (startTimeRef.current) {
        setDurationMs(Date.now() - startTimeRef.current);
      }
    }, 100);

    if (mode === "text") {
      speech.start();
    }
  }

  function finishRecording(cancelled = false) {
    if (status !== "recording") {
      return;
    }

    clearTimers();
    const finalDuration = startTimeRef.current ? Date.now() - startTimeRef.current : durationMs;
    startTimeRef.current = null;
    setDurationMs(finalDuration);

    if (cancelled) {
      setStatus("idle");
      setErrorMessage("");
      setDraftText("");
      return;
    }

    if (finalDuration < MIN_RECORDING_MS) {
      setStatus("error");
      setErrorMessage("说话时间太短");
      return;
    }

    if (mode === "voice") {
      setStatus("recorded");
      return;
    }

    setStatus("transcribing");
    speech.stop();
  }

  function handleClose() {
    resetPanel("voice");
    onClose();
  }

  function handleCancelRecording() {
    finishRecording(true);
    onClose();
  }

  function handleSend() {
    if (mode === "voice" && status === "recorded") {
      onSendVoice(Math.max(1, Math.round(durationMs / 1000)));
      handleClose();
      return;
    }

    if (mode === "text" && status === "transcribed") {
      const trimmed = draftText.trim();

      if (!trimmed) {
        setStatus("error");
        setErrorMessage("识别结果为空，请再试一次");
        return;
      }

      onSendText(trimmed);
      handleClose();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="animate-in rounded-[28px] border border-line bg-cream p-5 shadow-float">
      <div className="flex items-start justify-between">
        <p className="text-base font-semibold text-navy">语音输入</p>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/8 text-navy/60 active:scale-95"
        >
          <span className="text-base font-semibold">×</span>
        </button>
      </div>

      <div className="mt-4 flex gap-2 rounded-full bg-surface-card p-1">
        <button
          type="button"
          onClick={() => resetPanel("voice")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${
            mode === "voice" ? "bg-navy text-white" : "text-navy/60"
          }`}
        >
          发语音
        </button>
        <button
          type="button"
          onClick={() => resetPanel("text")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${
            mode === "text" ? "bg-navy text-white" : "text-navy/60"
          }`}
        >
          转文字
        </button>
      </div>

      <div className="mt-4 rounded-[24px] bg-surface-card px-4 py-5 text-center">
        {status === "idle" ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-navy">
              {mode === "voice" ? "发语音" : "转文字"}
            </p>
            <p className="text-sm leading-6 text-navy/60">{holdLabel}</p>
          </div>
        ) : null}

        {status === "recording" ? (
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 scale-105 items-center justify-center rounded-full bg-sage/15">
              <Mic className="h-7 w-7 animate-pulse text-sage" />
            </div>
            <p className="text-base font-semibold text-navy">{holdLabel}</p>
            <p className="text-sm text-navy/55">{formatDurationLabel(durationMs)}</p>
          </div>
        ) : null}

        {status === "recorded" ? (
          <div className="space-y-3">
            <p className="text-sm text-navy/55">语音预览</p>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-cream px-4 py-3 text-navy">
              <Mic className="h-4 w-4" />
              <span className="text-sm font-semibold">{formatDurationLabel(durationMs)}</span>
            </div>
            <button
              type="button"
              onClick={() => resetPanel("voice")}
              className="text-sm font-semibold text-sage underline underline-offset-4"
            >
              重新录制
            </button>
          </div>
        ) : null}

        {status === "transcribing" ? (
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage/15">
              <Mic className="h-7 w-7 animate-pulse text-sage" />
            </div>
            <p className="text-base font-semibold text-navy">识别中</p>
            <p className="text-sm text-navy/55">请稍等，正在整理语音内容</p>
          </div>
        ) : null}

        {status === "transcribed" ? (
          <div className="space-y-3 text-left">
            <p className="text-sm text-navy/55">识别结果</p>
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={4}
              className="w-full rounded-[18px] border border-line bg-cream px-4 py-3 text-sm leading-6 text-navy outline-none"
            />
          </div>
        ) : null}

        {status === "error" || status === "permissionDenied" ? (
          <div className="space-y-2">
            <p className="text-base font-semibold text-navy">
              {status === "permissionDenied" ? "需要开启麦克风权限" : "录音失败"}
            </p>
            <p className="text-sm leading-6 text-navy/60">{errorMessage}</p>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onPointerDown={beginRecording}
        onPointerUp={() => finishRecording(false)}
        onPointerCancel={() => finishRecording(true)}
        onPointerLeave={() => {
          if (status === "recording") {
            finishRecording(true);
          }
        }}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-4 text-base font-semibold transition ${
          status === "recording"
            ? "scale-[1.02] bg-navy text-white"
            : "bg-[#FBF1E2] text-navy"
        }`}
      >
        <Mic className="h-5 w-5" />
        {holdLabel}
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={status === "recording" ? handleCancelRecording : handleClose}
          className="rounded-full border border-line bg-surface-card px-4 py-3 text-sm font-semibold text-navy"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={
            !(
              (mode === "voice" && status === "recorded") ||
              (mode === "text" && status === "transcribed")
            )
          }
          className={`rounded-full px-4 py-3 text-sm font-semibold text-white ${
            (mode === "voice" && status === "recorded") ||
            (mode === "text" && status === "transcribed")
              ? "bg-navy"
              : "bg-navy/35"
          }`}
        >
          {mode === "voice" ? "发送语音" : "发送文字"}
        </button>
      </div>
    </div>
  );
}
