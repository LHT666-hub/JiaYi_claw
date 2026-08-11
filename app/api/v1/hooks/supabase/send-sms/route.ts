import { randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { sendTencentOtp } from "@/lib/notifications/tencentSms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hookPayload = z.object({
  user: z.object({
    phone: z.string().regex(/^\+86\d{11}$/),
  }),
  sms: z.object({
    otp: z.string().regex(/^\d{4,10}$/),
  }),
});

function hookSecret() {
  return process.env.SUPABASE_SEND_SMS_HOOK_SECRET?.trim().replace(/^v1,whsec_/, "") ?? "";
}

export async function POST(request: Request) {
  const traceId = randomUUID();
  const secret = hookSecret();
  if (!secret) return Response.json({ error: { http_code: 503, message: "SMS hook is not configured." } }, { status: 503 });

  const rawBody = await request.text();
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(rawBody, Object.fromEntries(request.headers));
  } catch {
    return Response.json({ error: { http_code: 401, message: "Invalid webhook signature." } }, { status: 401 });
  }
  const parsed = hookPayload.safeParse(verified);
  if (!parsed.success)
    return Response.json({ error: { http_code: 400, message: "Invalid SMS hook payload." } }, { status: 400 });

  try {
    await sendTencentOtp({
      phone: parsed.data.user.phone,
      otp: parsed.data.sms.otp,
      traceId,
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "TENCENT_SMS_FAILED";
    console.error("supabase-send-sms-failed", { traceId, code });
    return Response.json({ error: { http_code: 502, message: "SMS provider rejected the request." } }, { status: 502 });
  }
}
