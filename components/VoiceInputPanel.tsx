"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Mic, RefreshCw } from "lucide-react";

type VoiceInputPanelProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
};

type VoiceState = "idle" | "recording" | "transcribing" | "result" | "error";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ [index: number]: { transcript?: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function browserSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function VoiceInputPanel({ open, onClose, onConfirm }: VoiceInputPanelProps) {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function transcribe(blob: Blob, filename: string) {
    if (!blob.size) {
      setError("没有录到声音，请再试一次。");
      setState("error");
      return;
    }
    setState("transcribing");
    const form = new FormData();
    form.append("audio", blob, filename);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/v1/speech/transcribe", { method: "POST", body: form, signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "语音识别失败");
      setTranscript(payload.data.text);
      setState("result");
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "语音识别失败，请重试。");
      setState("error");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function startRecording() {
    setError("");
    setTranscript("");
    setSeconds(0);
    cancelledRef.current = false;
    const Recognition = demoMode ? browserSpeechRecognition() : null;
    if (Recognition) {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = false;
      let resolved = false;
      recognition.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        resolved = Boolean(text);
        clearTimer();
        if (text) {
          setTranscript(text);
          setState("result");
        } else {
          setError("没有听清楚，请再说一遍。");
          setState("error");
        }
      };
      recognition.onerror = (event) => {
        clearTimer();
        if (cancelledRef.current) return;
        setError(event.error === "not-allowed" ? "请允许麦克风权限后再录音。" : "浏览器语音识别没有成功，请重试或改用文字输入。");
        setState("error");
      };
      recognition.onend = () => {
        clearTimer();
        recognitionRef.current = null;
        if (!cancelledRef.current && !resolved) {
          setError((current) => current || "没有听清楚，请再说一遍。");
          setState((current) => current === "result" ? current : "error");
        }
      };
      recognition.start();
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          if (value >= 29) {
            recognitionRef.current?.stop();
            return 30;
          }
          return value + 1;
        });
      }, 1000);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("当前浏览器不能直接录音，可以选择已有录音文件进行识别。");
      setState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimer();
        releaseStream();
        recorderRef.current = null;
        if (cancelledRef.current) return;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void transcribe(blob, `voice-${Date.now()}.${extension}`);
      };
      recorder.start(250);
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          if (value >= 29) {
            recorderRef.current?.stop();
            return 30;
          }
          return value + 1;
        });
      }, 1000);
    } catch (reason) {
      releaseStream();
      setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "请允许麦克风权限后再录音。" : "录音没有启动成功，请重试。");
      setState("error");
    }
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function reset() {
    requestRef.current?.abort();
    requestRef.current = null;
    cancelledRef.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    clearTimer();
    releaseStream();
    setState("idle");
    setSeconds(0);
    setTranscript("");
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  async function chooseAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await transcribe(file, file.name || `voice-${Date.now()}.audio`);
  }

  useEffect(() => {
    if (!open) reset();
    return () => {
      cancelledRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      clearTimer();
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-navy/28 p-4 backdrop-blur-sm">
      <section className="w-full rounded-[32px] border border-white/60 bg-cream p-5 shadow-[0_24px_60px_rgba(16,42,67,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-brand text-xl font-semibold text-navy">语音问 Claw</h2>
            <p className="mt-1 text-xs text-navy/52">最长 30 秒，识别后先由您确认文字</p>
          </div>
          <button type="button" onClick={close} aria-label="关闭语音输入" className="ios-control flex h-10 w-10 items-center justify-center rounded-full text-lg text-navy">×</button>
        </div>

        <div className="mt-5 rounded-[26px] border border-line/60 bg-surface-card px-5 py-6 text-center">
          {state === "idle" ? <><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-health-muted text-sage"><Mic className="h-8 w-8" /></span><p className="mt-4 text-sm text-navy/60">点击开始后，说出您想问的问题</p></> : null}
          {state === "recording" ? <><span className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-danger/12 text-danger"><Mic className="h-8 w-8" /></span><p className="mt-4 font-semibold text-navy">正在录音 {seconds} 秒</p><p className="mt-1 text-xs text-navy/45">说完后点击停止识别</p></> : null}
          {state === "transcribing" ? <><RefreshCw className="mx-auto h-9 w-9 animate-spin text-sage" /><p className="mt-4 font-semibold text-navy">正在识别普通话和吴语...</p><p className="mt-1 text-xs text-navy/45">首次启动模型可能需要十几秒</p></> : null}
          {state === "result" ? <><CheckCircle2 className="mx-auto h-9 w-9 text-success" /><p className="mt-3 text-xs text-navy/45">识别结果</p><p className="mt-2 text-base font-semibold leading-7 text-navy">{transcript}</p></> : null}
          {state === "error" ? <><p className="text-sm leading-6 text-danger">{error}</p><p className="mt-2 text-xs text-navy/45">音频不会保存在居民档案中</p></> : null}
        </div>

        <div className="mt-4 grid gap-3">
          {state === "idle" || state === "error" ? <button type="button" onClick={() => void startRecording()} className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-4 font-semibold text-white"><Mic className="h-5 w-5" />开始录音</button> : null}
          {state === "recording" ? <button type="button" onClick={stopRecording} className="w-full rounded-full bg-danger px-4 py-4 font-semibold text-white">停止并识别</button> : null}
          {state === "result" ? <div className="grid grid-cols-2 gap-3"><button type="button" onClick={reset} className="rounded-full border border-line bg-surface-card px-4 py-3 font-semibold text-navy">重新录音</button><button type="button" onClick={() => { onConfirm(transcript); close(); }} className="rounded-full bg-navy px-4 py-3 font-semibold text-white">使用这段文字</button></div> : null}
          {state !== "recording" && state !== "transcribing" ? <label className="cursor-pointer rounded-full border border-line bg-surface-card px-4 py-3 text-center text-sm font-semibold text-navy"><input type="file" accept="audio/*" onChange={(event) => void chooseAudio(event)} className="sr-only" />选择已有录音</label> : null}
        </div>
        <p className="mt-3 text-center text-[11px] leading-5 text-navy/38">{demoMode && browserSpeechRecognition() ? "演示环境由浏览器临时识别，不上传录音" : "音频仅用于本次转写，服务端临时处理后立即删除"}</p>
      </section>
    </div>
  );
}
