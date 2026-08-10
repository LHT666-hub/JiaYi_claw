"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft, ShieldCheck } from "lucide-react";
import { PhoneOtpCard } from "@/components/auth/PhoneOtpCard";

export default function StaffLoginPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#edf1ef] px-4 py-8 sm:py-12">
      <section className="mx-auto w-full max-w-[460px]">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy/58"
        >
          <ChevronLeft className="h-4 w-4" />
          返回居民入口
        </Link>

        <header className="mb-7 mt-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-navy text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)]">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-semibold text-sage">机构工作台</p>
          <h1 className="mt-2 text-3xl font-semibold text-navy">家医 Claw</h1>
          <p className="mt-2 text-sm leading-6 text-navy/55">
            医生、护士、药师、社区人员与管理员统一入口
          </p>
        </header>

        <PhoneOtpCard
          audience="staff"
          requestEndpoint="/api/v1/auth/staff/otp/request"
          verifyEndpoint="/api/v1/auth/staff/otp/verify"
          title="工作人员登录"
          subtitle="请输入机构邀请时登记的手机号"
          onVerified={(payload) => {
            router.replace(payload.destination ?? "/doctor");
            router.refresh();
          }}
        />

        <div className="mt-5 flex items-start gap-3 rounded-[22px] border border-white/70 bg-white/60 px-4 py-3 text-xs leading-5 text-navy/52">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
          工作人员账号只能由机构管理员邀请并审核，居民公开注册不会获得工作台权限。
        </div>
      </section>
    </main>
  );
}
