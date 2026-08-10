import type { NextRequest } from "next/server";
import { apiOk, createTraceId } from "@/lib/api/response";
import { searchPublicInfo } from "@/lib/publicInfoRepository";

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const items = await searchPublicInfo(query);
  return apiOk({ items, query, verifiedCount: items.filter((item) => !item.stale).length }, traceId);
}
