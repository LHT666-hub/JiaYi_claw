import {
  AskFallbackReason,
  AskSource,
  ChatMessage,
  ClawState,
  ChatRole,
  RiskLevel,
} from "@/lib/types";

const STORAGE_KEY = "family-doctor-claw-state-v1";

function createSeedMessage(
  id: string,
  author: string,
  role: ChatRole,
  content: string,
  context: "ask" | "group",
  riskLevel?: RiskLevel,
  source?: AskSource,
  reason?: AskFallbackReason,
): ChatMessage {
  return {
    id,
    author,
    role,
    content,
    context,
    riskLevel,
    source,
    reason,
    createdAt: new Date().toISOString(),
  };
}

export const defaultState: ClawState = {
  points: 128,
  completedTaskIds: [],
  viewedCourseIds: [],
  redeemedItems: [],
  askMessages: [
    createSeedMessage(
      "ask-welcome",
      "家医 Claw",
      "assistant",
      "您好，我可以先帮您处理配药、体检、随访和联系家医团队这类问题。",
      "ask",
      undefined,
      "fallback",
    ),
  ],
  groupMessages: [
    createSeedMessage(
      "group-1",
      "Claw 群助手",
      "assistant",
      "今天的小课堂是《高血压药为什么不能随便停》，看完可得 5 分。",
      "group",
    ),
    createSeedMessage(
      "group-2",
      "王阿姨组长",
      "leader",
      "大家早上好，今天记得量血压，量完可以在群里打个卡。",
      "group",
    ),
    createSeedMessage(
      "group-3",
      "李医生",
      "doctor",
      "血压记录可以先连续观察。若持续明显升高，或出现胸痛、头晕、肢体无力等情况，请及时就医。",
      "group",
      "high",
    ),
    createSeedMessage(
      "group-4",
      "张阿姨",
      "user",
      "我早上量了 135/82。",
      "group",
    ),
    createSeedMessage(
      "group-5",
      "Claw 群助手",
      "assistant",
      "已记录。该记录仅用于日常健康管理参考，不能替代医生判断。",
      "group",
    ),
  ],
  directMessages: {},
  groupCheckInDates: [],
  contactRequestIds: [],
  readNotificationIds: [],
  followupConfirmed: false,
  followupResponse: null,
  followupLastConfirmedAt: null,
  streakDays: 5,
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function readState(): ClawState {
  if (!isBrowser()) {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ClawState>;

    return {
      ...defaultState,
      ...parsed,
      completedTaskIds: parsed.completedTaskIds ?? [],
      viewedCourseIds: parsed.viewedCourseIds ?? [],
      redeemedItems: parsed.redeemedItems ?? [],
      askMessages: parsed.askMessages?.length ? parsed.askMessages : defaultState.askMessages,
      groupMessages: parsed.groupMessages?.length
        ? parsed.groupMessages
        : defaultState.groupMessages,
      directMessages: parsed.directMessages ?? {},
      groupCheckInDates: parsed.groupCheckInDates ?? [],
      contactRequestIds: parsed.contactRequestIds ?? [],
      readNotificationIds: parsed.readNotificationIds ?? [],
      followupConfirmed: parsed.followupConfirmed ?? false,
      followupResponse: parsed.followupResponse ?? null,
      followupLastConfirmedAt: parsed.followupLastConfirmedAt ?? null,
    };
  } catch {
    return defaultState;
  }
}

export function writeState(state: ClawState) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getTodayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function createMessage(params: {
  author: string;
  role: ChatRole;
  content: string;
  context: "ask" | "group" | "direct";
  threadId?: string;
  riskLevel?: RiskLevel;
  source?: AskSource;
  reason?: AskFallbackReason;
}) {
  return {
    id: `${params.context}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...params,
  };
}
