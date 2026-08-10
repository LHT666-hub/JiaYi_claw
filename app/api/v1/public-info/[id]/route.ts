import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { getPublicInfoById } from "@/lib/publicInfoRepository";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const traceId = createTraceId();
  const item = await getPublicInfoById((await context.params).id);
  return item ? apiOk({ item }, traceId) : apiError("NOT_FOUND", "没有找到这条公开信息。", 404, traceId);
}
