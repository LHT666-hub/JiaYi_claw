"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "idle" | "listening" | "processing" | "result" | "error" | "unsupported";

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
  const transcriptRef = useRef("");
  const finishingRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
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
    transcriptRef.current = "";
    finishingRef.current = false;
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
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
        transcriptRef.current = result.trim();
        setTranscript(transcriptRef.current);
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
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      if (transcriptRef.current) {
        setTranscript(transcriptRef.current);
        setState("result");
      } else if (finishingRef.current) {
        setErrorType("no-speech");
        setState("error");
      }
      finishingRef.current = false;
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
    const recognition = recognitionRef.current;
    if (recognition) {
      finishingRef.current = true;
      setState("processing");
      try {
        recognition.stop();
      } catch {
        recognitionRef.current = null;
        setErrorType("unknown");
        setState("error");
      }
      finishTimerRef.current = window.setTimeout(() => {
        if (recognitionRef.current === recognition) {
          try {
            recognition.abort();
          } catch {
            // ignore
          }
          recognitionRef.current = null;
        }
        if (transcriptRef.current) {
          setTranscript(transcriptRef.current);
          setState("result");
        } else {
          setErrorType("no-speech");
          setState("error");
        }
        finishingRef.current = false;
        finishTimerRef.current = null;
      }, 2200);
    }
  }, []);

  const reset = useCallback(() => {
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setState("idle");
    setTranscript("");
    transcriptRef.current = "";
    finishingRef.current = false;
    setErrorType(null);
  }, []);

  useEffect(() => () => {
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
  }, []);

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
