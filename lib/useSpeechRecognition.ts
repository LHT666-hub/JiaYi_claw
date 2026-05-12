"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "idle" | "listening" | "result" | "error" | "unsupported";

export type SpeechError = "no-speech" | "not-allowed" | "network" | "unknown";

const errorMessageMap: Record<SpeechError, string> = {
  "no-speech": "没有听清楚，可以再说一遍。",
  "not-allowed": "需要允许麦克风权限后才能使用语音输入。",
  network: "网络连接有问题，请检查后再试。",
  unknown: "语音识别出现问题，请再试一次。",
};

function mapSpeechError(error: string): SpeechError {
  if (error === "no-speech" || error === "aborted") return "no-speech";
  if (error === "not-allowed" || error === "service-not-allowed") return "not-allowed";
  if (error === "network") return "network";
  return "unknown";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionInstance = any;

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;

  const win = window as any;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useSpeechRecognition() {
  const [state, setState] = useState<SpeechState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorType, setErrorType] = useState<SpeechError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = useRef<boolean | null>(null);

  useEffect(() => {
    supported.current = getSpeechRecognitionConstructor() !== null;
  }, []);

  const isSupported = useCallback(() => {
    if (supported.current !== null) return supported.current;
    return getSpeechRecognitionConstructor() !== null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();

    if (!Ctor) {
      setState("unsupported");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = new Ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setState("listening");
      setTranscript("");
      setErrorType(null);
    };

    recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
      const result: string = event.results?.[0]?.[0]?.transcript ?? "";
      if (result.trim()) {
        setTranscript(result.trim());
        setState("result");
      } else {
        setErrorType("no-speech");
        setState("error");
      }
    };

    recognition.onerror = (event: { error: string }) => {
      const mapped = mapSpeechError(event.error);
      setErrorType(mapped);
      setState("error");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setState("error");
      setErrorType("unknown");
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setState("idle");
    setTranscript("");
    setErrorType(null);
  }, [stop]);

  const errorMessage = errorType ? errorMessageMap[errorType] : null;

  return {
    state,
    transcript,
    errorType,
    errorMessage,
    isSupported,
    start,
    stop,
    reset,
  };
}
