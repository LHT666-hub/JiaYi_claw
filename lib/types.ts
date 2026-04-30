export type RiskLevel = "low" | "medium" | "high" | "emergency";
export type AppRole =
  | "resident"
  | "family"
  | "doctor"
  | "nurse"
  | "pharmacist"
  | "community"
  | "admin";

export type AskSource =
  | "safety"
  | "faq"
  | "knowledge_kimi"
  | "kimi"
  | "fallback"
  | "greeting"
  | "knowledge";
export type AskFallbackReason =
  | "no_faq_match"
  | "no_env_key"
  | "auth_error"
  | "out_of_scope"
  | "model_error"
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

export type ProfileRow = {
  id: string;
  display_name: string;
  role: AppRole;
  avatar_url: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ResidentProfileRow = {
  id: string;
  user_id: string;
  age: number | null;
  chronic_tags: string[] | null;
  family_doctor_id: string | null;
  community_contact_id: string | null;
  created_at?: string;
};

export type ContactRow = {
  id: string;
  resident_id: string;
  contact_user_id: string | null;
  name: string;
  role_label: string;
  group_type: ContactGroup;
  description: string | null;
  available_time: string | null;
  avatar_url: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

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
  | "followup"
  | "other";

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  points: number;
};

export type SupabaseTaskRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  points: number;
  is_active: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type TaskRecordRow = {
  id: string;
  resident_id: string;
  task_id: string;
  completed_at: string;
  points_awarded: number;
  note?: string | null;
};

export type PointsLedgerRow = {
  id: string;
  resident_id: string;
  change: number;
  reason: string;
  source_type: string;
  source_id: string | null;
  balance_after?: number | null;
  created_at: string;
  created_by?: string | null;
};

export type ExchangeRow = {
  id: string;
  resident_id: string;
  item_name: string;
  points_cost: number;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
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
  knowledgeIds?: string[];
};

export type KnowledgeItem = {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
  safeUse: string;
};

export type PublicInfoItem = {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  summary: string;
  details: string;
  nextStep: string;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string;
  suggestDoctor?: boolean;
};

export type KnowledgeSnippet = {
  id: string;
  title: string;
  category: string;
  summary: string;
  details: string;
  nextStep: string;
  sourceName: string;
  sourceUrl?: string;
  updatedAt?: string;
  suggestDoctor: boolean;
  sourceType: "faq" | "public";
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

export type DoctorTodoRow = {
  id: string;
  resident_id: string | null;
  assigned_to: string | null;
  type: string;
  title: string;
  description: string | null;
  risk_level: RiskLevel;
  status: "pending" | "processing" | "done" | "ignored";
  created_at: string;
  source?: string | null;
  updated_at?: string;
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
