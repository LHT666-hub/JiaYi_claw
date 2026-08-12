"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardList, Power, PowerOff, RefreshCw, Users } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

type Staff = { id: string; display_name: string; phone: string | null; role: string; community_id: string | null; account_status: string; created_at: string };
type Invite = { id: string; phone: string; display_name: string; role: string; community_id: string | null; status: string; expires_at: string; created_at: string };
type Community = { id: string; name: string };

const roleLabels: Record<string, string> = { doctor: "医生", nurse: "护士", pharmacist: "药师", community: "社区工作人员", admin: "管理员" };
const inviteLabels: Record<string, string> = { pending: "待接受", accepted: "已接受", revoked: "已撤销", expired: "已过期" };

export default function AdminStaffPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [form, setForm] = useState({ phone: "", displayName: "", role: "doctor", communityId: "", expiresInHours: 48 });
  const [createdLink, setCreatedLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/staff", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 403) return router.replace("/login");
      if (!response.ok) throw new Error(payload.error?.message ?? "人员数据加载失败。");
      setStaff(payload.data.staff ?? []); setInvites(payload.data.invites ?? []); setCommunities(payload.data.communities ?? []);
      setForm((value) => value.communityId || !payload.data.communities?.[0]?.id ? value : { ...value, communityId: payload.data.communities[0].id });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "网络连接失败。"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function createInvite(event: FormEvent) {
    event.preventDefault(); setSaving("create"); setError(""); setCreatedLink("");
    try {
      const response = await fetch("/api/v1/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, communityId: form.communityId || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "邀请创建失败。");
      const link = `${window.location.origin}/staff-invite#token=${encodeURIComponent(payload.data.token)}`;
      setCreatedLink(link); setForm((value) => ({ ...value, phone: "", displayName: "" }));
      showToast("邀请已创建，请通过可信渠道发给本人。", "success"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "邀请创建失败。"); }
    finally { setSaving(""); }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(createdLink);
    showToast("邀请链接已复制。", "success");
  }

  async function revoke(id: string) {
    setSaving(id); setError("");
    try {
      const response = await fetch(`/api/v1/admin/staff?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "邀请撤销失败。");
      showToast("邀请已撤销。", "success"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "邀请撤销失败。"); }
    finally { setSaving(""); }
  }

  async function toggleAccount(item: Staff) {
    const status = item.account_status === "active" ? "disabled" : "active";
    if (status === "disabled" && !window.confirm(`确认停用 ${item.display_name} 的工作台账号？`)) return;
    setSaving(item.id); setError("");
    try {
      const response = await fetch("/api/v1/admin/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: item.id, status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "账号状态更新失败。");
      showToast(status === "active" ? "工作人员账号已恢复。" : "工作人员账号已停用。", "success"); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "账号状态更新失败。"); }
    finally { setSaving(""); }
  }

  const communityNames = useMemo(() => new Map(communities.map((item) => [item.id, item.name])), [communities]);
  const pendingInvites = invites.filter((item) => item.status === "pending" && new Date(item.expires_at).getTime() > Date.now());
  const input = "h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-sage";

  return <main className="min-h-dvh bg-[#F3F5F4] text-navy">
    <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">
      <Link href="/admin" aria-label="返回管理后台" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><ArrowLeft className="h-4 w-4" /></Link>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">工作人员与邀请</h1><p className="mt-1 text-xs text-navy/50">只有管理员邀请并完成手机号核验后才能获得工作台角色</p></div>
      <button type="button" onClick={() => void load()} aria-label="刷新" className="flex h-10 w-10 items-center justify-center rounded-md border border-line"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
    </div></header>
    <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={createInvite} className="self-start rounded-md border border-line bg-white p-5 lg:sticky lg:top-5">
        <h2 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-sage" />邀请工作人员</h2>
        <p className="mt-2 text-xs leading-5 text-navy/50">邀请链接含一次性凭据，请通过可信渠道单独发送，不要发到居民群。</p>
        <div className="mt-4 grid gap-3">
          <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={60} placeholder="姓名" className={input} />
          <input required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="中国大陆手机号" className={input} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={form.communityId} onChange={(e) => setForm({ ...form, communityId: e.target.value })} className={input}><option value="">机构级人员</option>{communities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: Number(e.target.value) })} className={input}><option value={24}>24 小时有效</option><option value={48}>48 小时有效</option><option value={72}>72 小时有效</option><option value={168}>7 天有效</option></select>
          <button disabled={saving === "create" || form.phone.length !== 11} className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-45">生成一次性邀请</button>
        </div>
        {createdLink ? <div className="mt-4 rounded-md border border-sage/20 bg-health-soft p-3"><p className="text-xs font-semibold text-sage">链接只在本次创建后显示</p><p className="mt-2 break-all text-xs leading-5 text-navy/60">{createdLink}</p><button type="button" onClick={() => void copyLink()} className="mt-3 flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-semibold"><ClipboardList className="h-3.5 w-3.5" />复制邀请链接</button></div> : null}
      </form>
      <div className="min-w-0 space-y-5">
        {error ? <div className="rounded-md border border-danger/20 bg-risk-soft p-4 text-sm text-danger">{error}</div> : null}
        <section className="rounded-md border border-line bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">已开通人员</h2><span className="text-xs text-navy/45">{staff.length} 人</span></div>
          {loading ? <div className="mt-4 h-28 animate-pulse rounded-md bg-[#F3F5F4]" /> : staff.length ? <div className="mt-4 divide-y divide-line">{staff.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-health-soft text-xs font-semibold text-sage">{item.display_name.slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.display_name}</p><span className="rounded bg-[#F1F4F3] px-2 py-0.5 text-[11px] text-navy/55">{roleLabels[item.role] ?? item.role}</span><span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.account_status === "active" ? "bg-health-soft text-sage" : "bg-risk-soft text-danger"}`}>{item.account_status === "active" ? "可登录" : "已停用"}</span></div><p className="mt-1 text-xs text-navy/45">{item.phone ?? "未登记手机号"} · {item.community_id ? communityNames.get(item.community_id) ?? "所属社区" : "机构级"}</p></div><button type="button" disabled={saving === item.id} onClick={() => void toggleAccount(item)} aria-label={item.account_status === "active" ? "停用账号" : "恢复账号"} className="flex h-9 w-9 items-center justify-center rounded-md border border-line disabled:opacity-40">{item.account_status === "active" ? <PowerOff className="h-4 w-4 text-danger" /> : <Power className="h-4 w-4 text-sage" />}</button></div>)}</div> : <p className="mt-5 text-sm text-navy/45">尚未开通工作人员。</p>}
        </section>
        <section className="rounded-md border border-line bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">邀请记录</h2><span className="text-xs text-navy/45">待接受 {pendingInvites.length} 条</span></div>
          {invites.length ? <div className="mt-4 divide-y divide-line">{invites.map((item) => { const expired = item.status === "pending" && new Date(item.expires_at).getTime() <= Date.now(); const status = expired ? "expired" : item.status; return <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{item.display_name}</p><span className="rounded bg-[#F1F4F3] px-2 py-0.5 text-[11px] text-navy/55">{roleLabels[item.role] ?? item.role}</span><span className="rounded bg-health-soft px-2 py-0.5 text-[11px] font-semibold text-sage">{inviteLabels[status] ?? status}</span></div><p className="mt-1 text-xs text-navy/45">{item.phone} · 有效至 {new Date(item.expires_at).toLocaleString("zh-CN")}</p></div>{status === "pending" ? <button type="button" disabled={saving === item.id} onClick={() => void revoke(item.id)} className="rounded-md border border-danger/20 px-3 py-2 text-xs font-semibold text-danger">撤销</button> : status === "accepted" ? <Check className="h-4 w-4 text-sage" /> : null}</div>; })}</div> : <p className="mt-5 text-sm text-navy/45">尚无邀请记录。</p>}
        </section>
      </div>
    </div>
  </main>;
}
