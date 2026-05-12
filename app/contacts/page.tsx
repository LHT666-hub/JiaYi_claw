"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse, Stethoscope, UserRoundPlus, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { contacts as localContacts } from "@/data/contacts";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";
import { readMatchedLeader, STORAGE_CHANGE_EVENT } from "@/lib/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, resolveResidentScope } from "@/lib/supabase/mvp";
import { ContactItem, MatchedLeaderRecord } from "@/lib/types";

const groupConfig = [
  {
    key: "doctorTeam" as const,
    title: "我的家医团队",
    icon: Stethoscope,
    description: "适合处理报告解释、随访安排、转诊判断、配药规则、用药说明",
  },
  {
    key: "family" as const,
    title: "我的家人",
    icon: HeartPulse,
    description: "适合协助操作手机、联系医生、紧急联系",
  },
  {
    key: "community" as const,
    title: "社区支持",
    icon: Users,
    description: "适合体检通知、登记协助、活动提醒、群内互助、打卡提醒",
  },
];

export default function ContactsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<ContactItem[]>(localContacts);
  const [matchedLeader, setMatchedLeader] = useState<MatchedLeaderRecord | null>(null);

  useEffect(() => {
    function refresh() {
      setMatchedLeader(readMatchedLeader());
    }
    refresh();
    window.addEventListener(STORAGE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      if (!supabase) {
        return;
      }

      const profile = await fetchCurrentProfile(supabase);

      if (!active || !profile) {
        return;
      }

      const residentScope = await resolveResidentScope(supabase, profile);

      if (!active || !residentScope.residentId) {
        return;
      }

      const remoteContacts = await getContactsForResident(residentScope.residentId, supabase);

      if (!active || !remoteContacts.length) {
        return;
      }

      setItems(remoteContacts.map(mapContactRowToContactItem));
    }

    void loadContacts();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader
          title="我的支持网络"
          subtitle="不知道找谁？从这里找到合适的人"
        />

        <div className="rounded-[22px] bg-[#FAEEDB] px-4 py-3">
          <p className="text-sm leading-6 text-navy/70">
            下面是围绕您建立的支持网络。遇到问题时，可以根据说明选择合适的联系人。
          </p>
        </div>

        {groupConfig.map((group) => {
          const Icon = group.icon;
          const groupContacts = items.filter((contact) => contact.group === group.key);
          if (!groupContacts.length) return null;

          return (
            <SectionCard
              key={group.key}
              title={group.title}
              action={<Icon className="h-4 w-4 text-sage" />}
            >
              <p className="mb-3 text-xs leading-5 text-navy/55">{group.description}</p>
              <div className="space-y-3">
                {groupContacts.map((contact) => (
                  <ContactNetworkCard key={contact.id} contact={contact} />
                ))}
                {group.key === "community" && matchedLeader && (
                  <div className="rounded-[22px] border border-sage/30 bg-[#EEF5F3] p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/20 text-sm font-semibold text-sage">
                        {matchedLeader.leaderName.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-navy">
                          {matchedLeader.leaderName}
                          <span className="ml-2 text-[11px] font-medium text-sage">我的小组长</span>
                        </p>
                        <p className="mt-0.5 text-xs text-navy/55">匹配度 {matchedLeader.matchPercent}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          );
        })}

        <SectionCard
          title="小组长匹配"
          action={<UserRoundPlus className="h-4 w-4 text-sage" />}
        >
          <p className="mb-3 text-xs leading-5 text-navy/55">
            {matchedLeader
              ? `当前小组长：${matchedLeader.leaderName}（匹配度 ${matchedLeader.matchPercent}%）`
              : "还没有匹配小组长？试试智能匹配，找到最适合您的社区健康小组长。"}
          </p>
          <a
            href="/match-leader"
            className="inline-flex items-center gap-1.5 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white active:scale-95"
          >
            <UserRoundPlus className="h-4 w-4" />
            {matchedLeader ? "重新匹配小组长" : "帮我匹配小组长"}
          </a>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}

function ContactNetworkCard({ contact }: { contact: ContactItem }) {
  return (
    <a
      href={`/contacts/${contact.id}`}
      className="flex items-center gap-3 rounded-[22px] border border-line/60 bg-white/40 p-3 transition hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
        {contact.avatarPath ? (
          <img
            src={contact.avatarPath}
            alt={contact.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
            style={{ backgroundColor: contact.avatarColor }}
          >
            {contact.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-semibold text-navy">{contact.name}</p>
          <span className="rounded-full bg-[#F3E4CD] px-2 py-0.5 text-[11px] font-medium text-navy/65">
            {contact.role}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-navy/58 line-clamp-2">
          {contact.description}
        </p>
        {contact.availableTime ? (
          <p className="mt-1 text-[11px] text-sage">{contact.availableTime}</p>
        ) : null}
      </div>
    </a>
  );
}
