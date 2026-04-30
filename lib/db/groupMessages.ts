import { TypedSupabaseClient } from "@/lib/supabase/types";
import { ChatMessage, RiskLevel } from "@/lib/types";

type AddGroupMessageInput = {
  groupId: string;
  senderId?: string | null;
  senderName: string;
  senderRole: string;
  content: string;
  messageType?: string;
  supabase: TypedSupabaseClient;
};

function mapSenderRole(role: string): ChatMessage["role"] {
  switch (role) {
    case "doctor":
      return "doctor";
    case "nurse":
      return "nurse";
    case "family":
      return "family";
    case "community":
    case "leader":
      return "leader";
    case "assistant":
      return "assistant";
    default:
      return "user";
  }
}

export function mapGroupRowToChatMessage(row: {
  id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
}): ChatMessage {
  return {
    id: row.id,
    author: row.sender_name,
    role: mapSenderRole(row.sender_role),
    content: row.content,
    createdAt: row.created_at,
    context: "group",
  };
}

export async function getGroupMessages(
  groupId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("group_messages")
      .select("id, group_id, sender_id, sender_name, sender_role, content, message_type, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      return [] as ChatMessage[];
    }

    return data.map((row) =>
      mapGroupRowToChatMessage(row as {
        id: string;
        sender_name: string;
        sender_role: string;
        content: string;
        created_at: string;
      }),
    );
  } catch {
    return [] as ChatMessage[];
  }
}

export async function addGroupMessage({
  groupId,
  senderId = null,
  senderName,
  senderRole,
  content,
  messageType = "text",
  supabase,
}: AddGroupMessageInput) {
  try {
    const { data, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: senderRole,
        content,
        message_type: messageType,
      })
      .select("id, group_id, sender_id, sender_name, sender_role, content, message_type, created_at")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error?.message ?? "群消息发送失败",
      };
    }

    return {
      ok: true,
      message: mapGroupRowToChatMessage(data as {
        id: string;
        sender_name: string;
        sender_role: string;
        content: string;
        created_at: string;
      }),
    };
  } catch {
    return {
      ok: false,
      message: "群消息发送失败",
    };
  }
}
