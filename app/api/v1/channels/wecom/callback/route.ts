import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { NextRequest } from "next/server";
import { decryptWecomPayload, encryptChannelPayload, verifyWecomSignature } from "@/lib/channels/wecomCrypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { extractMedicalEntities } from "@/lib/skills/medicalEntityExtractor";
import { routeSkillIds } from "@/lib/skills/registry";

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });

function config() {
  const token = process.env.WECOM_CALLBACK_TOKEN;
  const aesKey = process.env.WECOM_ENCODING_AES_KEY;
  const storageKey = process.env.CHANNEL_MESSAGE_ENCRYPTION_KEY;
  if (!token || !aesKey) return null;
  return { token, aesKey, storageKey };
}

function text(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }

export async function GET(request: NextRequest) {
  const settings = config();
  if (!settings) return new Response("not configured", { status: 503 });
  const timestamp = request.nextUrl.searchParams.get("timestamp") ?? "";
  const nonce = request.nextUrl.searchParams.get("nonce") ?? "";
  const signature = request.nextUrl.searchParams.get("msg_signature") ?? "";
  const echo = request.nextUrl.searchParams.get("echostr") ?? "";
  if (!verifyWecomSignature(settings.token, timestamp, nonce, echo, signature)) return new Response("forbidden", { status: 403 });
  try { return new Response(decryptWecomPayload(echo, settings.aesKey).message, { headers: { "Content-Type": "text/plain" } }); }
  catch { return new Response("invalid payload", { status: 400 }); }
}

export async function POST(request: NextRequest) {
  const settings = config(); const supabase = createSupabaseServiceRoleClient();
  if (!settings?.storageKey || !supabase) return new Response("not configured", { status: 503 });
  try {
    const rawEnvelope = await request.text();
    if (rawEnvelope.length > 1_000_000) return new Response("too large", { status: 413 });
    const envelope = parser.parse(rawEnvelope)?.xml ?? {};
    const encrypted = text(envelope.Encrypt);
    const timestamp = request.nextUrl.searchParams.get("timestamp") ?? "";
    const nonce = request.nextUrl.searchParams.get("nonce") ?? "";
    const signature = request.nextUrl.searchParams.get("msg_signature") ?? "";
    const timestampNumber = Number(timestamp);
    if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return new Response("expired", { status: 403 });
    if (!encrypted || !verifyWecomSignature(settings.token, timestamp, nonce, encrypted, signature)) return new Response("forbidden", { status: 403 });
    const decrypted = decryptWecomPayload(encrypted, settings.aesKey);
    const event = parser.parse(decrypted.message)?.xml ?? {};
    const corpId = decrypted.corpId || text(event.ToUserName);
    const { data: account } = await supabase.from("channel_accounts").select("*").eq("corp_id", corpId).eq("status", "active").maybeSingle();
    if (!account) return new Response("success", { headers: { "Content-Type": "text/plain" } });

    const externalGroupId = text(event.ChatId || event.ExternalChatId) || null;
    let groupId: string | null = null;
    if (externalGroupId) {
      const { data: group } = await supabase.from("channel_groups").upsert({ channel_account_id: account.id, community_id: account.community_id ?? null, external_group_id: externalGroupId, name: text(event.ChatName) || null }, { onConflict: "channel_account_id,external_group_id" }).select("id").single();
      groupId = group?.id ?? null;
    }
    const externalUserId = text(event.FromUserName || event.ExternalUserID || event.ExternalUserId);
    let member: Record<string, unknown> | null = null;
    if (externalUserId) {
      const { data } = await supabase.from("channel_members").upsert({ channel_group_id: groupId, channel_account_id: account.id, external_user_id: externalUserId, display_name: text(event.SenderName) || null }, { onConflict: "channel_account_id,external_user_id" }).select("*").single();
      member = data;
    }
    const content = text(event.Content || event.Text?.Content);
    const externalMessageId = text(event.MsgId || event.MsgID) || createHash("sha256").update(`${account.id}:${timestamp}:${nonce}:${decrypted.message}`).digest("hex");
    const { data: existingMessage } = await supabase.from("channel_messages").select("id").eq("channel_account_id", account.id).eq("external_message_id", externalMessageId).maybeSingle();
    if (existingMessage) return new Response("success", { headers: { "Content-Type": "text/plain" } });
    const skills = routeSkillIds(content);
    const danger = /(胸痛|呼吸困难|喘不上气|意识不清|昏迷|叫不醒|大出血|自杀|120|急救)/.test(content);
    const safetyLevel = danger ? "emergency" : skills.includes("safety-triage") ? "high" : "low";
    const payloadHash = createHash("sha256").update(decrypted.message).digest("hex");
    const { data: storedMessage, error: messageError } = await supabase.from("channel_messages").upsert({ channel_account_id: account.id, channel_group_id: groupId, channel_member_id: member?.id ?? null, external_message_id: externalMessageId, direction: "inbound", message_type: text(event.MsgType) || "text", encrypted_payload: encryptChannelPayload(decrypted.message, settings.storageKey), payload_hash: payloadHash, safety_level: safetyLevel, processing_status: safetyLevel === "emergency" ? "human_review" : "processed" }, { onConflict: "channel_account_id,external_message_id" }).select("id").single();
    if (messageError) throw messageError;

    const residentId = member?.binding_status === "bound" ? text(member.resident_id) : "";
    const candidates: Array<Record<string, unknown>> = [];
    if (content && residentId) {
      const entities = extractMedicalEntities(content);
      if (skills.includes("appointment-intake")) candidates.push({ fact_type: "appointment_intent", structured_value: { title: "微信群预约协助", summary: content }, confidence: 0.85 });
      if (skills.includes("followup-task-generator")) candidates.push({ fact_type: "followup_intent", structured_value: { title: "微信群随访协助", summary: content }, confidence: 0.82 });
      const bp = content.match(/血压\D*(\d{2,3})\s*[\/／]\s*(\d{2,3})/);
      const glucose = content.match(/血糖\D*(\d+(?:\.\d+)?)/);
      const weight = content.match(/体重\D*(\d+(?:\.\d+)?)/);
      if (bp) candidates.push({ fact_type: "health_observation", structured_value: { observationType: "blood_pressure", value: Number(bp[1]), secondaryValue: Number(bp[2]), unit: "mmHg", measuredAt: new Date().toISOString() }, confidence: 0.94 });
      else if (glucose) candidates.push({ fact_type: "health_observation", structured_value: { observationType: "blood_glucose", value: Number(glucose[1]), secondaryValue: null, unit: "mmol/L", measuredAt: new Date().toISOString() }, confidence: 0.9 });
      else if (weight) candidates.push({ fact_type: "health_observation", structured_value: { observationType: "weight", value: Number(weight[1]), secondaryValue: null, unit: "kg", measuredAt: new Date().toISOString() }, confidence: 0.9 });
      if (entities.medications.length) candidates.push({ fact_type: "medication", structured_value: { medications: entities.medications, summary: content }, confidence: 0.75 });
      if (entities.symptoms.length) candidates.push({ fact_type: "symptom", structured_value: { symptoms: entities.symptoms, summary: content }, confidence: 0.75 });
    } else if (content) {
      candidates.push({ fact_type: "public_question", structured_value: { summary: content, unbound: true }, confidence: 0.7 });
    }
    if (candidates.length) await supabase.from("resident_fact_candidates").insert(candidates.map((candidate) => ({ organization_id: account.organization_id, resident_id: residentId || null, source_message_id: storedMessage.id, ...candidate })));
    return new Response("success", { headers: { "Content-Type": "text/plain" } });
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
}
