"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Headphones, Phone, Send, ShieldCheck } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";

type MeData = {
  profile: { display_name: string };
  residentId: string | null;
  network: null | {
    name: string;
    community?: {
      name?: string | null;
      service_phone?: string | null;
      address?: string | null;
    } | null;
  };
};

const categories = [
  ["service", "服务办理"],
  ["content", "排班或内容"],
  ["accessibility", "老人使用体验"],
  ["privacy", "隐私与授权"],
  ["bug", "功能异常"],
  ["other", "其他建议"],
] as const;

export default function SupportPage() {
  const router = useRouter();
  const [data, setData] = useState<MeData | null>(null);
  const [category, setCategory] = useState("service");
  const [content, setContent] = useState("");
  const [contactAllowed, setContactAllowed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/v1/me", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error(payload.error?.message ?? "帮助信息加载失败。");
        setData(payload.data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "网络连接失败。"));
  }, [router]);

  const helpLinks = useMemo(() => [
    { href: "/appointments", title: "查看服务进度", note: "预约、转诊和资料补充" },
    { href: "/privacy", title: "管理隐私授权", note: "健康信息、AI 与通知范围" },
    { href: "/account-security", title: "账号与注销", note: "账号安全和注销冷静期" },
  ], []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim().length < 8 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `feedback:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          category,
          content: content.trim(),
          contactAllowed,
          residentId: data?.residentId ?? undefined,
          pagePath: "/support",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "反馈提交失败。");
      setSubmitted(true);
      setContent("");
      setContactAllowed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "反馈提交失败。");
    } finally {
      setSubmitting(false);
    }
  }

  const community = data?.network?.community;
  const phone = community?.service_phone?.trim() ?? "";
  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="帮助与反馈" subtitle="账号、预约或服务异常由工作人员人工处理。" />

        {error ? <div className="rounded-[22px] border border-danger/20 bg-risk-soft px-4 py-3 text-sm leading-6 text-danger">{error}</div> : null}

        <section className="rounded-[32px] border border-sage/15 bg-health-soft p-5 shadow-[0_18px_42px_rgba(16,42,67,0.08)]">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-sage text-white shadow-[0_10px_22px_rgba(47,108,86,0.2)]"><Headphones className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-navy/45">当前服务机构</p>
              <h2 className="mt-1 text-base font-semibold text-navy">{community?.name ?? data?.network?.name ?? "正在读取服务绑定"}</h2>
            </div>
            <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-sage">{data?.network ? "已绑定" : "待绑定"}</span>
          </div>
          {community?.address ? <p className="mt-4 text-sm leading-6 text-navy/55">{community.address}</p> : null}
          {phone ? (
            <a href={`tel:${phone}`} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-sage shadow-[0_10px_22px_rgba(16,42,67,0.06)]">
              <Phone className="h-4 w-4" />拨打 {phone}
            </a>
          ) : <div className="mt-4 rounded-full bg-white/70 px-4 py-3 text-center text-sm text-navy/45">机构服务电话待登记</div>}
          <p className="mt-3 text-xs leading-5 text-navy/40">服务时间以机构最新公示为准；紧急情况请拨打 120。</p>
        </section>

        <section>
          <h2 className="px-1 text-base font-semibold text-navy">常用帮助</h2>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_14px_34px_rgba(16,42,67,0.06)]">
            {helpLinks.map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-4">
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-navy">{item.title}</span><span className="mt-1 block text-xs text-navy/45">{item.note}</span></span>
                <ChevronRight className="h-4 w-4 text-navy/30" />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="px-1"><h2 className="text-base font-semibold text-navy">提交问题反馈</h2><p className="mt-1 text-xs text-navy/45">进入所属机构后台，不公开展示</p></div>
          <div className="mt-3 rounded-[30px] border border-line bg-white p-5 shadow-[0_16px_38px_rgba(16,42,67,0.07)]">
            {submitted ? (
              <div className="flex items-start gap-3 py-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-health-soft text-sage"><Check className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-navy">反馈已经收到</h3><p className="mt-1 text-xs leading-5 text-navy/50">工作人员可在后台跟进，处理进展会通过消息通知。</p></div>
                <button type="button" onClick={() => setSubmitted(false)} className="shrink-0 text-xs font-semibold text-sage">再提一条</button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(event) => void submit(event)}>
                <label className="block text-xs font-semibold text-navy/55">问题类型
                  <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-12 w-full rounded-[18px] border border-line bg-[#F5F7F6] px-3 text-sm text-navy outline-none focus:border-sage">
                    {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-navy/55">具体情况
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} className="mt-2 min-h-36 w-full resize-none rounded-[20px] border border-line bg-[#F5F7F6] p-3 text-sm font-normal leading-6 text-navy outline-none focus:border-sage" placeholder="请描述在哪个页面、做了什么、希望得到什么结果。不要填写身份证号或完整病历。" />
                </label>
                <div className="flex items-start gap-3 rounded-[18px] bg-[#F5F7F6] p-3">
                  <input id="contact-allowed" type="checkbox" checked={contactAllowed} onChange={(event) => setContactAllowed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#2F6C56]" />
                  <label htmlFor="contact-allowed" className="text-xs leading-5 text-navy/55"><span className="block font-semibold text-navy">允许工作人员联系我</span>仅使用账号中已验证的联系方式处理本条反馈</label>
                </div>
                <button type="submit" disabled={content.trim().length < 8 || submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-navy text-sm font-semibold text-white shadow-[0_13px_28px_rgba(16,42,67,0.18)] disabled:opacity-40">
                  <Send className="h-4 w-4" />{submitting ? "正在提交" : "提交给服务团队"}
                </button>
              </form>
            )}
          </div>
        </section>

        <div className="rounded-[22px] bg-white/60 px-4 py-3 text-xs leading-5 text-navy/42">
          <p className="flex items-center gap-1.5 font-semibold text-navy/55"><ShieldCheck className="h-3.5 w-3.5 text-sage" />反馈按所属机构隔离</p>
          <p className="mt-1">运营主体：{process.env.NEXT_PUBLIC_OPERATOR_NAME || "待正式配置"}</p>
          <p>隐私联系：{process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "请联系所属社区"}</p>
        </div>
      </div>
    </PhoneShell>
  );
}
