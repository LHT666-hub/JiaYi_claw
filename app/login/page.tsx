"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { demoUsers } from "@/data/demoUsers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchCurrentProfile, getPostLoginPath, getRoleLabel } from "@/lib/supabase/mvp";
import { DemoUser } from "@/lib/types";
import { isStaffRole, loginAs, useDemoUser } from "@/lib/useDemoUser";

function getDemoPath(user: DemoUser) {
  if (user.role === "family") {
    return "/family";
  }

  if (user.role === "admin") {
    return "/admin";
  }

  return isStaffRole(user.role) ? "/doctor" : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const configured = isSupabaseConfigured();
  const { showToast } = useToast();
  const { currentUser } = useDemoUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentProfileName, setCurrentProfileName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkProfile() {
      if (!configured || !supabase) {
        return;
      }

      const profile = await fetchCurrentProfile(supabase);
      if (!active) {
        return;
      }

      setCurrentProfileName(
        profile ? `${profile.display_name} / ${getRoleLabel(profile.role)}` : null,
      );
    }

    void checkProfile();

    return () => {
      active = false;
    };
  }, [configured, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      showToast("真实账号暂时不可用，请先使用演示身份。", "warning");
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setIsLoading(false);
      showToast(error.message || "登录失败，请检查邮箱和密码。", "warning");
      return;
    }

    const profile = await fetchCurrentProfile(supabase);
    setIsLoading(false);

    if (!profile) {
      showToast("已登录，但还没有找到这位用户资料。", "warning");
      router.replace("/me");
      return;
    }

    showToast(`已进入 ${profile.display_name}（${getRoleLabel(profile.role)}）。`, "success");
    router.replace(getPostLoginPath(profile.role));
  }

  function handleDemoLogin(user: DemoUser) {
    loginAs(user);
    showToast(`已进入 ${user.name}（${user.roleLabel}）演示身份。`, "success");
    router.push(getDemoPath(user));
  }

  return (
    <PhoneShell>
      <div className="flex min-h-full flex-col justify-center px-5 py-10">
        <div className="rounded-[32px] border border-line/70 bg-[#FFF4E2] p-6 shadow-soft">
          <div className="text-center">
            <p className="font-brand text-[2rem] font-semibold text-navy">家医 Claw</p>
            <p className="mt-3 text-sm leading-6 text-navy/66">
              请选择演示身份，或使用测试账号体验不同角色的服务入口。
            </p>
            <button
              type="button"
              onClick={() => router.push("/demo-center")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-card px-4 py-2 text-xs font-semibold text-navy active:scale-[0.98]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              打开演示中心
            </button>
          </div>

          <div className="mt-6 rounded-[24px] bg-[#FAE9D4] px-4 py-4 text-sm leading-6 text-navy/72">
            {currentProfileName ? (
              <>
                当前账号：{currentProfileName}
                <br />
                重新登录可切换为其他账号。
              </>
            ) : currentUser ? (
              <>
                当前演示身份：{currentUser.name} / {currentUser.roleLabel}
                <br />
                点击下方任意身份，即可直接切换。
              </>
            ) : (
              <>当前未登录，可用测试账号或演示身份进入系统。</>
            )}
          </div>

          <div className="mt-6 rounded-[28px] border border-line bg-surface-card p-4">
            <p className="text-sm font-semibold text-navy">测试账号登录</p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-navy">邮箱</span>
                <div className="rounded-[18px] border border-line bg-cream px-4 transition focus-within:border-sage focus-within:ring-1 focus-within:ring-sage/30">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="请输入测试账号邮箱"
                    className="h-12 w-full bg-transparent text-sm text-navy outline-none placeholder:text-navy/40"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-navy">密码</span>
                <div className="rounded-[18px] border border-line bg-cream px-4 transition focus-within:border-sage focus-within:ring-1 focus-within:ring-sage/30">
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    className="h-12 w-full bg-transparent text-sm text-navy outline-none placeholder:text-navy/40"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={!configured || isLoading}
                className={`w-full rounded-full px-4 py-3.5 text-sm font-semibold text-white shadow-soft active:scale-[0.98] ${
                  !configured || isLoading ? "bg-navy/55" : "bg-navy"
                }`}
              >
                {!configured ? "请先使用演示身份" : isLoading ? "登录中..." : "邮箱密码登录"}
              </button>
            </form>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-navy">演示身份快速进入</p>
            <div className="space-y-3">
              {demoUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleDemoLogin(user)}
                  className="flex w-full items-center justify-between rounded-[24px] border border-line bg-surface-card px-4 py-4 text-left transition active:scale-[0.98] active:bg-surface-press"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/70 text-lg font-semibold text-white shadow-soft"
                      style={{ backgroundColor: user.avatarColor ?? "#12365A" }}
                    >
                      {user.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy">
                        {user.name}
                        <span className="ml-2 text-xs font-medium text-sage">{user.roleLabel}</span>
                      </p>
                      <p className="mt-1 text-xs leading-5 text-navy/60">{user.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-navy/40" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
