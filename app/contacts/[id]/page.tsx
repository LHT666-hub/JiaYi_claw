"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageCircle, Phone, UserRoundPlus, WandSparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { contacts } from "@/data/contacts";
import { generateClawSummary } from "@/lib/clawSummary";
import { readAskLogs } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { ContactItem } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { showToast } = useToast();
  const { requestContact } = useClawState();
  const { currentUser } = useDemoUser();
  const [contact, setContact] = useState<ContactItem | null>(() =>
    contacts.find((item) => item.id === params.id) ?? null,
  );
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [accountDisplayName, setAccountDisplayName] = useState<string | null>(null);
  const [clawSummaryText, setClawSummaryText] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const displayName = accountDisplayName ?? currentUser?.name ?? "当前用户";

  useEffect(() => {
    let active = true;

    async function loadContact() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const profile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (!profile) {
          setLoading(false);
          return;
        }

        setIsRemoteMode(true);
        setAccountDisplayName(profile.display_name);

        const response = await fetch(`/api/contacts/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          contact?: ContactItem | null;
        };

        if (!active) {
          return;
        }

        if (response.ok) {
          setContact(payload.contact ?? null);
          setRemoteError(null);
        } else {
          setContact(null);
          setRemoteError("当前账号暂时还没同步到这个联系人，请稍后刷新再试。");
        }
      } catch {
        if (active) {
          setContact(null);
          setRemoteError("联系人详情暂时还没同步成功，请稍后刷新再试。");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadContact();

    return () => {
      active = false;
    };
  }, [params.id, supabase]);

  async function sendContactRequest(summary?: string) {
    if (!contact) {
      return false;
    }

    if (!isRemoteMode) {
      requestContact(contact.id);
      return true;
    }

    setRequesting(true);

    try {
      const response = await fetch(`/api/contacts/${contact.id}/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(summary ? { summary } : {}),
      });

      if (!response.ok) {
        setRemoteError("联系请求暂时没有同步成功，请稍后再试。");
      } else {
        setRemoteError(null);
      }

      return response.ok;
    } catch {
      setRemoteError("联系请求暂时没有同步成功，请稍后再试。");
      return false;
    } finally {
      setRequesting(false);
    }
  }

  if (loading) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="联系人详情" subtitle="正在读取联系人信息..." />
        </div>
      </PhoneShell>
    );
  }

  if (!contact) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="联系人未找到" subtitle="请返回上一页重新选择联系人。" />
          {remoteError ? (
            <SectionCard>
              <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
                <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
                <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
              </div>
            </SectionCard>
          ) : null}
          <SectionCard>
            <EmptyState
              title="当前没有这个联系人"
              description={
                isRemoteMode
                  ? "这个联系人不在当前账号可访问的联系人列表里。"
                  : "请返回上一页重新选择联系人。"
              }
            />
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title={contact.name} subtitle={contact.role} />

        {remoteError ? (
          <SectionCard>
            <div className="rounded-[22px] border border-amber/25 bg-[#FFF6EA] px-4 py-4">
              <p className="text-sm font-semibold text-navy">数据同步稍有延迟</p>
              <p className="mt-1 text-sm leading-6 text-navy/66">{remoteError}</p>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard>
          <div className="flex flex-col items-center text-center">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/60 bg-surface-avatar shadow-soft">
              {contact.avatarPath ? (
                <Image src={contact.avatarPath} alt={contact.name} fill sizes="96px" className="object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white"
                  style={{ backgroundColor: contact.avatarColor }}
                >
                  {contact.name.slice(0, 1)}
                </div>
              )}
            </div>
            <h2 className="mt-4 text-[1.6rem] font-semibold text-navy">{contact.name}</h2>
            <p className="mt-1 text-sm text-sage">{contact.role}</p>
            <p className="mt-4 text-sm leading-6 text-navy/68">{contact.description}</p>
            {contact.phone ? (
              <p className="mt-3 text-sm font-semibold text-navy/72">{contact.phone}</p>
            ) : null}
            <p className="mt-2 text-xs tracking-[0.14em] text-navy/48">
              {contact.availableTime ?? "按社区安排提供支持"}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="联系操作">
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => {
                if (contact.phone) {
                  window.location.href = `tel:${contact.phone.replace(/[-\s]/g, "")}`;
                } else {
                  showToast("该联系人暂时没有电话号码。", "info");
                }
              }}
              className="flex h-14 items-center gap-3 rounded-[22px] bg-navy px-5 text-left text-white active:scale-[0.98]"
            >
              <Phone className="h-5 w-5 shrink-0" />
              <span className="text-[15px] font-semibold">打电话</span>
              {contact.phone ? (
                <span className="ml-auto text-sm text-white/60">{contact.phone}</span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/contacts/${contact.id}/message`)}
              className="flex h-14 items-center gap-3 rounded-[22px] border border-line bg-cream px-5 text-left text-navy active:scale-[0.98]"
            >
              <MessageCircle className="h-5 w-5 shrink-0" />
              <span className="text-[15px] font-semibold">发消息</span>
            </button>

            <button
              type="button"
              disabled={requesting}
              onClick={async () => {
                const ok = await sendContactRequest();

                if (ok) {
                  showToast("已发送联系请求，对方会尽快跟进。", "success");
                } else {
                  showToast("联系请求暂时发送失败，请稍后再试。", "warning");
                }
              }}
              className="flex h-14 items-center gap-3 rounded-[22px] border border-line bg-cream px-5 text-left text-navy active:scale-[0.98] disabled:opacity-50"
            >
              <UserRoundPlus className="h-5 w-5 shrink-0" />
              <span className="text-[15px] font-semibold">请他联系我</span>
            </button>
          </div>
        </SectionCard>

        <SectionCard title="让 Claw 帮忙">
          <div className="rounded-[22px] border border-sage/20 bg-health-soft p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sage/20 text-sage">
                <WandSparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">让 Claw 帮我说明情况</p>
                <p className="mt-1.5 text-xs leading-5 text-navy/60">
                  Claw 会整理您最近的问题和需求，生成一段简要说明发给 {contact.name}，
                  方便对方先了解情况后主动联系您。
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={requesting}
              onClick={async () => {
                const logs = readAskLogs();

                if (!logs.length) {
                  showToast("暂时没有最近提问记录，请先去问 Claw。", "warning");
                  return;
                }

                const latest = logs[logs.length - 1];
                const summary = generateClawSummary(latest.question, {
                  answer: latest.answer,
                  nextStep: "",
                  suggestDoctor: latest.suggestDoctor,
                  riskLevel: latest.riskLevel,
                });
                const content =
                  `${displayName} 最近咨询了“${latest.question}”。` +
                  `${summary.whySuggestDoctor} 建议${summary.recommendedRole.displayLabel}跟进。`;

                setClawSummaryText(content);

                const ok = await sendContactRequest(content);

                if (ok) {
                  showToast(`已整理说明并发给 ${contact.name}。`, "success");
                } else {
                  showToast("说明已经生成，但暂时还没发出去，请稍后再试。", "warning");
                }
              }}
              className="mt-4 w-full rounded-full bg-navy py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              生成并发送说明
            </button>
          </div>

          {clawSummaryText ? (
            <div className="mt-3 rounded-[22px] border border-sage/25 bg-health-soft p-4">
              <p className="text-xs font-semibold text-sage">已生成的说明内容</p>
              <p className="mt-2 text-sm leading-6 text-navy/72">{clawSummaryText}</p>
            </div>
          ) : null}

          <div className="mt-3 rounded-[22px] border border-line/50 bg-surface-card p-4">
            <p className="text-xs leading-5 text-navy/55">
              说明内容由 Claw 根据您近期的提问自动整理，不会包含敏感医疗信息。
              {isRemoteMode
                ? "这段说明会作为联系请求同步给对方，方便对方先了解您的情况。"
                : "这段说明会先保留在当前设备里，方便继续体验联系流程。"}
            </p>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
