"use client";

import { FormEvent, useMemo, useState } from "react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { appendFeedback } from "@/lib/storage";
import { useDemoUser } from "@/lib/useDemoUser";

type FeedbackForm = {
  mostUseful: string;
  unclearPart: string;
  elderFriendly: string;
  wantedFeatures: string;
  recommend: string;
  otherSuggestion: string;
};

const initialForm: FeedbackForm = {
  mostUseful: "",
  unclearPart: "",
  elderFriendly: "",
  wantedFeatures: "",
  recommend: "愿意推荐",
  otherSuggestion: "",
};

export default function FeedbackPage() {
  const { currentUser } = useDemoUser();
  const { showToast } = useToast();
  const [form, setForm] = useState(initialForm);

  const identity = useMemo(() => currentUser?.roleLabel ?? "未登录体验", [currentUser]);

  function updateField<K extends keyof FeedbackForm>(key: K, value: FeedbackForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    appendFeedback({
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      identity,
      mostUseful: form.mostUseful.trim(),
      unclearPart: form.unclearPart.trim(),
      elderFriendly: form.elderFriendly.trim(),
      wantedFeatures: form.wantedFeatures.trim(),
      recommend: form.recommend,
      otherSuggestion: form.otherSuggestion.trim(),
      createdAt: new Date().toISOString(),
    });

    setForm(initialForm);
    showToast("反馈已提交，感谢您的体验建议。", "success");
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="体验反馈" subtitle="帮助我们把家医 Claw 做得更清楚、更好用。" />

        <SectionCard title="当前体验身份">
          <div className="rounded-[24px] bg-[#FFF8ED] px-4 py-4 text-sm text-navy">
            {identity}
          </div>
        </SectionCard>

        <SectionCard title="填写反馈">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">你觉得最有用的功能是什么？</span>
              <textarea
                value={form.mostUseful}
                onChange={(event) => updateField("mostUseful", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如：问 Claw、任务提醒、医生待办转入。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">哪个地方不好懂？</span>
              <textarea
                value={form.unclearPart}
                onChange={(event) => updateField("unclearPart", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="告诉我们哪一步、哪一页、哪个词不容易理解。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">你觉得老人容易使用吗？</span>
              <textarea
                value={form.elderFriendly}
                onChange={(event) => updateField("elderFriendly", event.target.value)}
                className="min-h-20 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如：按钮够不够大，文字够不够清楚。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">还希望增加什么功能？</span>
              <textarea
                value={form.wantedFeatures}
                onChange={(event) => updateField("wantedFeatures", event.target.value)}
                className="min-h-24 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="比如：语音播报、更清楚的流程说明、亲友代办等。"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-navy">是否愿意推荐给家人？</span>
              <select
                value={form.recommend}
                onChange={(event) => updateField("recommend", event.target.value)}
                className="h-12 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
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
                className="min-h-24 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-sm text-navy outline-none transition focus:border-sage focus:ring-1 focus:ring-sage/30"
                placeholder="任何你希望我们知道的体验建议都可以写在这里。"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-soft active:scale-[0.98]"
            >
              提交反馈
            </button>
          </form>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
