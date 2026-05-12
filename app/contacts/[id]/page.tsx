"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { MessageCircle, Phone, UserRoundPlus, WandSparkles } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { contacts } from "@/data/contacts";
import { useClawState } from "@/lib/useClawState";
import { useDemoUser } from "@/lib/useDemoUser";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { requestContact } = useClawState();
  const { currentUser } = useDemoUser();
  const contact = contacts.find((item) => item.id === params.id);
  const displayName = currentUser?.name ?? "当前用户";

  if (!contact) {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="联系人未找到" subtitle="请返回上一页重新选择联系人" />
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title={contact.name} subtitle={contact.role} />

        <SectionCard>
          <div className="flex flex-col items-center text-center">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
              {contact.avatarPath ? (
                <Image
                  src={contact.avatarPath}
                  alt={contact.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
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
            <p className="mt-3 text-xs tracking-[0.14em] text-navy/48">
              {contact.availableTime ?? "按社区安排提供支持"}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="联系操作">
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => showToast("原型演示：这里将跳转到电话拨打", "info")}
              className="flex h-14 items-center gap-3 rounded-[22px] bg-navy px-5 text-left text-white active:scale-[0.98]"
            >
              <Phone className="h-5 w-5 shrink-0" />
              <span className="text-[15px] font-semibold">打电话</span>
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
              onClick={() => {
                requestContact(contact.id);
                showToast("已发送提醒，对方会尽快联系您", "success");
              }}
              className="flex h-14 items-center gap-3 rounded-[22px] border border-line bg-cream px-5 text-left text-navy active:scale-[0.98]"
            >
              <UserRoundPlus className="h-5 w-5 shrink-0" />
              <span className="text-[15px] font-semibold">请他联系我</span>
            </button>
          </div>
        </SectionCard>

        {/* Claw Explain Card */}
        <SectionCard title="让 Claw 帮忙">
          <div className="rounded-[22px] border border-sage/20 bg-[#EEF5F3] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sage/20 text-sage">
                <WandSparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">让 Claw 帮我说明情况</p>
                <p className="mt-1.5 text-xs leading-5 text-navy/60">
                  Claw 会整理您最近的问题和需求，生成一段简要说明发给{contact.name}，
                  方便对方了解情况后主动联系您。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                showToast(
                  `已整理说明发给${contact.name}：${displayName}想咨询配药和体检报告问题`,
                  "success",
                )
              }
              className="mt-4 w-full rounded-full bg-navy py-3 text-sm font-semibold text-white active:scale-[0.98]"
            >
              生成并发送说明
            </button>
          </div>

          <div className="mt-3 rounded-[22px] border border-line/50 bg-[#FFF8ED] p-4">
            <p className="text-xs leading-5 text-navy/55">
              说明内容由 Claw 根据您近期的提问自动整理，不会包含敏感医疗信息。
              {contact.role === "家庭医生" || contact.role === "团队护士" || contact.role === "临床药师"
                ? "家医团队成员可在工作台查看完整记录。"
                : "对方只会收到简要说明。"}
            </p>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
