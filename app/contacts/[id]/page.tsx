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

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { requestContact } = useClawState();
  const contact = contacts.find((item) => item.id === params.id);

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
              className="flex items-center gap-3 rounded-[24px] bg-navy px-4 py-4 text-left text-white"
            >
              <Phone className="h-5 w-5" />
              打电话
            </button>
            <button
              type="button"
              onClick={() => router.push(`/contacts/${contact.id}/message`)}
              className="flex items-center gap-3 rounded-[24px] border border-line bg-cream px-4 py-4 text-left text-navy"
            >
              <MessageCircle className="h-5 w-5" />
              发消息
            </button>
            <button
              type="button"
              onClick={() => {
                requestContact(contact.id);
                showToast("已模拟发送提醒", "success");
              }}
              className="flex items-center gap-3 rounded-[24px] border border-line bg-cream px-4 py-4 text-left text-navy"
            >
              <UserRoundPlus className="h-5 w-5" />
              请他联系我
            </button>
            <button
              type="button"
              onClick={() =>
                showToast(
                  `Claw 已整理：张阿姨想咨询配药和体检报告问题，建议${contact.role}后续联系。`,
                  "success",
                )
              }
              className="flex items-center gap-3 rounded-[24px] border border-line bg-cream px-4 py-4 text-left text-navy"
            >
              <WandSparkles className="h-5 w-5" />
              让 Claw 帮我说明情况
            </button>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
