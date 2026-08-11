import { z } from "zod";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inputSchema = z.object({ role: z.enum(["resident", "family", "doctor", "admin"]) });
const accounts = {
  resident: "zhangayi@example.com",
  family: "daughter@example.com",
  doctor: "li-doctor@example.com",
  admin: "admin@example.com",
} as const;

function usesLocalDatabase() {
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return ["localhost", "127.0.0.1", "::1"].includes(supabaseHost);
}

export async function POST(request: Request) {
  const traceId = createTraceId();
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== "true" || !usesLocalDatabase()) {
    return apiError("NOT_FOUND", "该入口不可用。", 404, traceId);
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REQUEST", "请选择体验身份。", 400, traceId);
  const isWechatClient = request.headers.get("x-client-platform") === "weapp";
  if (isWechatClient && !["resident", "family"].includes(parsed.data.role)) {
    return apiError("ROLE_NOT_AVAILABLE", "小程序预览仅提供居民和家属身份。", 403, traceId);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return apiError("AUTH_NOT_CONFIGURED", "本地账号服务尚未启动。", 503, traceId);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: accounts[parsed.data.role],
    password: "LocalOnly123!",
  });
  if (error || !data.user || (isWechatClient && !data.session)) {
    return apiError("DEV_SESSION_FAILED", "本地体验账号尚未初始化。", 503, traceId);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,role,organization_id,community_id,account_status,onboarding_completed_at")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) return apiError("PROFILE_LOAD_FAILED", "体验档案读取失败。", 503, traceId);
  return apiOk({
    profile,
    needsOnboarding: !profile.onboarding_completed_at,
    ...(isWechatClient && data.session ? {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
    } : {}),
  }, traceId);
}
