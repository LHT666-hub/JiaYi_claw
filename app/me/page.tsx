"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, MessageSquareText, Settings, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { SectionCard } from "@/components/SectionCard";
import { contacts as localContacts } from "@/data/contacts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchCurrentProfile, getRoleLabel, isWorkbenchRole } from "@/lib/supabase/mvp";
import { ProfileRow } from "@/lib/types";
import { useClawState } from "@/lib/useClawState";
import { logout, useDemoUser } from "@/lib/useDemoUser";

type AuthMode = "loading" | "supabase" | "demo" | "none";

function SimpleContactCard({
  name,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  roleLabel: string;
  avatarUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
          {avatarUrl ? <Image src={avatarUrl} alt={name} fill sizes="48px" className="object-cover" /> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-navy">{name}</p>
          <p className="mt-1 text-xs text-navy/56">{roleLabel}</p>
        </div>
      </div>
      <Users className="h-4 w-4 text-sage" />
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-4 text-left"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-semibold text-navy">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-navy/45" />
    </button>
  );
}

export default function MePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser: demoUser } = useDemoUser();
  const { state } = useClawState();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (isSupabaseConfigured() && supabase) {
        const currentProfile = await fetchCurrentProfile(supabase);

        if (!active) {
          return;
        }

        if (currentProfile) {
          setProfile(currentProfile);
          setAuthMode("supabase");
          return;
        }
      }

      if (demoUser) {
        setAuthMode("demo");
        return;
      }

      setAuthMode("none");
      router.replace("/login");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [demoUser, router, supabase]);

  const doctorTeam = localContacts.filter((contact) => contact.group === "doctorTeam");
  const familyMembers = localContacts.filter((contact) => contact.group === "family");

  if (authMode === "loading") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的" />
          <SectionCard>
            <p className="text-sm text-navy/66">正在读取当前身份...</p>
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  if (authMode === "none") {
    return (
      <PhoneShell>
        <div className="space-y-5 px-4 pb-8">
          <BackHeader title="我的" />
          <SectionCard>
            <EmptyState
              title="当前未登录"
              description="请先进入登录页选择演示身份，或使用真实账号登录后再查看“我的”页面。"
            />
          </SectionCard>
        </div>
      </PhoneShell>
    );
  }

  const displayName =
    authMode === "supabase" ? profile?.display_name ?? "用户" : demoUser?.name ?? "张阿姨";
  const roleLabel =
    authMode === "supabase"
      ? profile?.role
        ? getRoleLabel(profile.role)
        : "用户"
      : demoUser?.roleLabel ?? "居民";
  const description =
    authMode === "supabase"
      ? "当前显示 Supabase 登录后的真实资料。"
      : demoUser?.description ?? "当前为演示身份。";
  const tags =
    authMode === "supabase"
      ? [roleLabel, profile?.phone ? `手机号：${profile.phone}` : "已接入真实账号"]
      : demoUser?.tags ?? [];
  const role = authMode === "supabase" ? profile?.role : demoUser?.role;
  const canOpenWorkbench = isWorkbenchRole(role);
  const canOpenAdmin = demoUser?.role === "admin";

  async function handleLogout() {
    if (authMode === "supabase" && supabase) {
      await supabase.auth.signOut();
    }

    logout();
    router.replace("/login");
  }

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="我的" />

        <SectionCard>
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-line bg-[#12365A] text-3xl font-semibold text-white shadow-soft">
              {authMode === "supabase" && profile?.avatar_url ? (
                <Image src={profile.avatar_url} alt={displayName} fill sizes="80px" className="object-cover" />
              ) : (
                displayName.slice(0, 1)
              )}
            </div>
            <div>
              <h2 className="text-[1.5rem] font-semibold text-navy">{displayName}</h2>
              <p className="mt-1 text-sm text-navy/62">{roleLabel}</p>
              <p className="mt-2 text-sm leading-6 text-navy/68">{description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <span
                    key={tag}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      index % 2 === 0 ? "bg-[#EAF1EF] text-sage" : "bg-[#FFF0DF] text-amber"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={authMode === "supabase" ? "当前真实账号" : "当前演示身份"}
          action={<PointsBadge points={state.points} />}
        >
          <p className="text-sm leading-6 text-navy/68">
            {authMode === "supabase"
              ? "这里展示登录后的真实资料；居民端原型功能仍可继续使用。"
              : "当前保留演示身份 fallback，方便做产品演示和后台运营配置。"}
          </p>
        </SectionCard>

        {(authMode === "demo" || profile?.role === "resident" || profile?.role === "family") && (
          <>
            <SectionCard title="我的家医团队">
              <div className="space-y-3">
                {doctorTeam.map((contact) => (
                  <SimpleContactCard
                    key={contact.id}
                    name={contact.name}
                    roleLabel={contact.role}
                    avatarUrl={contact.avatarPath}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard title="我的家人联系人">
              <div className="space-y-3">
                {familyMembers.map((contact) => (
                  <SimpleContactCard
                    key={contact.id}
                    name={contact.name}
                    roleLabel={contact.role}
                    avatarUrl={contact.avatarPath}
                  />
                ))}
              </div>
            </SectionCard>
          </>
        )}

        <SectionCard title="设置">
          <div className="space-y-3">
            <ActionRow
              icon={<Users className="h-4 w-4 text-sage" />}
              label={authMode === "supabase" ? "切换账号 / 演示身份" : "切换身份"}
              onClick={() => router.push("/login")}
            />

            <ActionRow
              icon={<MessageSquareText className="h-4 w-4 text-sage" />}
              label="提交体验反馈"
              onClick={() => router.push("/feedback")}
            />

            {canOpenAdmin ? (
              <ActionRow
                icon={<Settings className="h-4 w-4 text-sage" />}
                label="管理后台"
                onClick={() => router.push("/admin")}
              />
            ) : null}

            <ActionRow
              icon={<Users className="h-4 w-4 text-sage" />}
              label={authMode === "supabase" ? "退出真实账号" : "退出演示身份"}
              onClick={() => void handleLogout()}
            />

            <div className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-4">
              <div className="flex items-center gap-3">
                <Settings className="h-4 w-4 text-sage" />
                <span className="text-sm font-semibold text-navy">
                  {authMode === "supabase" ? "已启用真实登录资料读取" : "当前为本地演示运营版"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 text-right">
            <Link
              href={canOpenWorkbench ? "/doctor" : "/"}
              className="text-sm text-navy/48 underline underline-offset-4"
            >
              {canOpenWorkbench ? "进入工作台" : "返回首页"}
            </Link>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
