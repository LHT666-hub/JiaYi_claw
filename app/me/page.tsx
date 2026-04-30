"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Settings, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { SectionCard } from "@/components/SectionCard";
import { useToast } from "@/components/ToastProvider";
import { contacts as localContacts } from "@/data/contacts";
import { tasks as localTasks } from "@/data/tasks";
import { useClawState } from "@/lib/useClawState";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchCurrentProfile,
  fetchPointsLedger,
  fetchResidentContacts,
  fetchResidentProfile,
  getRoleLabel,
  getPostLoginPath,
  isWorkbenchRole,
  resolveResidentScope,
  sumPoints,
} from "@/lib/supabase/mvp";
import { AppRole, ContactRow, ProfileRow, ResidentProfileRow } from "@/lib/types";

function ContactCard({ contact }: { contact: ContactRow | { name: string; role_label: string; avatar_url?: string | null } }) {
  return (
    <div className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
          {"avatar_url" in contact && contact.avatar_url ? (
            <Image
              src={contact.avatar_url}
              alt={contact.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-navy">{contact.name}</p>
          <p className="mt-1 text-xs text-navy/56">{contact.role_label}</p>
        </div>
      </div>
      <Users className="h-4 w-4 text-sage" />
    </div>
  );
}

export default function MePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { state } = useClawState();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [residentProfile, setResidentProfile] = useState<ResidentProfileRow | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [points, setPoints] = useState(state.points);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [linkedResidentName, setLinkedResidentName] = useState<string | null>(null);
  const [isSupabaseMode, setIsSupabaseMode] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!supabase) {
        return;
      }

      const currentProfile = await fetchCurrentProfile(supabase);

      if (!active || !currentProfile) {
        return;
      }

      setProfile(currentProfile);
      setRole(currentProfile.role);
      setIsSupabaseMode(true);

      const residentScope = await resolveResidentScope(supabase, currentProfile);

      if (!active) {
        return;
      }

      setLinkedResidentName(residentScope.residentName ?? null);

      if (residentScope.residentId) {
        const [residentRow, ledger, remoteContacts] = await Promise.all([
          fetchResidentProfile(supabase, residentScope.residentId),
          fetchPointsLedger(supabase, residentScope.residentId),
          fetchResidentContacts(supabase, residentScope.residentId),
        ]);

        if (!active) {
          return;
        }

        setResidentProfile(residentRow);
        setPoints(sumPoints(ledger));
        setContacts(remoteContacts);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [state.points, supabase]);

  const completedTasks = localTasks
    .filter((task) => state.completedTaskIds.includes(task.id))
    .slice(0, 5);

  const doctorTeam =
    contacts.length > 0
      ? contacts.filter((contact) => contact.group_type === "doctorTeam")
      : localContacts
          .filter((contact) => contact.group === "doctorTeam")
          .map((contact) => ({
            id: contact.id,
            resident_id: "",
            contact_user_id: null,
            name: contact.name,
            role_label: contact.role,
            group_type: "doctorTeam" as const,
            description: contact.description,
            available_time: contact.availableTime ?? null,
            avatar_url: contact.avatarPath ?? null,
          }));

  const familyMembers =
    contacts.length > 0
      ? contacts.filter((contact) => contact.group_type === "family")
      : localContacts
          .filter((contact) => contact.group === "family")
          .map((contact) => ({
            id: contact.id,
            resident_id: "",
            contact_user_id: null,
            name: contact.name,
            role_label: contact.role,
            group_type: "family" as const,
            description: contact.description,
            available_time: contact.availableTime ?? null,
            avatar_url: contact.avatarPath ?? null,
          }));

  async function handleSignOut() {
    if (!supabase) {
      showToast("当前是本地演示模式，没有真实登录会话。", "info");
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="我的" />

        <SectionCard>
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-line bg-cream text-3xl font-semibold text-navy shadow-soft">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <span>{profile?.display_name?.slice(0, 1) ?? "张"}</span>
              )}
            </div>
            <div>
              <h2 className="text-[1.5rem] font-semibold text-navy">
                {profile?.display_name ?? "张阿姨"}
              </h2>
              <p className="mt-1 text-sm text-navy/62">
                {role ? getRoleLabel(role) : "居民"}
                {residentProfile?.age ? `｜${residentProfile.age} 岁` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(residentProfile?.chronic_tags?.length
                  ? residentProfile.chronic_tags
                  : ["高血压", "糖尿病"]
                ).map((tag, index) => (
                  <span
                    key={tag}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      index === 0
                        ? "bg-[#EAF1EF] text-sage"
                        : "bg-[#FFF0DF] text-amber"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="我的积分" action={<PointsBadge points={points} />}>
          <p className="text-sm leading-6 text-navy/68">
            {isSupabaseMode
              ? "当前积分已从 Supabase 的 points_ledger 汇总。"
              : "当前仍是本地演示积分，后续接入 Supabase 后会自动同步。"}
          </p>
        </SectionCard>

        {role === "family" && linkedResidentName ? (
          <SectionCard title="当前绑定居民">
            <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
              <p className="text-base font-semibold text-navy">{linkedResidentName}</p>
              <p className="mt-2 text-sm leading-6 text-navy/66">
                家属端当前可以查看这位居民的联系人、积分和部分任务状态。
              </p>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="我的家医团队">
          <div className="space-y-3">
            {doctorTeam.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="我的家人联系人">
          <div className="space-y-3">
            {familyMembers.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="我的健康小组">
          <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
            <p className="text-base font-semibold text-navy">高血压互助小组</p>
            <p className="mt-2 text-sm leading-6 text-navy/66">
              组长：王阿姨，今日 12 人已打卡
            </p>
          </div>
        </SectionCard>

        <SectionCard title="我的打卡记录">
          <div className="space-y-3">
            {completedTasks.length ? (
              completedTasks.map((task) => (
                <div key={task.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3">
                  <p className="text-sm font-semibold text-navy">{task.title}</p>
                  <p className="mt-1 text-xs text-navy/56">{task.description}</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="今天还没有新的打卡记录"
                description="可以先从服药、看小课或完成随访确认开始，系统会把记录整理到这里。"
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="我的兑换记录">
          <div className="space-y-3">
            {state.redeemedItems.length ? (
              state.redeemedItems.map((item) => (
                <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3">
                  <p className="text-sm font-semibold text-navy">{item.itemName}</p>
                  <p className="mt-1 text-xs text-navy/56">已扣除 {item.points} 分</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="还没有兑换记录"
                description="坚持完成日常任务和小组打卡后，就可以来这里查看兑换过的大米、药盒和健康支持服务。"
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="设置">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-4">
              <div className="flex items-center gap-3">
                <Settings className="h-4 w-4 text-sage" />
                <span className="text-sm font-semibold text-navy">提醒、隐私与展示设置</span>
              </div>
              <ChevronRight className="h-4 w-4 text-navy/45" />
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex w-full items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-sage" />
                <span className="text-sm font-semibold text-navy">退出登录</span>
              </div>
              <ChevronRight className="h-4 w-4 text-navy/45" />
            </button>
          </div>

          <div className="mt-4 text-right">
            <Link
              href={role && isWorkbenchRole(role) ? getPostLoginPath(role) : "/doctor"}
              className="text-sm text-navy/48 underline underline-offset-4"
            >
              {role && isWorkbenchRole(role) ? "进入角色工作台" : "家医团队工作台"}
            </Link>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
