"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, PencilLine, Plus, Power, PowerOff } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type ServiceType = "clinic_registration" | "family_doctor_booking" | "refill_request" | "dispense_status_query" | "followup_reminder" | "report_explanation" | "referral_assistance" | "other";
type OwnerRole = "doctor" | "nurse" | "pharmacist" | "community";
type AccessMode = "team_assisted" | "official_link" | "hybrid" | "information_only";
type CatalogItem = {
  id: string;
  service_type: ServiceType;
  name: string;
  description: string | null;
  owner_role: OwnerRole;
  required_fields: string[];
  service_hours: string | null;
  access_mode: AccessMode;
  official_url: string | null;
  response_sla_hours: number | null;
  availability_note: string | null;
  active: boolean;
};

const typeLabels: Record<ServiceType, string> = {
  clinic_registration: "门诊挂号协助",
  family_doctor_booking: "家庭医生预约",
  refill_request: "续方配药申请",
  dispense_status_query: "配药进度查询",
  followup_reminder: "随访安排",
  report_explanation: "检查报告整理",
  referral_assistance: "分级转诊协助",
  other: "其他社区服务",
};
const roleLabels: Record<OwnerRole, string> = { doctor: "医生", nurse: "护士", pharmacist: "药师", community: "社区工作人员" };
const modeLabels: Record<AccessMode, string> = { team_assisted: "团队人工协助", official_link: "仅官方入口", hybrid: "官方入口 + 团队协助", information_only: "仅信息展示" };

function blankForm() {
  return { id: "", serviceType: "clinic_registration" as ServiceType, name: "", description: "", ownerRole: "community" as OwnerRole, requiredFields: "target,preferredDates,contactPhone", serviceHours: "", accessMode: "team_assisted" as AccessMode, officialUrl: "", responseSlaHours: "24", availabilityNote: "", active: true };
}

