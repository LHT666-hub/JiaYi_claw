import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import {
  getWechatSubscriptionTemplates,
  indexLatestSubscriptionGrant,
} from "@/lib/notifications/wechatSubscription";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  results: z.record(z.string().min(1), z.enum(["accept", "reject", "ban"])),
});

function requireWeapp(request: Request, traceId: string) {
  if (request.headers.get("x-client-platform") === "weapp") return null;
  return apiError(
    "WECHAT_CLIENT_REQUIRED",
    "请在微信小程序内管理订阅消息。",
    400,
    traceId,
  );
}

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const platformError = requireWeapp(request, traceId);
  if (platformError) return platformError;
  const { supabase, profile } = await getApiAuthContext(request);
  if (!supabase || !profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);

  const templates = getWechatSubscriptionTemplates();
  const { data: recent } = await supabase
    .from("wechat_subscription_grants")
    .select("template_id,decision,requested_at,consumed_at,delivery_status")
    .order("requested_at", { ascending: false })
    .limit(20);
  const latest = indexLatestSubscriptionGrant(recent ?? []);
  return apiOk(
    {
      configured: templates.length > 0,
      templates: templates.map(({ key, id, label }) => ({ key, id, label })),
      latest,
    },
    traceId,
  );
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  const platformError = requireWeapp(request, traceId);
  if (platformError) return platformError;
  const { profile } = await getApiAuthContext(request);
  const service = createSupabaseServiceRoleClient();
  if (!profile)
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  if (!service)
    return apiError("SERVER_NOT_CONFIGURED", "订阅服务尚未配置。", 503, traceId);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_SUBSCRIPTION_RESULT", "订阅结果格式不正确。", 400, traceId);

  const templateById = new Map(
    getWechatSubscriptionTemplates().map((template) => [template.id, template]),
  );
  const rows = Object.entries(parsed.data.results)
    .map(([templateId, decision]) => {
      const template = templateById.get(templateId);
      if (!template) return null;
      return {
        user_id: profile.id,
        template_key: template.key,
        template_id: template.id,
        decision,
        delivery_status: decision === "accept" ? "available" : "invalid",
        request_trace_id: traceId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (!rows.length)
    return apiError("NO_VALID_TEMPLATE", "当前没有可用的订阅模板。", 400, traceId);

  const enabled = rows.some((row) => row.decision === "accept");
  const { data: recorded, error: recordError } = await service.rpc(
    "record_wechat_subscription_decisions",
    {
      p_user_id: profile.id,
      p_rows: rows,
      p_enabled: enabled,
      p_trace_id: traceId,
    },
  );
  if (recordError) {
    return apiError(
      "SUBSCRIPTION_SAVE_FAILED",
      "订阅结果暂时无法安全保存，请稍后重试。",
      500,
      traceId,
    );
  }
  return apiOk({ enabled, recorded: Number(recorded ?? 0) }, traceId);
}
