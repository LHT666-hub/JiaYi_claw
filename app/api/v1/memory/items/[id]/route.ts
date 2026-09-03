import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId, readErrorMessage } from "@/lib/api/response";
import { getApiAuthContext } from "@/lib/supabase/server-auth";
import { writeAuditLog } from "@/lib/db/audit";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId();
  const { supabase, profile } = await getApiAuthContext(request);
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !supabase) {
    const { id } = await context.params;
    return apiOk({ demo: true, simulated: true, deleted: true, id }, traceId);
  }
  if (!supabase || !profile) {
    return apiError("UNAUTHENTICATED", "请先登录。", 401, traceId);
  }

  // Only the resident themselves can delete their memories.
  if (profile.role !== "resident") {
    return apiError("MEMORY_DELETE_FORBIDDEN", "只有居民本人可以删除记忆。", 403, traceId);
  }

  const { id } = await context.params;

  try {
    const { data, error } = await supabase.rpc("delete_memory", {
      p_memory_id: id,
    });

    if (error) {
      const message = error.message;
      if (message.includes("NOT_FOUND")) {
        return apiError("MEMORY_NOT_FOUND", "这条记忆已经不存在。", 404, traceId);
      }
      if (message.includes("FORBIDDEN")) {
        return apiError("MEMORY_DELETE_FORBIDDEN", "您无权删除这条记忆。", 403, traceId);
      }
      return apiError("MEMORY_DELETE_FAILED", error.message, 500, traceId);
    }

    if (!data) {
      return apiError("MEMORY_NOT_FOUND", "这条记忆已经不存在。", 404, traceId);
    }

    // Write audit log for the deletion.
    await writeAuditLog({
      actorId: profile.id,
      action: "memory.api_deleted",
      targetTable: "resident_memories",
      targetId: id,
      detail: { residentId: profile.id },
      supabase,
    });

    return apiOk({ deleted: true, id }, traceId);
  } catch (error) {
    return apiError("MEMORY_DELETE_FAILED", readErrorMessage(error), 500, traceId);
  }
}