export default function ServiceCatalogPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/service-catalog", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "服务目录读取失败。");
      setItems(payload.data.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "服务目录读取失败。");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(item: CatalogItem) {
    setForm({ id: item.id, serviceType: item.service_type, name: item.name, description: item.description ?? "", ownerRole: item.owner_role, requiredFields: item.required_fields.join(","), serviceHours: item.service_hours ?? "", accessMode: item.access_mode, officialUrl: item.official_url ?? "", responseSlaHours: item.response_sla_hours ? String(item.response_sla_hours) : "", availabilityNote: item.availability_note ?? "", active: item.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/v1/admin/service-catalog", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id || undefined, serviceType: form.serviceType, name: form.name, description: form.description || null, ownerRole: form.ownerRole, requiredFields: form.requiredFields.split(/[,，]/).map((value) => value.trim()).filter(Boolean), serviceHours: form.serviceHours || null, accessMode: form.accessMode, officialUrl: form.officialUrl || null, responseSlaHours: form.responseSlaHours ? Number(form.responseSlaHours) : null, availabilityNote: form.availabilityNote || null, active: form.active }) });
      const payload = await response.json();
      if (!response.ok) return showToast(payload.error?.message ?? "保存失败", "warning");
      showToast(form.id ? "服务配置已更新。" : "服务已加入当前社区目录。", "success");
      setForm(blankForm()); await load();
    } finally { setSaving(false); }
  }

  async function toggle(item: CatalogItem) {
    const response = await fetch("/api/v1/admin/service-catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, serviceType: item.service_type, name: item.name, description: item.description, ownerRole: item.owner_role, requiredFields: item.required_fields, serviceHours: item.service_hours, accessMode: item.access_mode, officialUrl: item.official_url, responseSlaHours: item.response_sla_hours, availabilityNote: item.availability_note, active: !item.active }) });
    const payload = await response.json();
    if (!response.ok) return showToast(payload.error?.message ?? "状态更新失败", "warning");
    showToast(item.active ? "服务已停用，居民端将不再提供办理入口。" : "服务已重新启用。", "success");
    await load();
  }

  const input = "h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-sage";
  return <main className="min-h-dvh bg-[#F3F5F4] text-navy"><header className="border-b border-line bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link href="/admin" aria-label="返回管理台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><ArrowLeft className="h-4 w-4" /></Link><div><h1 className="text-xl font-semibold">居民服务目录</h1><p className="mt-1 text-xs text-navy/50">这里的启用状态和办理模式直接控制居民端入口与服务申请</p></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[380px_minmax(0,1fr)]"><form onSubmit={save} className="h-fit rounded-md border border-line bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">{form.id ? "编辑服务" : "新增服务"}</h2>{form.id ? <button type="button" onClick={() => setForm(blankForm())} className="text-xs font-semibold text-sage">取消编辑</button> : null}</div><div className="mt-4 grid gap-3"><label className="text-xs font-semibold text-navy/55">服务类型<select value={form.serviceType} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, serviceType: event.target.value as ServiceType, name: form.name || typeLabels[event.target.value as ServiceType] })} className={`mt-1 ${input}`} >{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-navy/55">居民端名称<input required minLength={2} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-1 ${input}`} /></label><label className="text-xs font-semibold text-navy/55">服务说明<textarea value={form.description} maxLength={1000} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 min-h-24 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-sage" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-navy/55">责任角色<select value={form.ownerRole} onChange={(event) => setForm({ ...form, ownerRole: event.target.value as OwnerRole })} className={`mt-1 ${input}`}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-navy/55">响应时限（小时）<input type="number" min={1} max={720} value={form.responseSlaHours} onChange={(event) => setForm({ ...form, responseSlaHours: event.target.value })} className={`mt-1 ${input}`} /></label></div><label className="text-xs font-semibold text-navy/55">办理模式<select value={form.accessMode} onChange={(event) => setForm({ ...form, accessMode: event.target.value as AccessMode })} className={`mt-1 ${input}`}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-navy/55">官方入口{["official_link", "hybrid"].includes(form.accessMode) ? "（必填）" : "（选填）"}<input type="url" value={form.officialUrl} onChange={(event) => setForm({ ...form, officialUrl: event.target.value })} placeholder="https://" className={`mt-1 ${input}`} /></label><label className="text-xs font-semibold text-navy/55">服务时间<input value={form.serviceHours} onChange={(event) => setForm({ ...form, serviceHours: event.target.value })} placeholder="例如：工作日 8:00-17:00" className={`mt-1 ${input}`} /></label><label className="text-xs font-semibold text-navy/55">可用性说明<textarea value={form.availabilityNote} maxLength={300} onChange={(event) => setForm({ ...form, availabilityNote: event.target.value })} placeholder="例如：不承诺实时号源，由团队核验后回写" className="mt-1 min-h-20 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-sage" /></label><label className="text-xs font-semibold text-navy/55">必填字段（逗号分隔）<input value={form.requiredFields} onChange={(event) => setForm({ ...form, requiredFields: event.target.value })} className={`mt-1 ${input}`} /></label><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{form.id ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "正在保存" : form.id ? "保存修改" : "新增服务"}</button></div></form>
    <section><div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">当前社区服务</h2><p className="mt-1 text-xs text-navy/45">团队协助和混合模式可以创建服务申请；仅信息展示不会进入工作队列。</p></div><span className="text-xs text-navy/45">{items.filter((item) => item.active).length}/{items.length} 启用</span></div>{error ? <div className="rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : loading ? <div className="rounded-md border border-line bg-white p-10 text-center text-sm text-navy/45">正在读取服务目录...</div> : items.length ? <div className="divide-y divide-line rounded-md border border-line bg-white">{items.map((item) => <article key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.name}</h3><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.active ? "bg-health-soft text-sage" : "bg-[#F2F2F2] text-navy/40"}`}>{item.active ? "居民端启用" : "已停用"}</span><span className="rounded bg-[#EEF2F5] px-2 py-0.5 text-[11px] text-navy/55">{modeLabels[item.access_mode]}</span></div><p className="mt-1 text-sm leading-6 text-navy/55">{item.description || "未填写服务说明"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy/45"><span>责任人：{roleLabels[item.owner_role]}</span><span>响应：{item.response_sla_hours ? `${item.response_sla_hours} 小时内` : "未承诺"}</span>{item.service_hours ? <span>时间：{item.service_hours}</span> : null}</div>{item.availability_note ? <p className="mt-2 rounded bg-[#F4F6F5] px-3 py-2 text-xs text-navy/55">{item.availability_note}</p> : null}</div><div className="flex gap-2"><button type="button" onClick={() => edit(item)} aria-label={`编辑${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-line"><PencilLine className="h-4 w-4" /></button><button type="button" onClick={() => void toggle(item)} aria-label={item.active ? `停用${item.name}` : `启用${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-line">{item.active ? <PowerOff className="h-4 w-4 text-danger" /> : <Power className="h-4 w-4 text-sage" />}</button>{item.official_url ? <a href={item.official_url} target="_blank" rel="noreferrer" aria-label={`打开${item.name}官方入口`} className="flex h-9 w-9 items-center justify-center rounded-md border border-line"><ExternalLink className="h-4 w-4 text-sage" /></a> : null}</div></div></article>)}</div> : <div className="rounded-md border border-dashed border-line bg-white p-10 text-center text-sm text-navy/45">尚未配置居民服务。</div>}</section></div></main>;
}
