"use client";

import { useEffect } from "react";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

type VoiceInputPanelProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
};

export function VoiceInputPanel({ open, onClose, onConfirm }: VoiceInputPanelProps) {
  const { state, transcript, errorMessage, isSupported, start, reset } = useSpeechRecognition();

  useEffect(() => {
    if (open && state === "idle") {
      if (!isSupported()) return;
      const timer = setTimeout(() => start(), 300);
      return () => clearTimeout(timer);
    }
  }, [open, state, isSupported, start]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  if (!open) return null;

  if (!isSupported()) {
    return (
      <div className="animate-in rounded-[28px] border border-line bg-cream p-6 shadow-float">
        <div className="flex items-start justify-between">
          <p className="text-base font-semibold text-navy">语音输入</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/8 text-navy/60 active:scale-95"
          >
            <span className="text-base font-semibold">×</span>
          </button>
        </div>
        <div className="mt-4 rounded-[20px] bg-[#FFF8ED] px-4 py-5 text-center">
          <p className="text-base leading-7 text-navy">
            当前浏览器暂不支持语音识别，请使用文字输入。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white active:scale-[0.98]"
        >
          好的，用文字输入
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in rounded-[28px] border border-line bg-cream p-6 shadow-float">
      <div className="flex items-start justify-between">
        <p className="text-base font-semibold text-navy">语音输入</p>
        <button
          type="button"
          onClick={() => { reset(); onClose(); }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/8 text-navy/60 active:scale-95"
        >
          <span className="text-base font-semibold">×</span>
        </button>
      </div>

      <div className="mt-4 rounded-[22px] bg-[#FFF8ED] px-5 py-6 text-center">
        {state === "idle" ? (
          <p className="text-base leading-7 text-navy">
            请说出您想问的问题
          </p>
        ) : null}

        {state === "listening" ? (
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage/15">
              <Mic className="h-7 w-7 text-sage animate-pulse" />
            </div>
            <p className="text-base font-semibold text-navy">正在听您说话…</p>
            <p className="text-sm text-navy/55">说完后会自动停止</p>
          </div>
        ) : null}

        {state === "result" ? (
          <div className="space-y-3">
            <p className="text-sm text-navy/55">我听到的是：</p>
            <p className="text-lg font-semibold leading-8 text-navy">
              {transcript}
            </p>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="space-y-2">
            <p className="text-base leading-7 text-navy">
              {errorMessage}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {state === "idle" ? (
          <button
            type="button"
            onClick={start}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-4 text-base font-semibold text-white active:scale-[0.98]"
          >
            <Mic className="h-5 w-5" />
            开始说话
          </button>
        ) : null}

        {state === "listening" ? (
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-full border border-line bg-[#FFF8ED] px-4 py-4 text-base font-semibold text-navy active:scale-[0.98]"
          >
            取消
          </button>
        ) : null}

        {state === "result" ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { reset(); start(); }}
              className="rounded-full border border-line bg-[#FFF8ED] px-4 py-4 text-base font-semibold text-navy active:scale-[0.98]"
            >
              重新说
            </button>
            <button
              type="button"
              onClick={() => { onConfirm(transcript); reset(); onClose(); }}
              className="rounded-full bg-navy px-4 py-4 text-base font-semibold text-white active:scale-[0.98]"
            >
              确认发送
            </button>
          </div>
        ) : null}

        {state === "error" ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="rounded-full border border-line bg-[#FFF8ED] px-4 py-4 text-base font-semibold text-navy active:scale-[0.98]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => { reset(); start(); }}
              className="rounded-full bg-navy px-4 py-4 text-base font-semibold text-white active:scale-[0.98]"
            >
              再试一次
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
