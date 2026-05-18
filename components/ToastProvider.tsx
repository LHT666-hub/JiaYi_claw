"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, Bell } from "lucide-react";

type ToastTone = "info" | "success" | "warning" | "danger";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneConfig: Record<ToastTone, { className: string; Icon: typeof Bell }> = {
  info: {
    className: "border-line bg-cream text-navy",
    Icon: Bell,
  },
  success: {
    className: "border-sage/30 bg-health-soft text-navy",
    Icon: Check,
  },
  warning: {
    className: "border-amber/30 bg-[#FFF1DD] text-navy",
    Icon: AlertTriangle,
  },
  danger: {
    className: "border-danger/30 bg-risk-soft text-danger",
    Icon: AlertTriangle,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeouts = useRef<Record<string, number>>({});

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setToasts((current) => [...current, { id, message, tone }]);

    timeouts.current[id] = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2500);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 mx-auto flex w-full max-w-[430px] flex-col gap-2 px-5">
        {toasts.map((toast) => {
          const config = toneConfig[toast.tone];
          const Icon = config.Icon;
          return (
            <div
              key={toast.id}
              className={`flex items-center gap-2.5 rounded-[20px] border px-4 py-3.5 text-sm font-medium shadow-float backdrop-blur-sm animate-in slide-in-from-bottom-2 ${config.className}`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <span className="leading-5">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
