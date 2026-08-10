"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BookOpen,
  CalendarCheck2,
  ExternalLink,
  HeartPulse,
  Pill,
  Stethoscope,
  UserRoundPlus,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";

type Institution = {
  id: string;
  name: string;
  short_name?: string | null;
  institution_type: string;
  level_label?: string | null;
  address?: string | null;
  service_phone?: string | null;
  official_url?: string | null;
  registration_url?: string | null;
  network_role: string;
};
type CatalogItem = {
  id: string;
  service_type: string;
  name: string;
  description: string | null;
  service_hours: string | null;
  access_mode: "team_assisted" | "official_link" | "hybrid" | "information_only";
  official_url: string | null;
  response_sla_hours: number | null;
  availability_note: string | null;
};
type ServiceData = {
  network: null | {
    name: string;
    description?: string | null;
    community?: { name?: string; service_phone?: string | null };
    institutions?: Institution[];
  };
  serviceCatalog: CatalogItem[];
  schedules: Array<Record<string, unknown>>;
  content: Array<Record<string, unknown>>;
};
const categoryLabels: Record<string, string> = {
  notice: "通知",
  activity: "活动",
  health_classroom: "家医小课堂",
  schedule_notice: "排班",
  policy: "政策",
};
function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
const servicePresentation: Record<
  string,
  { href: string; icon: typeof Stethoscope }
> = {
  clinic_registration: {
    href: "/appointments?type=clinic_registration",
    icon: CalendarCheck2,
  },
  family_doctor_booking: {
    href: "/appointments?type=family_doctor_booking",
    icon: UserRoundPlus,
  },
  referral_assistance: {
    href: "/appointments?type=referral_assistance",
    icon: Activity,
  },
  refill_request: { href: "/appointments?type=refill_request", icon: Pill },
  followup_reminder: {
    href: "/appointments?type=followup_reminder",
    icon: HeartPulse,
  },
  report_explanation: { href: "/ask?q=帮我整理检查报告", icon: BookOpen },
};

const accessModeLabels: Record<CatalogItem["access_mode"], string> = {
  team_assisted: "家医协助",
  official_link: "官方入口",
  hybrid: "两种方式",
  information_only: "信息查询",
};

