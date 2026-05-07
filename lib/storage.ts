import { courses as defaultCourses } from "@/data/courses";
import { faqs as defaultFaqs } from "@/data/faqs";
import { tasks as defaultTasks } from "@/data/tasks";
import {
  AskFallbackReason,
  AskLogItem,
  AskSource,
  ChatMessage,
  ChatRole,
  ClawState,
  CourseItem,
  DemoDoctorTodo,
  DemoUser,
  FeedbackItem,
  FaqItem,
  LocalPointsSummary,
  LocalTaskRecord,
  ManagedCourseItem,
  ManagedFaqItem,
  ManagedTaskItem,
  RiskLevel,
  TaskItem,
} from "@/lib/types";

const STORAGE_KEY = "family-doctor-claw-state-v1";
const LEGACY_DEMO_USER_KEY = "claw-demo-current-user";
const LEGACY_DEMO_ROLE_KEY = "claw-demo-current-role";
const LEGACY_DOCTOR_TODOS_KEY = "claw-demo-doctor-todos";

export const STORAGE_KEYS = {
  currentUser: "jiayi_current_user",
  askLogs: "jiayi_ask_logs",
  customFaqs: "jiayi_custom_faqs",
  customCourses: "jiayi_custom_courses",
  customTasks: "jiayi_custom_tasks",
  feedbacks: "jiayi_feedbacks",
  doctorTodos: "jiayi_doctor_todos",
  points: "jiayi_points",
  taskRecords: "jiayi_task_records",
} as const;

export const STORAGE_CHANGE_EVENT = "jiayi-storage-change";

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
    createSeedMessage("group-4", "张阿姨", "user", "我早上量了 135/82。", "group"),
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

function emitStorageChange() {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  emitStorageChange();
}

function createNow() {
  return new Date().toISOString();
}

