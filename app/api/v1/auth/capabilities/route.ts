import { apiOk, createTraceId } from "@/lib/api/response";
import { getAuthCapabilities } from "@/lib/auth/capabilities";
import { CURRENT_POLICY_VERSION } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiOk({ ...getAuthCapabilities(), policyVersion: CURRENT_POLICY_VERSION }, createTraceId());
}
