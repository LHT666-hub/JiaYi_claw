import { NextRequest, NextResponse } from "next/server";
import { createNotification, createNotificationsBatch, getNotifications } from "@/lib/db/notifications";
import { getServerAuthContext } from "@/lib/supabase/server-auth";
import { FeedbackItem, NotificationType } from "@/lib/types";

type FeedbackMetadata = FeedbackItem & {
  kind: "feedback_submission";
  fromUserId: string;
  fromUserName: string;
  fromUserRole: string;
};

function isFeedbackMetadata(value: unknown): value is FeedbackMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metadata = value as Partial<FeedbackMetadata>;
  return metadata.kind === "feedback_submission" && typeof metadata.id === "string";
}

export async function GET() {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ message: "当前角色没有权限查看反馈。" }, { status: 403 });
  }

  const notifications = await getNotifications(profile.id, supabase, { limit: 100 });
  const feedbacks = notifications
    .filter((item) => item.type === "system")
    .flatMap((item) => {
      if (!isFeedbackMetadata(item.metadata)) {
        return [];
      }

      return [item.metadata];
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return NextResponse.json({ ok: true, feedbacks });
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getServerAuthContext();

  if (!supabase || !user || !profile) {
    return NextResponse.json({ message: "当前未登录。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<FeedbackItem>;

  const feedback: FeedbackItem = {
    id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : `feedback-${Date.now()}`,
    identity:
      typeof body.identity === "string" && body.identity.trim()
        ? body.identity.trim()
        : `${profile.display_name} / ${profile.role}`,
    mostUseful: typeof body.mostUseful === "string" ? body.mostUseful.trim() : "",
    unclearPart: typeof body.unclearPart === "string" ? body.unclearPart.trim() : "",
    elderFriendly: typeof body.elderFriendly === "string" ? body.elderFriendly.trim() : "",
    wantedFeatures: typeof body.wantedFeatures === "string" ? body.wantedFeatures.trim() : "",
    recommend:
      typeof body.recommend === "string" && body.recommend.trim()
        ? body.recommend.trim()
        : "愿意推荐",
    otherSuggestion:
      typeof body.otherSuggestion === "string" ? body.otherSuggestion.trim() : "",
    createdAt:
      typeof body.createdAt === "string" && body.createdAt.trim()
        ? body.createdAt.trim()
        : new Date().toISOString(),
  };

  const metadata: FeedbackMetadata = {
    kind: "feedback_submission",
    fromUserId: profile.id,
    fromUserName: profile.display_name,
    fromUserRole: profile.role,
    ...feedback,
  };

  const { data: admins, error } = (await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")) as {
    data: { id: string }[] | null;
    error: { message?: string } | null;
  };

  if (error || !admins?.length) {
    return NextResponse.json(
      { message: "暂时没有可接收反馈的管理员账号。" },
      { status: 500 },
    );
  }

  const result = await createNotificationsBatch(
    admins.map((admin) => ({
      userId: admin.id,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: `${profile.display_name} 提交了新的体验反馈`,
      content: feedback.mostUseful || feedback.otherSuggestion || "用户提交了一条新的体验反馈。",
      linkUrl: "/admin",
      metadata,
    })),
    supabase,
  );

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message ?? "反馈提交失败。" },
      { status: 500 },
    );
  }

  await createNotification(
    {
      userId: profile.id,
      actorId: profile.id,
      type: "system" satisfies NotificationType,
      title: "反馈已提交",
      content: "感谢您的建议，我们会继续把家医 Claw 做得更好用。",
      linkUrl: "/feedback",
      metadata,
    },
    supabase,
  );

  return NextResponse.json({ ok: true, feedback });
}
