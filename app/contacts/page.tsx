"use client";

import { BackHeader } from "@/components/BackHeader";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { contacts } from "@/data/contacts";

const groupedContacts = [
  { key: "doctorTeam", title: "我的家医团队" },
  { key: "family", title: "我的家人" },
  { key: "community", title: "我的社区支持" },
] as const;

export default function ContactsPage() {
  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="一键找人" subtitle="不用翻通讯录，点头像就能联系" />

        {groupedContacts.map((group) => (
          <SectionCard key={group.key} title={group.title}>
            <div className="grid grid-cols-3 gap-y-5">
              {contacts
                .filter((contact) => contact.group === group.key)
                .map((contact) => (
                  <ContactAvatar key={contact.id} contact={contact} />
                ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </PhoneShell>
  );
}
