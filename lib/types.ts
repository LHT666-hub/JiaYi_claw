export type RiskLevel = "low" | "medium" | "high" | "emergency";
export type AskSource = "safety" | "faq" | "kimi" | "fallback" | "greeting";
export type AskFallbackReason =
  | "no_faq_match"
  | "no_env_key"
  | "auth_error"
  | "out_of_scope"
  | "kimi_error"
  | "rate_limit"
  | "timeout"
  | "unknown";

export type FaqItem = {
  id: string;
  question: string;
  keywords: string[];
  category: string;
  answer: string;
  nextStep: string;
  suggestDoctor: boolean;
  riskLevel: RiskLevel;
};

export type CourseItem = {
  id: string;
  title: string;
  category: string;
  audience: string;
  summary: string;
  duration: string;
  points: number;
};

export type ContactGroup = "doctorTeam" | "family" | "community";

export type ContactItem = {
  id: string;
  name: string;
  role: string;
  group: ContactGroup;
  description: string;
  availableTime?: string;
  avatarColor: string;
  avatarPath?: string;
};

export type TaskCategory =
  | "medicine"
  | "record"
  | "course"
  | "group"
  | "followup";

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  points: number;
};

export type ChatRole =
  | "user"
  | "assistant"
  | "doctor"
  | "nurse"
  | "leader"
  | "family";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  author: string;
  content: string;
  createdAt: string;
  context: "ask" | "group" | "direct";
  threadId?: string;
  riskLevel?: RiskLevel;
  source?: AskSource;
  reason?: AskFallbackReason;
};

export type AskReply = {
  answer: string;
  nextStep: string;
  suggestDoctor: boolean;
  riskLevel: RiskLevel;
  category: string;
  source: AskSource;
  reason?: AskFallbackReason;
};

export type NotificationItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  href: string;
  accent: "navy" | "sage" | "amber";
};

export type RedemptionRecord = {
  id: string;
  itemName: string;
  points: number;
  createdAt: string;
};

export type ClawState = {
  points: number;
  completedTaskIds: string[];
  viewedCourseIds: string[];
  redeemedItems: RedemptionRecord[];
  askMessages: ChatMessage[];
  groupMessages: ChatMessage[];
  directMessages: Record<string, ChatMessage[]>;
  groupCheckInDates: string[];
  contactRequestIds: string[];
  readNotificationIds: string[];
  followupConfirmed: boolean;
  followupResponse: string | null;
  followupLastConfirmedAt: string | null;
  streakDays: number;
};
