import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createTraceId } from "@/lib/api/response";
import { createShowcaseProfile, SHOWCASE_ROLE_COOKIE } from "@/lib/showcase/session";

const schema = z.object({
  role: z.enum(["resident", "family", "doctor", "nurse", "pharmacist", "community", "admin"]),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return apiError("DEMO_DISABLED", "演示身份未启用。", 404, traceId);
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DEMO_ROLE", "演示身份无效。", 400, traceId);

  const response = apiOk({ profile: createShowcaseProfile(parsed.data.role), demo: true }, traceId);
  response.cookies.set(SHOWCASE_ROLE_COOKIE, parsed.data.role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