function ServiceCatalogCard({ item }: { item: CatalogItem }) {
  const presentation = servicePresentation[item.service_type] ?? {
    href: "/appointments",
    icon: Stethoscope,
  };
  const usesOfficialLink =
    (item.access_mode === "official_link" || item.access_mode === "hybrid") &&
    Boolean(item.official_url);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-health-muted text-sage">
          <presentation.icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-health-soft px-2.5 py-1 text-[10px] font-semibold text-sage">
          {accessModeLabels[item.access_mode]}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-navy">{item.name}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-navy/50">
        {item.description}
      </p>
      {item.availability_note ? (
        <p className="mt-2 text-[11px] leading-4 text-navy/42">
          {item.availability_note}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-3 text-[11px] font-semibold text-navy/48">
        <span>
          {item.response_sla_hours
            ? `预计 ${item.response_sla_hours} 小时内首次响应`
            : item.service_hours || (usesOfficialLink ? "前往官方页面办理" : "查看办理说明")}
        </span>
        {usesOfficialLink ? (
          <ExternalLink className="h-3.5 w-3.5" />
        ) : (
          <span aria-hidden>›</span>
        )}
      </div>
    </>
  );

  const className =
    "rounded-[22px] border border-line/60 bg-surface-card p-4 shadow-[0_10px_24px_rgba(16,42,67,0.05)] transition active:scale-[0.985]";
  return usesOfficialLink ? (
    <a href={item.official_url!} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={presentation.href} className={className}>
      {body}
    </Link>
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const [data, setData] = useState<ServiceData | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState<"medical" | "content" | "classroom">(
    "medical",
  );
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "content" || tab === "classroom") setActive(tab);
  }, []);
  useEffect(() => {
    void fetch("/api/v1/home", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (response.status === 401) return router.replace("/login");
        if (!response.ok) setError(payload.error?.message ?? "服务加载失败");
        else setData(payload.data);
      })
      .catch(() => setError("网络连接失败。"));
  }, [router]);
  const institutions = data?.network?.institutions ?? [];
  const content = useMemo(() => data?.content ?? [], [data]);
  const visibleContent =
    active === "classroom"
      ? content.filter((item) => item.category === "health_classroom")
      : content.filter((item) => item.category !== "health_classroom");

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-4 px-4 pb-8 pt-7">
        <header>
          <p className="text-xs font-semibold text-sage">分级诊疗服务</p>
          <h1 className="mt-1 text-xl font-semibold text-navy">服务</h1>
          <p className="mt-2 text-sm text-navy/55">
            从社区首诊开始，需要时由家医团队协助上转。
          </p>
        </header>
        <CareSubjectSwitcher compact />
        {error ? (
          <div className="mt-5 rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">
            {error}
          </div>
        ) : null}
        <div className="ios-control mt-5 grid grid-cols-3 gap-1 rounded-[26px] p-1.5">
          {[
            { key: "medical", label: "医疗服务" },
            { key: "content", label: "活动通知" },
            { key: "classroom", label: "家医课堂" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActive(item.key as typeof active)}
              className={`rounded-[20px] px-2 py-3 text-sm font-semibold transition ${active === item.key ? "bg-navy text-white shadow-[0_10px_24px_rgba(16,42,67,0.18)]" : "text-navy/50"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {active === "medical" ? (
          <>
            <section className="ios-material mt-5 rounded-[30px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-navy/45">我的家医网络</p>
                  <h2 className="mt-1 font-semibold text-navy">
                    {data?.network?.name ?? "尚未绑定"}
                  </h2>
                  <p className="mt-2 text-sm text-navy/60">
                    {data?.network?.community?.name ?? "请联系社区工作人员"}
                  </p>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-health-muted text-sage">
                  <Stethoscope className="h-6 w-6" />
                </span>
              </div>
              {data?.network?.community?.service_phone ? (
                <a
                  href={`tel:${data.network.community.service_phone}`}
                  className="mt-4 inline-flex rounded-full bg-health-soft px-4 py-2 text-sm font-semibold text-sage"
                >
                  联系社区：{data.network.community.service_phone}
                </a>
              ) : null}
            </section>

            <section className="mt-6">
              <h2 className="font-semibold text-navy">快捷办理</h2>
              {(data?.serviceCatalog ?? []).length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(data?.serviceCatalog ?? []).map((item) => {
                    return <ServiceCatalogCard key={item.id} item={item} />;
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-[22px] border border-dashed border-line p-5 text-sm text-navy/50">
                  所属社区尚未启用线上服务目录。
                </div>
              )}
            </section>

            <section className="mt-6">
              <h2 className="font-semibold text-navy">今日及近期坐班</h2>
              {data?.schedules.length ? (
                <div className="mt-3 divide-y divide-line overflow-hidden rounded-[26px] border border-line bg-surface-card">
                  {data.schedules.map((schedule) => {
                    const practitioner = one(
                      schedule.practitioner as
                        Record<string, unknown> | Record<string, unknown>[],
                    );
                    const department = one(
                      schedule.department as
                        Record<string, unknown> | Record<string, unknown>[],
                    );
                    const institution = one(
                      schedule.institution as
                        Record<string, unknown> | Record<string, unknown>[],
                    );
                    return (
                      <article key={String(schedule.id)} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-navy">
                              {String(practitioner?.name ?? "家医团队")}
                              {practitioner?.title
                                ? ` · ${String(practitioner.title)}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-navy/50">
                              {String(institution?.name ?? "所属机构")} ·{" "}
                              {String(department?.name ?? "综合服务")}
                            </p>
                          </div>
                          <span className="rounded-full bg-health-soft px-3 py-1 text-xs font-semibold text-sage">
                            已核验
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-navy/65">
                          {new Date(String(schedule.starts_at)).toLocaleString(
                            "zh-CN",
                          )}{" "}
                          -{" "}
                          {new Date(
                            String(schedule.ends_at),
                          ).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {Array.isArray(practitioner?.specialties) &&
                        practitioner.specialties.length ? (
                          <p className="mt-2 text-xs text-navy/50">
                            擅长：{practitioner.specialties.join("、")}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-[22px] border border-dashed border-line p-5 text-sm text-navy/50">
                  暂无经机构负责人核验的排班，不展示推测号源。
                </div>
              )}
            </section>

            <section className="mt-6">
              <h2 className="font-semibold text-navy">协作医疗网络</h2>
              {institutions.length ? (
                <div className="mt-3 space-y-3">
                  {institutions.map((institution) => (
                    <article
                      key={institution.id}
                      className="rounded-[26px] border border-line bg-surface-card p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-semibold text-sage">
                            {institution.network_role === "primary_care"
                              ? "社区首诊"
                              : "协作上转"}
                          </span>
                          <h3 className="mt-1 font-semibold text-navy">
                            {institution.name}
                          </h3>
                          <p className="mt-1 text-xs text-navy/50">
                            {institution.level_label ??
                              institution.institution_type}
                          </p>
                        </div>
                        <Stethoscope className="h-5 w-5 text-navy/30" />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {institution.registration_url ? (
                          <a
                            href={institution.registration_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white"
                          >
                            官方挂号入口
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        <Link
                          href="/appointments?type=referral_assistance"
                          className="rounded-full border border-line px-3 py-2 text-xs font-semibold text-navy"
                        >
                          请家医协助
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-[22px] border border-dashed border-line p-5 text-sm text-navy/50">
                  尚未配置合作医院。管理员确认正式协作关系后才会展示。
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="mt-5">
            {visibleContent.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleContent.map((item) => (
                  <a
                    key={String(item.id)}
                    href={String(item.original_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[26px] border border-line bg-surface-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-semibold text-sage">
                        {categoryLabels[String(item.category)] ?? "资讯"}
                      </span>
                      <ExternalLink className="h-4 w-4 text-navy/30" />
                    </div>
                    <h2 className="mt-2 font-semibold text-navy">
                      {String(item.title)}
                    </h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-navy/60">
                      {String(item.summary)}
                    </p>
                    <p className="mt-3 text-xs text-navy/45">
                      来源：{String(item.source_name)} · 已审核
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-line p-6 text-center text-sm text-navy/50">
                暂无已审核发布的内容。
              </div>
            )}
          </section>
        )}
      </div>
    </PhoneShell>
  );
}