function createManagedFaq(item: FaqItem): ManagedFaqItem {
  const now = createNow();
  return {
    ...item,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createManagedCourse(item: CourseItem): ManagedCourseItem {
  const now = createNow();
  return {
    ...item,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createManagedTask(item: TaskItem): ManagedTaskItem {
  const now = createNow();
  return {
    ...item,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeById<T extends { id: string; isActive?: boolean }>(primary: T[], fallback: T[]) {
  const primaryIds = new Set(primary.map((item) => item.id));
  return [...primary, ...fallback.filter((item) => !primaryIds.has(item.id))];
}

function ensurePointSummary(): LocalPointsSummary {
  const summary = readJson<LocalPointsSummary | null>(STORAGE_KEYS.points, null);

  if (summary) {
    return summary;
  }

  const legacyState = readJson<Partial<ClawState> | null>(STORAGE_KEY, null);
  const current = legacyState?.points ?? defaultState.points;
  return {
    current,
    totalAwarded: current,
    updatedAt: createNow(),
  };
}

export function readState(): ClawState {
  if (!isBrowser()) {
    return defaultState;
  }

  const parsed = readJson<Partial<ClawState> | null>(STORAGE_KEY, null);

  if (!parsed) {
    return defaultState;
  }

  const pointsSummary = ensurePointSummary();

  return {
    ...defaultState,
    ...parsed,
    points: pointsSummary.current,
    completedTaskIds: parsed.completedTaskIds ?? [],
    viewedCourseIds: parsed.viewedCourseIds ?? [],
    redeemedItems: parsed.redeemedItems ?? [],
    askMessages: parsed.askMessages?.length ? parsed.askMessages : defaultState.askMessages,
    groupMessages: parsed.groupMessages?.length ? parsed.groupMessages : defaultState.groupMessages,
    directMessages: parsed.directMessages ?? {},
    groupCheckInDates: parsed.groupCheckInDates ?? [],
    contactRequestIds: parsed.contactRequestIds ?? [],
    readNotificationIds: parsed.readNotificationIds ?? [],
    followupConfirmed: parsed.followupConfirmed ?? false,
    followupResponse: parsed.followupResponse ?? null,
    followupLastConfirmedAt: parsed.followupLastConfirmedAt ?? null,
    streakDays: parsed.streakDays ?? defaultState.streakDays,
  };
}

export function writeState(state: ClawState) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  writeJson(STORAGE_KEYS.points, {
    ...ensurePointSummary(),
    current: state.points,
    updatedAt: createNow(),
  });
}

export function readDemoUser(): DemoUser | null {
  if (!isBrowser()) {
    return null;
  }

  const current = readJson<DemoUser | null>(STORAGE_KEYS.currentUser, null);

  if (current) {
    return current;
  }

  const legacy = readJson<DemoUser | null>(LEGACY_DEMO_USER_KEY, null);

  if (legacy) {
    writeJson(STORAGE_KEYS.currentUser, legacy);
    return legacy;
  }

  return null;
}

export function writeDemoUser(user: DemoUser) {
  if (!isBrowser()) {
    return;
  }

  writeJson(STORAGE_KEYS.currentUser, user);
  window.localStorage.setItem(LEGACY_DEMO_USER_KEY, JSON.stringify(user));
  window.localStorage.setItem(LEGACY_DEMO_ROLE_KEY, user.role);
}

export function clearDemoUser() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.currentUser);
  window.localStorage.removeItem(LEGACY_DEMO_USER_KEY);
  window.localStorage.removeItem(LEGACY_DEMO_ROLE_KEY);
  emitStorageChange();
}

export function readDoctorTodos(): DemoDoctorTodo[] {
  if (!isBrowser()) {
    return [];
  }

  const current = readJson<DemoDoctorTodo[]>(STORAGE_KEYS.doctorTodos, []);
  if (current.length) {
    return current;
  }

  const legacy = readJson<DemoDoctorTodo[]>(LEGACY_DOCTOR_TODOS_KEY, []);
  if (legacy.length) {
    writeJson(STORAGE_KEYS.doctorTodos, legacy);
    return legacy;
  }

  return [];
}

export function writeDoctorTodos(todos: DemoDoctorTodo[]) {
  if (!isBrowser()) {
    return;
  }

  writeJson(STORAGE_KEYS.doctorTodos, todos);
  window.localStorage.setItem(LEGACY_DOCTOR_TODOS_KEY, JSON.stringify(todos));
}

export function appendDoctorTodo(todo: DemoDoctorTodo) {
  const current = readDoctorTodos();
  writeDoctorTodos([todo, ...current]);
}

export function readAskLogs() {
  return readJson<AskLogItem[]>(STORAGE_KEYS.askLogs, []);
}

export function appendAskLog(log: AskLogItem) {
  writeJson(STORAGE_KEYS.askLogs, [log, ...readAskLogs()]);
}

export function readFeedbacks() {
  return readJson<FeedbackItem[]>(STORAGE_KEYS.feedbacks, []);
}

export function appendFeedback(feedback: FeedbackItem) {
  writeJson(STORAGE_KEYS.feedbacks, [feedback, ...readFeedbacks()]);
}

export function clearFeedbacks() {
  writeJson(STORAGE_KEYS.feedbacks, []);
}

export function readCustomFaqs() {
  return readJson<ManagedFaqItem[]>(STORAGE_KEYS.customFaqs, []);
}

export function writeCustomFaqs(items: ManagedFaqItem[]) {
  writeJson(STORAGE_KEYS.customFaqs, items);
}

export function upsertCustomFaq(item: ManagedFaqItem) {
  const current = readCustomFaqs();
  const index = current.findIndex((entry) => entry.id === item.id);
  const next = [...current];

  if (index >= 0) {
    next[index] = {
      ...item,
      updatedAt: createNow(),
    };
  } else {
    next.unshift({
      ...item,
      createdAt: item.createdAt || createNow(),
      updatedAt: createNow(),
    });
  }

  writeCustomFaqs(next);
}

export function readMergedFaqs() {
  const custom = readCustomFaqs();
  const fallback = defaultFaqs.map(createManagedFaq);
  return mergeById(custom, fallback).filter((item) => item.isActive !== false);
}

export function readCustomCourses() {
  return readJson<ManagedCourseItem[]>(STORAGE_KEYS.customCourses, []);
}

export function writeCustomCourses(items: ManagedCourseItem[]) {
  writeJson(STORAGE_KEYS.customCourses, items);
}

export function upsertCustomCourse(item: ManagedCourseItem) {
  const current = readCustomCourses();
  const index = current.findIndex((entry) => entry.id === item.id);
  const next = [...current];

  if (index >= 0) {
    next[index] = {
      ...item,
      updatedAt: createNow(),
    };
  } else {
    next.unshift({
      ...item,
      createdAt: item.createdAt || createNow(),
      updatedAt: createNow(),
    });
  }

  writeCustomCourses(next);
}

export function readMergedCourses() {
  const custom = readCustomCourses();
  const fallback = defaultCourses.map(createManagedCourse);
  return mergeById(custom, fallback).filter((item) => item.isActive !== false);
}

export function readCustomTasks() {
  return readJson<ManagedTaskItem[]>(STORAGE_KEYS.customTasks, []);
}

export function writeCustomTasks(items: ManagedTaskItem[]) {
  writeJson(STORAGE_KEYS.customTasks, items);
}

export function upsertCustomTask(item: ManagedTaskItem) {
  const current = readCustomTasks();
  const index = current.findIndex((entry) => entry.id === item.id);
  const next = [...current];

  if (index >= 0) {
    next[index] = {
      ...item,
      updatedAt: createNow(),
    };
  } else {
    next.unshift({
      ...item,
      createdAt: item.createdAt || createNow(),
      updatedAt: createNow(),
    });
  }

  writeCustomTasks(next);
}

export function readMergedTasks() {
  const custom = readCustomTasks();
  const fallback = defaultTasks.map(createManagedTask);
  return mergeById(custom, fallback).filter((item) => item.isActive !== false);
}

function readStoredTaskRecords() {
  return readJson<LocalTaskRecord[]>(STORAGE_KEYS.taskRecords, []);
}

export function readTaskRecords() {
  const current = readStoredTaskRecords();

  if (current.length) {
    return current;
  }

  const legacyState = readJson<Partial<ClawState> | null>(STORAGE_KEY, null);
  const fallbackIds = legacyState?.completedTaskIds ?? [];

  if (!fallbackIds.length) {
    return [];
  }

  const today = getTodayKey();
  return fallbackIds.map((taskId) => ({
    id: `legacy-${taskId}`,
    taskId,
    title: taskId,
    points: 0,
    completedOn: today,
    completedAt: createNow(),
  }));
}

export function appendTaskRecord(record: LocalTaskRecord) {
  writeJson(STORAGE_KEYS.taskRecords, [record, ...readStoredTaskRecords()]);
}

export function readPointsSummary() {
  return ensurePointSummary();
}

export function adjustPoints(delta: number, kind: "award" | "redeem") {
  const current = ensurePointSummary();
  const next: LocalPointsSummary = {
    current: current.current,
    totalAwarded: kind === "award" && delta > 0 ? current.totalAwarded + delta : current.totalAwarded,
    updatedAt: createNow(),
  };

  writeJson(STORAGE_KEYS.points, next);
  return next;
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
    createdAt: createNow(),
    ...params,
  };
}

export function createManagedFaqDraft(): ManagedFaqItem {
  return createManagedFaq({
    id: `faq-${Date.now()}`,
    question: "",
    keywords: [],
    category: "通用",
    answer: "",
    nextStep: "",
    suggestDoctor: false,
    riskLevel: "low",
  });
}

export function createManagedCourseDraft(): ManagedCourseItem {
  return createManagedCourse({
    id: `course-${Date.now()}`,
    title: "",
    category: "慢病管理",
    audience: "",
    summary: "",
    duration: "3 分钟",
    points: 5,
  });
}

export function createManagedTaskDraft(): ManagedTaskItem {
  return createManagedTask({
    id: `task-${Date.now()}`,
    title: "",
    description: "",
    category: "other",
    points: 5,
  });
}

export function getDashboardMetrics() {
  const today = getTodayKey();
  const askLogsToday = readAskLogs().filter((item) => item.createdAt.slice(0, 10) === today);
  const taskRecordsToday = readTaskRecords().filter((item) => item.completedOn === today);
  const pointSummary = readPointsSummary();
  const state = readState();

  return {
    askCountToday: askLogsToday.length,
    faqHitCount: askLogsToday.filter((item) => item.source === "faq").length,
    safetyBlockCount: askLogsToday.filter((item) => item.source === "safety").length,
    kimiCount: askLogsToday.filter(
      (item) => item.source === "kimi" || item.source === "knowledge_kimi",
    ).length,
    fallbackCount: askLogsToday.filter((item) => item.source === "fallback").length,
    taskCompleteCountToday: taskRecordsToday.length,
    totalPointsAwarded: pointSummary.totalAwarded,
    doctorTodoCount: readDoctorTodos().length,
    groupMessageCount: state.groupMessages.length,
    feedbackCount: readFeedbacks().length,
  };
}
