import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import {
  getEnvironmentReadiness,
  summarizeReadiness,
  type ReadinessCheck,
} from "@/lib/operations/readiness";
import { getApiAuthContext } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const auth = await getApiAuthContext(request);
  if (!auth.supabase || auth.profile?.role !== "admin") {
    return apiError("FORBIDDEN", "只有管理员可以查看上线准备度。", 403, traceId);
  }

  const organizationId = auth.profile.organization_id;
  const [institutions, services, schedules, content, staff, auditPipeline] = await Promise.all([
    auth.supabase.from("institutions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    auth.supabase.from("service_catalog").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    auth.supabase.from("practitioner_schedules").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "verified").gte("ends_at", new Date().toISOString()),
    auth.supabase.from("content_items").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "published"),
    auth.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("role", ["doctor", "nurse", "pharmacist", "community", "admin"]).eq("account_status", "active"),
    auth.supabase.rpc("audit_pipeline_ready"),
  ]);

  const databaseError = [institutions, services, schedules, content, staff].find((result) => result.error)?.error;
  const dataChecks: ReadinessCheck[] = databaseError
    ? [{ id: "pilot-data", label: "试点运营数据", detail: "数据库查询失败，无法核验机构、人员、服务、排班和内容。", status: "blocked", action: "检查迁移、RLS 和数据库连接。" }]
    : [
        { id: "institutions", label: "真实机构", detail: `已录入 ${institutions.count ?? 0} 家机构。`, status: (institutions.count ?? 0) > 0 ? "ready" : "blocked", action: (institutions.count ?? 0) > 0 ? null : "录入真实社区卫生服务中心和协作机构。" },
        { id: "staff", label: "正式工作人员", detail: `已启用 ${staff.count ?? 0} 个工作人员账号。`, status: (staff.count ?? 0) > 0 ? "ready" : "blocked", action: (staff.count ?? 0) > 0 ? null : "由管理员邀请并审核首批家医团队成员。" },
        { id: "services", label: "居民服务目录", detail: `已启用 ${services.count ?? 0} 项服务。`, status: (services.count ?? 0) > 0 ? "ready" : "blocked", action: (services.count ?? 0) > 0 ? null : "配置预约、转诊、随访等正式办理说明。" },
        { id: "schedules", label: "有效核验排班", detail: `当前有 ${schedules.count ?? 0} 条有效排班。`, status: (schedules.count ?? 0) > 0 ? "ready" : "pending", action: (schedules.count ?? 0) > 0 ? null : "由机构负责人导入并核验排班。" },
        { id: "content", label: "已审核居民内容", detail: `当前有 ${content.count ?? 0} 条发布内容。`, status: (content.count ?? 0) > 0 ? "ready" : "pending", action: (content.count ?? 0) > 0 ? null : "导入官方来源并完成人工审核。" },
        { id: "audit-pipeline", label: "审计证据链", detail: auditPipeline.error ? "无法执行数据库审计自检。" : auditPipeline.data ? "机构配置审计触发器与分角色写入策略已生效。" : "审计策略或配置变更触发器缺失。", status: !auditPipeline.error && auditPipeline.data ? "ready" : "blocked", action: !auditPipeline.error && auditPipeline.data ? null : "执行最新数据库迁移并重新运行 RLS 验证。" },
      ];
  const checks = [...getEnvironmentReadiness(), ...dataChecks];
  return apiOk({ checks, summary: summarizeReadiness(checks) }, traceId);
}
