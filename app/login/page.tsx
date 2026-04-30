"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fetchCurrentProfile, getPostLoginPath } from "@/lib/supabase/mvp";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!configured || !supabase) {
        setCheckingSession(false);
        return;
      }

      const profile = await fetchCurrentProfile(supabase);

      if (!active) {
        return;
      }

      if (profile) {
        router.replace(searchParams.get("next") || getPostLoginPath(profile.role));
        return;
      }

      setCheckingSession(false);
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [configured, router, searchParams, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      showToast("当前还没有配置 Supabase，请先补环境变量。", "warning");
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

    router.replace(searchParams.get("next") || getPostLoginPath(profile?.role));
  }

  return (
    <PhoneShell>
      <div className="flex min-h-full flex-col justify-center px-5 py-10">
        <div className="rounded-[32px] border border-line/70 bg-[#FFF4E2] p-6 shadow-soft">
          <div className="text-center">
            <p className="font-brand text-[2rem] font-semibold text-navy">家医 Claw</p>
            <p className="mt-3 text-sm leading-6 text-navy/66">
              用邮箱登录后，就可以以居民、家属或团队成员身份进入当前 MVP。
            </p>
          </div>

          {!configured ? (
            <div className="mt-6 rounded-[24px] bg-[#FAE9D4] p-4 text-sm leading-6 text-navy/70">
              当前还没有配置 Supabase。
              <br />
              请先在 <code>.env.local</code> 中填写
              <code> NEXT_PUBLIC_SUPABASE_URL </code>和
              <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>。
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-navy">邮箱</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-line bg-cream px-4">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="请输入演示账号邮箱"
                  className="h-12 flex-1 bg-transparent text-sm text-navy outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-navy">密码</span>
              <div className="flex items-center gap-3 rounded-[22px] border border-line bg-cream px-4">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  className="h-12 flex-1 bg-transparent text-sm text-navy outline-none"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={!configured || isLoading || checkingSession}
              className={`mt-2 w-full rounded-full px-4 py-3 text-sm font-semibold text-white ${
                !configured || isLoading || checkingSession ? "bg-navy/55" : "bg-navy"
              }`}
            >
              {checkingSession ? "检查登录状态..." : isLoading ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </div>
    </PhoneShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <PhoneShell>
          <div className="flex min-h-full flex-col justify-center px-5 py-10">
            <div className="rounded-[32px] border border-line/70 bg-[#FFF4E2] p-6 shadow-soft">
              <div className="text-center">
                <p className="font-brand text-[2rem] font-semibold text-navy">家医 Claw</p>
                <p className="mt-3 text-sm leading-6 text-navy/66">正在进入登录页...</p>
              </div>
            </div>
          </div>
        </PhoneShell>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
