"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, LogIn, ShieldCheck, Stethoscope } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { PhoneOtpCard } from "@/components/auth/PhoneOtpCard";
import { useAuthCapabilities } from "@/components/auth/useAuthCapabilities";
import { useToast } from "@/components/ToastProvider";
import { demoUsers } from "@/data/demoUsers";
import { loginAs } from "@/lib/useDemoUser";
import { getPostLoginPath } from "@/lib/supabase/mvp";
import type { AppRole } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const devLoginEnabled = process.env.NEXT_PUBLIC_DEV_LOGIN === "true";
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const { capabilities, failed, loading: capabilityLoading, retry } = useAuthCapabilities();
  const [showcaseLoading, setShowcaseLoading] = useState(false);

  async function enterDevelopmentSession(
    role: AppRole,
  ) {
    setShowcaseLoading(true);
    try {
      if (demoEnabled) {
        const demoUser = demoUsers.find((user) => user.role === role);
        if (!demoUser) throw new Error("演示身份不存在。");
        loginAs(demoUser);
        router.replace(
          role === "admin"
            ? "/admin"
            : ["doctor", "nurse", "pharmacist", "community"].includes(role)
              ? "/doctor"
              : role === "family"
                ? "/family"
                : "/",
        );
        router.refresh();
        return;
      }
      const response = await fetch("/api/v1/auth/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "本地账号进入失败");
      const profile = payload.data.profile;
      router.replace(
        getPostLoginPath(profile.role, profile.onboarding_completed_at),
      );
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "本地账号进入失败。",
        "warning",
      );
    } finally {
      setShowcaseLoading(false);
    }
  }

  return (
    <PhoneShell>
      <main className="min-h-full px-5 pb-10 pt-8">
        <header className="py-4 text-center">
          <Image
            src="/app-icon.png"
            width={64}
            height={64}
            priority
            alt="家医 Claw"
            className="mx-auto h-16 w-16 rounded-[22px] shadow-[0_16px_34px_rgba(16,42,67,0.22)]"
          />
          <p className="mt-4 font-brand text-3xl font-semibold text-navy">
            家医 Claw
          </p>
          <p className="mt-2 text-sm leading-6 text-navy/58">
            海湾镇家庭医生服务入口
          </p>
        </header>

        <PhoneOtpCard
          audience="resident"
          requestEndpoint="/api/v1/auth/otp/request"
          verifyEndpoint="/api/v1/auth/otp/verify"
          title="手机号登录"
          subtitle="首次登录后完成本人或家属身份与服务社区建档"
          availability={capabilityLoading ? "checking" : capabilities?.sms.available ? "available" : "unavailable"}
          unavailableMessage={failed ? "暂时无法核验登录通道，请稍后刷新页面。" : capabilities?.sms.unavailableMessage}
          onRetryAvailability={retry}
          onVerified={(payload) => {
            router.replace(
              payload.needsOnboarding
                ? "/onboarding"
                : getPostLoginPath(
                    payload.profile?.role,
                    payload.profile?.onboarding_completed_at,
                  ),
            );
            router.refresh();
          }}
        />

        {demoEnabled ? (
          <section className="mt-4 rounded-[28px] border border-sage/25 bg-health-soft/80 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <LogIn className="h-4 w-4 text-sage" />
              全功能演示入口
            </p>
            <p className="mt-1 text-xs leading-5 text-navy/50">无需验证码，可切换全部角色；演示操作不写入真实居民数据。</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {demoUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  disabled={showcaseLoading}
                  onClick={() => void enterDevelopmentSession(user.role)}
                  className={`rounded-full px-3 py-2.5 text-xs font-semibold disabled:opacity-50 ${user.role === "resident" ? "bg-navy text-white" : "border border-line bg-surface-card text-navy"}`}
                >
                  {user.roleLabel}
                </button>
              ))}
            </div>
            <Link href="/demo-center" className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-sage/25 bg-white px-4 py-3 text-sm font-semibold text-sage">
              打开全部页面清单
              <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        ) : null}

        <Link
          href="/public-info"
          className="mt-4 flex items-center gap-3 rounded-[24px] border border-sage/15 bg-health-soft/75 px-4 py-3.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sage shadow-[0_8px_20px_rgba(16,42,67,0.06)]">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-navy">暂不登录，查询公开信息</span>
            <span className="mt-0.5 block text-xs leading-5 text-navy/48">门诊时间、活动与办事指南</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-sage" />
        </Link>

        <div className="mt-4 flex items-center justify-between rounded-[24px] border border-line/70 bg-surface-card/72 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-health-soft text-sage">
              <Stethoscope className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">机构工作人员</p>
              <p className="mt-0.5 text-xs text-navy/48">使用受邀手机号登录工作台</p>
            </div>
          </div>
          <Link
            href="/staff/login"
            className="ml-3 flex shrink-0 items-center gap-1 text-xs font-semibold text-sage"
          >
            工作入口
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {devLoginEnabled && !demoEnabled ? (
          <section className="mt-5 rounded-[28px] border border-dashed border-sage/45 bg-health-soft/75 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <LogIn className="h-4 w-4 text-sage" />
              本地展示入口
            </p>
            <button
              type="button"
              disabled={showcaseLoading}
              onClick={() => void enterDevelopmentSession("resident")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              居民账号进入
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["family", "家属"],
                  ["doctor", "医生"],
                  ["admin", "管理"],
                ] as const
              ).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  disabled={showcaseLoading}
                  onClick={() => void enterDevelopmentSession(role)}
                  className="rounded-full border border-line bg-surface-card px-2 py-2 text-xs font-semibold text-navy disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-6 flex items-center justify-center gap-2 text-xs text-navy/42">
          <ShieldCheck className="h-3.5 w-3.5" />
          服务导航、资料整理与人工协同
        </footer>
      </main>
    </PhoneShell>
  );
}
