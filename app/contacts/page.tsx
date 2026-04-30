"use client";

import { useEffect, useMemo, useState } from "react";
import { BackHeader } from "@/components/BackHeader";
import { ContactAvatar } from "@/components/ContactAvatar";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import { contacts as localContacts } from "@/data/contacts";
import { getContactsForResident, mapContactRowToContactItem } from "@/lib/db/contacts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, resolveResidentScope } from "@/lib/supabase/mvp";
import { ContactItem } from "@/lib/types";

const groupedContacts = [
  { key: "doctorTeam", title: "我的家医团队" },
  { key: "family", title: "我的家人" },
  { key: "community", title: "我的社区支持" },
] as const;

export default function ContactsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<ContactItem[]>(localContacts);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);

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
      setIsSupabaseMode(true);
    }

    void loadContacts();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="一键找人" subtitle="不用翻通讯录，点头像就能联系" />

        {groupedContacts.map((group) => (
          <SectionCard key={group.key} title={group.title}>
            <div className="grid grid-cols-3 gap-y-5">
              {items
                .filter((contact) => contact.group === group.key)
                .map((contact) => (
                  <ContactAvatar key={contact.id} contact={contact} />
                ))}
            </div>
          </SectionCard>
        ))}

        <p className="px-1 text-xs text-navy/52">
          {isSupabaseMode
            ? "当前联系人优先从 Supabase 读取。"
            : "当前为本地演示联系人，Supabase 未配置时会自动回退。"}
        </p>
      </div>
    </PhoneShell>
  );
}
