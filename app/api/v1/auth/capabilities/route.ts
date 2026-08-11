import { apiOk, createTraceId } from "@/lib/api/response";
import { getAuthCapabilities } from "@/lib/auth/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiOk(getAuthCapabilities(), createTraceId());
}
