"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";
import type { AppRole } from "@/lib/types";

type VerifyPayload = {
  profile?: {
    role?: AppRole;
    onboarding_completed_at?: string | null;
  } | null;
  needsOnboarding?: boolean;
  destination?: string;
};

type PhoneOtpCardProps = {
  audience: "resident" | "staff";
  requestEndpoint: string;
  verifyEndpoint: string;
  title: string;
  subtitle: string;
  onVerified: (payload: VerifyPayload) => void;
  availability?: "checking" | "available" | "unavailable";
  unavailableMessage?: string | null;
  onRetryAvailability?: () => void;
  contextToken?: string;
};

export function PhoneOtpCard({
  audience,
  requestEndpoint,
  verifyEndpoint,
  title,
  subtitle,
  onVerified,
  availability = "available",
  unavailableMessage,
  onRetryAvailability,
  contextToken,
}: PhoneOtpCardProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(
      () => setCountdown((value) => Math.max(value - 1, 0)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function requestOtp() {
    if (audience === "resident" && !accepted) {
      showToast("请先阅读并同意隐私政策与用户协议。", "warning");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(requestEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "验证码发送失败");
      setMaskedPhone(payload.data.phone ?? phone);
      setStep("otp");
      setCountdown(payload.data.retryAfterSeconds ?? 60);
      showToast(
        audience === "staff"
          ? "如该手机号已由机构开通，验证码将发送至手机。"
          : "验证码已发送。",
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "验证码发送失败。",
        "warning",
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const response = await fetch(verifyEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Audience": audience,
        },
        body: JSON.stringify({
          phone,
          token: otp,
          ...(audience === "resident" ? {
            privacyAccepted: accepted,
            policyVersion: CURRENT_POLICY_VERSION,
          } : { inviteToken: contextToken }),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "验证码验证失败");
      showToast("手机号验证成功。", "success");
      onVerified(payload.data as VerifyPayload);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "验证码验证失败。",
        "warning",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ios-material rounded-[30px] p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-health-soft text-sage">
          <Phone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-navy">
            {step === "phone" ? title : "输入验证码"}
          </h1>
          <p className="mt-1 text-xs leading-5 text-navy/55">
            {step === "phone"
              ? subtitle
              : `已发送至 ${maskedPhone || phone}`}
          </p>
        </div>
      </div>

      {availability === "checking" ? (
        <div className="mt-5 space-y-3" aria-label="正在检查登录通道">
          <div className="h-[54px] animate-pulse rounded-[20px] bg-surface-tint" />
          <div className="h-12 animate-pulse rounded-full bg-navy/10" />
        </div>
      ) : null}

      {availability === "unavailable" ? (
        <div className="mt-5 rounded-[22px] border border-amber/20 bg-[#F6EDDD] p-4">
          <p className="text-sm font-semibold text-navy">登录通道暂未开放</p>
          <p className="mt-2 text-xs leading-5 text-navy/58">
            {unavailableMessage ?? "登录服务正在配置，请稍后再试。"}
          </p>
          {onRetryAvailability ? (
            <button
              type="button"
              onClick={onRetryAvailability}
              className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-navy shadow-sm"
            >
              刷新状态
            </button>
          ) : null}
        </div>
      ) : null}

      {availability === "available" && step === "phone" ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-navy">手机号</span>
            <div className="mt-2 flex h-[54px] items-center rounded-[20px] border border-line bg-surface-input px-4 transition focus-within:border-sage">
              <span className="mr-3 border-r border-line pr-3 text-sm font-semibold text-navy">
                +86
              </span>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                maxLength={11}
                onChange={(event) =>
                  setPhone(event.target.value.replace(/\D/g, ""))
                }
                placeholder="请输入中国大陆手机号"
                className="min-w-0 flex-1 bg-transparent text-base text-navy outline-none"
              />
            </div>
          </label>

          {audience === "resident" ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-[22px] bg-health-soft p-4 text-xs leading-5 text-navy/66">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#6F9996]"
              />
              <span>
                我已阅读并同意
                <Link
                  href="/legal/privacy-policy"
                  className="mx-1 font-semibold text-sage underline decoration-sage/35 underline-offset-2"
                >
                  隐私政策
                </Link>
                与
                <Link
                  href="/legal/user-agreement"
                  className="ml-1 font-semibold text-sage underline decoration-sage/35 underline-offset-2"
                >
                  用户协议
                </Link>
                。健康信息与 AI 处理将在需要时单独确认。
              </span>
            </label>
          ) : (
            <div className="flex items-start gap-3 rounded-[22px] bg-health-soft p-4 text-xs leading-5 text-navy/62">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
              仅已通过机构审核并绑定手机号的工作人员可以登录。
            </div>
          )}

          <button
            type="button"
            disabled={
              loading ||
              phone.length !== 11 ||
              (audience === "resident" && !accepted)
            }
            onClick={() => void requestOtp()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {loading ? "正在发送" : "获取验证码"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : availability === "available" ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[22px] bg-health-soft px-4 py-3 text-sm leading-6 text-navy/68">
            验证码仅用于本次登录，请勿转发给任何人。
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-navy">短信验证码</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              maxLength={10}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, ""))
              }
              placeholder="6 位验证码"
              className="mt-2 h-14 w-full rounded-[20px] border border-line bg-surface-input px-4 text-center text-2xl tracking-[0.3em] text-navy outline-none transition focus:border-sage"
            />
          </label>
          <button
            type="button"
            disabled={loading || otp.length < 6}
            onClick={() => void verifyOtp()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,42,67,0.18)] disabled:opacity-45"
          >
            {loading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {loading ? "正在验证" : "验证并继续"}
          </button>
          <div className="flex items-center justify-between px-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
              }}
              className="font-semibold text-sage"
            >
              修改手机号
            </button>
            <button
              type="button"
              disabled={countdown > 0 || loading}
              onClick={() => void requestOtp()}
              className="font-semibold text-navy/58 disabled:text-navy/30"
            >
              {countdown > 0 ? `${countdown} 秒后重发` : "重新发送"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
