import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { resolveCareSubject } from "@/lib/careSubjects";
import { assertVerifiedResidentCareBinding } from "@/lib/db/carePlatform";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { buildMemoryContext } from "@/lib/memory/contextBuilder";
import { memoryShowcaseContext, memoryShowcaseResident } from "@/lib/showcase/memory";

const querySchema = z.object({
  resident_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) {
    return apiOk({ ...memoryShowcaseResident, demo: true, context: memoryShowcaseContext }, traceId);
  }
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  const parsed = querySchema.safeParse({
    resident_id: request.nextUrl.searchParams.get("resident_id") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_PARAMETER", "居民身份信息格式不正确。", 400, traceId);
  }

  try {
    const { residentId, selected } = await resolveCareSubject(
      request,
      profile,
      supabase,
      parsed.data.resident_id ?? null,
    );
    await assertVerifiedResidentCareBinding(residentId, supabase);

    // Look up the resident's organization_id.
    const { data: residentProfile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", residentId)
      .maybeSingle();

    const context = await buildMemoryContext({
      residentId,
      organizationId: residentProfile?.organization_id ?? "",
      supabase,
    });
    return apiOk({ residentId, careSubject: selected, context }, traceId);
  } catch (error) {
    const message = readErrorMessage(error);
    const verificationRequired = message.includes("CARE_BINDING_VERIFICATION_REQUIRED");
    const forbidden = verificationRequired || /FORBIDDEN|BOUND_RESIDENT_REQUIRED/.test(message);
    return apiError(
      verificationRequired
        ? "CARE_BINDING_VERIFICATION_REQUIRED"
        : forbidden
          ? "RESIDENT_SCOPE_FORBIDDEN"
          : "MEMORY_CONTEXT_FAILED",
      verificationRequired
        ? "家医签约关系核验后才能读取记忆上下文。"
        : forbidden
          ? "无权读取该居民的记忆信息。"
          : "记忆上下文读取失败，请稍后重试。",
      forbidden ? 403 : 500,
      traceId,
    );
  }
}
