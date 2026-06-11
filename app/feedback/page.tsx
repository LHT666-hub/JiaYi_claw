"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { appendFeedback } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { useDemoUser } from "@/lib/useDemoUser";
import { ProfileRow } from "@/lib/types";

type FeedbackForm = {
  mostUseful: string;
  unclearPart: string;
  elderFriendly: string;
  wantedFeatures: string;
  recommend: string;
  otherSuggestion: string;
};

type AuthMode = "loading" | "real" | "demo" | "none";

const initialForm: FeedbackForm = {
  mostUseful: "",
  unclearPart: "",
  elderFriendly: "",
  wantedFeatures: "",
  recommend: "愿意推荐",
  otherSuggestion: "",
};

export default function FeedbackPage() {
  const { currentUser, isReady } = useDemoUser();
  const { showToast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [form, setForm] = useState(initialForm);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (supabase) {
        try {
          const currentProfile = await fetchCurrentProfile(supabase);

          if (!active) {
            return;
          }

          if (currentProfile) {
            setProfile(currentProfile);
            setAuthMode("real");
            return;
          }
        } catch {
          // Fall through to demo/none mode.
        }
      }

      if (!active || !isReady) {
        return;
      }

      setProfile(null);
      setAuthMode(currentUser ? "demo" : "none");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [currentUser, isReady, supabase]);

  const identity = useMemo(() => {
    if (authMode === "real" && profile) {
      return `${profile.display_name} / ${profile.role}`;
    }

    if (authMode === "demo" && currentUser) {
      return `${currentUser.name} / ${currentUser.roleLabel}`;
    }

    return "未登录体验";
  }, [authMode, currentUser, profile]);

  const helperText = useMemo(() => {
    if (authMode === "real") {
      return "提交后会同步到管理员工作台，方便团队继续优化。";
    }

    if (authMode === "demo") {
      return "当前为演示身份，反馈会先保存在这台设备上，方便本地体验和回看。";
    }

    if (authMode === "loading") {
      return "正在确认当前账号状态。";
    }

    return "当前未登录，反馈会先保存在这台设备上。";
  }, [authMode]);

  function updateField<K extends keyof FeedbackForm>(key: K, value: FeedbackForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || authMode === "loading") {
      return;
    }

    const payload = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      identity,
      mostUseful: form.mostUseful.trim(),
      unclearPart: form.unclearPart.trim(),
      elderFriendly: form.elderFriendly.trim(),
      wantedFeatures: form.wantedFeatures.trim(),
      recommend: form.recommend,
      otherSuggestion: form.otherSuggestion.trim(),
      createdAt: new Date().toISOString(),
    };

    setIsSubmitting(true);

    try {
      if (authMode === "real") {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("remote_feedback_submit_failed");
        }

        setForm(initialForm);
        showToast("反馈已提交给管理员，感谢您的建议。", "success");
        return;
      }

      appendFeedback(payload);
      setForm(initialForm);

      showToast(
        authMode === "demo"
          ? "反馈已保存在当前设备，方便继续演示和回看。"
          : "反馈已保存在当前设备，登录后可再同步到管理员。",
        "success",
      );
    } catch {
      if (authMode === "real") {
        showToast("反馈暂时还没同步成功，请稍后再试。", "warning");
        return;
      }

      appendFeedback(payload);
      setForm(initialForm);
      showToast("反馈已保存在当前设备。", "success");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="体验反馈" subtitle="告诉我们哪里好用、哪里不清楚，方便继续把 Claw 做得更顺手。" />

        <SectionCard title="当前体验身份">
          <div className="space-y-2 rounded-[24px] bg-surface-card px-4 py-4 text-sm text-navy">
            <p className="font-semibold">{identity}</p>
            <p className="leading-6 text-navy/60">{helperText}</p>
          </div>
        </SectionCard>

        <SectionCard title="填写反馈">
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">你觉得最有用的功能是什么？</span>
              <textarea
                value={form.mostUseful}
                onChange={(event) => updateField("mostUseful", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-surface-card px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如：问 Claw、任务提醒、家医跟进、群聊互动。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">哪里还不够清楚？</span>
              <textarea
                value={form.unclearPart}
                onChange={(event) => updateField("unclearPart", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-surface-card px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="可以直接说某一步、某个页面，或某句提示不容易理解。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">老人用起来顺手吗？</span>
              <textarea
                value={form.elderFriendly}
                onChange={(event) => updateField("elderFriendly", event.target.value)}
                className="min-h-20 w-full rounded-[18px] border border-line bg-surface-card px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如按钮大小、文字清晰度、步骤是不是太绕。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">还希望增加什么功能？</span>
              <textarea
                value={form.wantedFeatures}
                onChange={(event) => updateField("wantedFeatures", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-surface-card px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如语音播报、更清楚的流程说明、亲友代办、用药提醒。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">你愿意推荐给家人吗？</span>
              <select
                value={form.recommend}
                onChange={(event) => updateField("recommend", event.target.value)}
                className="h-12 w-full rounded-[18px] border border-line bg-surface-card px-4 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
              >
                <option value="愿意推荐">愿意推荐</option>
                <option value="看改进情况">看改进情况</option>
                <option value="暂不推荐">暂不推荐</option>
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">其他建议</span>
              <textarea
                value={form.otherSuggestion}
                onChange={(event) => updateField("otherSuggestion", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-surface-card px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="任何你希望我们知道的体验建议，都可以写在这里。"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || authMode === "loading"}
              className="w-full rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
            >
              {isSubmitting ? "正在提交..." : "提交反馈"}
            </button>
          </form>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
