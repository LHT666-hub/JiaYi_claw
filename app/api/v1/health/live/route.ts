import { apiOk, createTraceId } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export function GET() {
  return apiOk({ status: "ok", service: "jiayi-claw", time: new Date().toISOString() }, createTraceId());
}
