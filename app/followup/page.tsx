"use client";

import { useEffect, useMemo, useState } from "react";
import { BackHeader } from "@/components/BackHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { contacts } from "@/data/contacts";
import { getNextFollowupLabel } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ProfileRow } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

const nurseName = contacts.find((contact) => contact.id === "wang-nurse")?.name ?? "王护士";

const followupOptions = [
  "我可以按时参加",
  "我需要改一个时间",
  "这周不方便，请联系家属",
];

type FollowupSummary = {
  followupConfirmed: boolean;
  followupResponse: string | null;
  followupConfirmedAt: string | null;
};

export default function FollowupPage() {
  const [selected, setSelected] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [remoteSummary, setRemoteSummary] = useState<FollowupSummary | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { state, confirmFollowup, markNotificationsRead } = useClawState();
  const { showToast } = useToast();
  const { currentUser } = useDemoUser();
  const displayName = profile?.display_name ?? currentUser?.name ?? "当前居民";
  const isRemoteMode = Boolean(profile);

  useEffect(() => {
    let active = true;

    async function bootstrapProfile() {
      if (!supabase) {
        return;
      }

      try {
        const currentProfile = await fetchCurrentProfile(supabase);
        if (!active || !currentProfile) {
          return;
        }

        setProfile(currentProfile);

        const summaryResponse = await fetch("/api/home/summary", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await summaryResponse.json().catch(() => ({}))) as {
          summary?: FollowupSummary | null;
        };

        if (active && summaryResponse.ok) {
          setRemoteSummary(payload.summary ?? null);
        }
      } catch {
        // Demo/local mode continues.
      }
    }

    void bootstrapProfile();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!isRemoteMode) {
      markNotificationsRead(["notification-followup"]);
    }
  }, [isRemoteMode, markNotificationsRead]);

  const previewMessages = useMemo(
    () => [
      {
        id: "followup-nurse-1",
        author: nurseName,
        role: "nurse" as const,
        content: `${displayName}您好，${getNextFollowupLabel()}安排了慢病随访，请您确认一下是否方便参加。`,
        context: "direct" as const,
        threadId: "followup",
        createdAt: "2026-04-27T09:10:00.000Z",
      },
      {
        id: "followup-nurse-2",
        author: nurseName,
        role: "nurse" as const,
        content: "如果时间不方便，也可以直接告诉我，我帮您调整。",
        context: "direct" as const,
        threadId: "followup",
        createdAt: "2026-04-27T09:12:00.000Z",
      },
    ],
    [displayName],
  );

  const followupReplyMessage = isRemoteMode
    ? remoteSummary?.followupConfirmed && remoteSummary.followupResponse
      ? {
          id: "followup-user-reply-remote",
          author: displayName,
          role: "user" as const,
          content: remoteSummary.followupResponse,
          context: "direct" as const,
          threadId: "followup",
          createdAt: remoteSummary.followupConfirmedAt ?? "2026-04-27T09:30:00.000Z",
        }
      : null
    : state.followupConfirmed && state.followupResponse
      ? {
          id: "followup-user-reply",
          author: displayName,
          role: "user" as const,
          content: state.followupResponse,
          context: "direct" as const,
          threadId: "followup",
          createdAt: state.followupLastConfirmedAt ?? "2026-04-27T09:30:00.000Z",
        }
      : null;

  function submitFollowup() {
    if (!selected) {
      showToast("先选择一个回复选项。", "warning");
      return;
    }

    setIsSubmitting(true);

    void (async () => {
      try {
        if (isRemoteMode) {
          const response = await fetch("/api/followup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ response: selected }),
          });

          if (!response.ok) {
            throw new Error("followup_submit_failed");
          }

          setRemoteSummary({
            followupConfirmed: true,
            followupResponse: selected,
            followupConfirmedAt: new Date().toISOString(),
          });
          setShowSuccess(true);
          window.setTimeout(() => setShowSuccess(false), 1200);
          showToast("随访确认已提交给家医团队。", "success");
          return;
        }

        const changed = confirmFollowup(selected);
        setShowSuccess(true);
        window.setTimeout(() => setShowSuccess(false), 1200);
        showToast(changed ? "随访确认成功，积分已增加。" : "已更新您的随访回复。", "success");
      } catch {
        showToast("随访回复暂时提交失败，请稍后再试。", "warning");
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-10">
        <BackHeader title="随访确认" subtitle="请回复家医团队，帮助他们安排本周随访。" />

        <section className="space-y-3">
          {previewMessages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {followupReplyMessage ? <ChatBubble message={followupReplyMessage} /> : null}
        </section>

        <SectionCard title="随访详情">
          <div className="rounded-[24px] bg-surface-card p-4">
            <p className="text-sm font-semibold text-navy">时间：{getNextFollowupLabel()}</p>
            <p className="mt-2 text-sm text-navy/65">地点：社区卫生服务中心三楼慢病随访室</p>
            <p className="mt-2 text-sm text-navy/65">
              内容：血压记录查看、近期用药确认、下一阶段管理提醒。
            </p>
          </div>
        </SectionCard>

        <SectionCard title="请选择您的回复">
          {followupReplyMessage ? (
            <div className="mb-4 rounded-[22px] border border-[#BFD9CB] bg-[#EAF4EE] px-4 py-4 text-sm leading-6 text-[#355C52]">
              已回复：{followupReplyMessage.content}
            </div>
          ) : null}

          <div className="space-y-3">
            {followupOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSelected(option)}
                className={`flex w-full items-center justify-between rounded-[24px] border px-4 py-4 text-left transition active:scale-[0.98] ${
                  selected === option
                    ? "border-navy bg-[#EEF3F8] text-navy shadow-soft"
                    : "border-line bg-surface-card text-navy/75"
                }`}
              >
                <span className="text-sm font-semibold">{option}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
                    selected === option ? "border-navy bg-navy" : "border-line/80 bg-transparent"
                  }`}
                >
                  {selected === option ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={submitFollowup}
            disabled={isSubmitting}
            className={`mt-4 w-full rounded-full px-4 py-3.5 text-sm font-semibold text-white shadow-soft active:scale-[0.98] ${
              isSubmitting ? "bg-navy/45" : "bg-navy"
            }`}
          >
            {isSubmitting ? "正在提交..." : "确认回复"}
          </button>
        </SectionCard>

        {showSuccess ? (
          <div className="animate-task-complete rounded-[28px] border border-[#BFD9CB] bg-[#EAF4EE] px-4 py-5 text-center shadow-soft">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success text-lg font-semibold text-white">
              OK
            </div>
            <p className="mt-3 text-base font-semibold text-success">随访确认已发送</p>
            <p className="mt-2 text-sm text-[#355C52]">
              家医团队已经收到您的回复，后续会按安排继续跟进。
            </p>
          </div>
        ) : null}
      </div>
    </PhoneShell>
  );
}
