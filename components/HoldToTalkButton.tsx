"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

type HoldToTalkButtonProps = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onFallback?: () => void;
};

export function HoldToTalkButton({
  disabled = false,
  onTranscript,
  onFallback,
}: HoldToTalkButtonProps) {
  const {
    state,
    transcript,
    errorMessage,
    isSupported,
    start,
    stop,
    reset,
  } = useSpeechRecognition();
  const [seconds, setSeconds] = useState(0);
  const holdingRef = useRef(false);
  const deliveredRef = useRef("");

  useEffect(() => {
    if (state !== "listening") return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value >= 29) {
          holdingRef.current = false;
          stop();
          return 30;
        }
        return value + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state, stop]);

  useEffect(() => {
    if (state !== "result" || !transcript) return;
    if (deliveredRef.current === transcript) return;
    deliveredRef.current = transcript;
    onTranscript(transcript);
  }, [onTranscript, state, transcript]);

  function begin() {
    if (disabled || holdingRef.current) return;
    if (!isSupported()) {
      onFallback?.();
      return;
    }
    deliveredRef.current = "";
    holdingRef.current = true;
    setSeconds(0);
    reset();
    start();
    navigator.vibrate?.(18);
  }

  function finish() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    stop();
    navigator.vibrate?.(12);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    begin();
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    finish();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      begin();
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  }

  const listening = state === "listening";
  const label = listening
    ? `松开，转成文字${seconds ? ` ${seconds} 秒` : ""}`
    : state === "result"
      ? "已转成文字"
      : state === "error"
        ? errorMessage ?? "没有听清，请重试"
        : "按住说话";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="按住说话，松开转文字"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={(event) => event.preventDefault()}
      className={`ios-pressable flex h-12 min-w-0 flex-1 touch-none select-none items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
        listening
          ? "border-danger/25 bg-risk-strong text-danger shadow-[0_0_0_5px_rgba(164,74,63,0.08)]"
          : state === "error"
            ? "border-danger/20 bg-risk-soft text-danger"
            : "border-line bg-surface-card text-navy"
      } disabled:opacity-45`}
    >
      {listening ? (
        <span className="flex h-5 items-center gap-1" aria-hidden="true">
          {[10, 18, 14, 20].map((height, index) => (
            <span
              key={height}
              className="wave-bar wave-bar-live w-1 bg-danger"
              style={{ height, animationDelay: `${index * 90}ms` }}
            />
          ))}
        </span>
      ) : (
        <Mic className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
