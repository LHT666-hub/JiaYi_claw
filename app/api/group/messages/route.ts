import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/db/audit";
import { addGroupMessage } from "@/lib/db/groupMessages";
import { getServerAuthContext } from "@/lib/supabase/server-auth";

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录或 Supabase 未配置。" }, { status: 401 });
  }

  const body = (await request.json()) as {
    groupId?: string;
    content?: string;
    senderName?: string;
    senderRole?: string;
    messageType?: string;
  };

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const senderName =
    typeof body.senderName === "string" && body.senderName.trim()
      ? body.senderName.trim()
      : profile.display_name;
  const senderRole =
    typeof body.senderRole === "string" && body.senderRole.trim()
      ? body.senderRole.trim()
      : profile.role;
  const messageType =
    typeof body.messageType === "string" && body.messageType.trim()
      ? body.messageType.trim()
      : "text";

  if (!groupId || !content) {
    return NextResponse.json({ message: "消息内容不能为空。" }, { status: 400 });
  }

  const result = await addGroupMessage({
    groupId,
    senderId: user.id,
    senderName,
    senderRole,
    content,
    messageType,
    supabase,
  });

  if (!result.ok || !result.message || typeof result.message === "string") {
    return NextResponse.json(
      { message: typeof result.message === "string" ? result.message : "群消息发送失败。" },
      { status: 500 },
    );
  }

  await writeAuditLog({
    actorId: profile.id,
    action: "group_message.send",
    targetTable: "group_messages",
    targetId: result.message.id,
    detail: {
      groupId,
      messageType,
    },
    supabase,
  });

  return NextResponse.json({
    ok: true,
    message: result.message,
  });
}
