import { courses as defaultCourses } from "@/data/courses";
import { demoUsers } from "@/data/demoUsers";
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
  LocalFamilyBinding,
  LocalPointsSummary,
  LocalTaskRecord,
  LocalNotification,
  ManagedCourseItem,
  ManagedFaqItem,
  ManagedTaskItem,
  MatchedLeaderRecord,
  MatchLogItem,
  NotificationType,
  RiskLevel,
  TaskItem,
  TodoStatusEvent,
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
  matchedLeader: "jiayi_matched_leader",
  matchLogs: "jiayi_match_logs",
  notifications: "jiayi_notifications",
  familyBindings: "jiayi_family_bindings",
  todoStatusEvents: "jiayi_todo_status_events",
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
    createSeedMessage("group-4", "群友", "user", "我早上量了 135/82。", "group"),
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

function createDemoDoctorTodos(): DemoDoctorTodo[] {
  const resident = demoUsers.find((user) => user.id === "demo-resident-zhang");
  if (!resident) {
    return [];
  }

  return [
    {
      id: "demo-progress-zhang-1",
      residentId: resident.id,
      residentName: resident.name,
      question: "我能不能停药？",
      riskLevel: "high",
      status: "processing",
      createdAt: createNow(),
      source: "ask",
      recommendedRole: "doctor",
      recommendedRoleLabel: "李医生",
      recommendedReason: "这类问题需要家庭医生进一步判断。",
      originalQuestion: "我能不能停药？",
      clawAnswer: "这类问题需要交给家医团队进一步确认，Claw 不能替代医生判断。",
      summary: "Claw 已帮您整理问题，建议先带上药盒、处方和近期记录联系家庭医生。",
      preparedMaterials: ["药盒或处方单", "近期血压血糖记录", "最近一次就诊信息"],
    },
  ];
}

function ensureDemoTodoEvents(todos: DemoDoctorTodo[]) {
  const currentEvents = readJson<TodoStatusEvent[]>(STORAGE_KEYS.todoStatusEvents, []);

  if (currentEvents.length || !todos.length) {
    return currentEvents;
  }

  const createdAt = todos[0].createdAt;
  const seed: TodoStatusEvent[] = [
    {
      id: "demo-progress-event-submit",
      todoId: todos[0].id,
      actorId: todos[0].residentId ?? null,
      actorName: todos[0].residentName,
      oldStatus: null,
      newStatus: "pending",
      note: "已提交给家医团队。",
      createdAt,
    },
    {
      id: "demo-progress-event-assign",
      todoId: todos[0].id,
      actorId: null,
      actorName: "家医 Claw",
      oldStatus: "pending",
      newStatus: "pending",
      note: "建议携带材料联系李医生。",
      createdAt,
    },
    {
      id: "demo-progress-event-processing",
      todoId: todos[0].id,
      actorId: "demo-doctor-li",
      actorName: "李医生",
      oldStatus: "pending",
      newStatus: "processing",
      note: "家医团队正在处理。",
      createdAt: createNow(),
    },
  ];

  writeJson(STORAGE_KEYS.todoStatusEvents, seed);
  return seed;
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

  const legacyState = readJson<(Partial<ClawState> & { currentUser?: DemoUser }) | null>(
    STORAGE_KEY,
    null,
  );

  if (legacyState?.currentUser) {
    writeJson(STORAGE_KEYS.currentUser, legacyState.currentUser);
    return legacyState.currentUser;
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
  const legacyState = readJson<Partial<ClawState> | null>(STORAGE_KEY, null);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...(legacyState ?? {}),
      currentUser: user,
    }),
  );
}

export function clearDemoUser() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.currentUser);
  window.localStorage.removeItem(LEGACY_DEMO_USER_KEY);
  window.localStorage.removeItem(LEGACY_DEMO_ROLE_KEY);
  const legacyState = readJson<(Partial<ClawState> & { currentUser?: DemoUser }) | null>(
    STORAGE_KEY,
    null,
  );
  if (legacyState?.currentUser) {
    const { currentUser: _currentUser, ...rest } = legacyState;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  }
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

  const seed = createDemoDoctorTodos();
  if (seed.length) {
    writeJson(STORAGE_KEYS.doctorTodos, seed);
    ensureDemoTodoEvents(seed);
  }
  return seed;
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
  appendTodoStatusEvent({
    id: `todo-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    todoId: todo.id,
    actorId: todo.residentId ?? null,
    actorName: todo.residentName,
    oldStatus: null,
    newStatus: "pending",
    note: "已提交给家医团队。",
    createdAt: todo.createdAt,
  });
}

export function readTodoStatusEvents() {
  return readJson<TodoStatusEvent[]>(STORAGE_KEYS.todoStatusEvents, []);
}

export function writeTodoStatusEvents(items: TodoStatusEvent[]) {
  writeJson(STORAGE_KEYS.todoStatusEvents, items);
}

export function appendTodoStatusEvent(item: TodoStatusEvent) {
  writeTodoStatusEvents([item, ...readTodoStatusEvents()]);
}

export function getTodoStatusEvents(todoId: string) {
  return readTodoStatusEvents()
    .filter((item) => item.todoId === todoId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function getStatusEventNote(status: DemoDoctorTodo["status"]) {
  if (status === "processing") {
    return "家医团队正在处理。";
  }
  if (status === "done") {
    return "家医团队已更新处理状态。";
  }
  if (status === "ignored") {
    return "该提醒已关闭。";
  }
  return "已提交给家医团队。";
}

export function updateLocalDoctorTodoStatus(params: {
  todoId: string;
  status: DemoDoctorTodo["status"];
  actorId?: string | null;
  actorName?: string;
  note?: string;
}) {
  const current = readDoctorTodos();
  const target = current.find((item) => item.id === params.todoId);

  if (!target || target.status === params.status) {
    return target ?? null;
  }

  const updated = current.map((item) =>
    item.id === params.todoId ? { ...item, status: params.status } : item,
  );

  writeDoctorTodos(updated);
  appendTodoStatusEvent({
    id: `todo-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    todoId: params.todoId,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? "",
    oldStatus: target.status,
    newStatus: params.status,
    note: params.note ?? getStatusEventNote(params.status),
    createdAt: createNow(),
  });

  return updated.find((item) => item.id === params.todoId) ?? null;
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
    matchLeaderCount: readMatchLogs().length,
  };
}

// ── Match Leader ──────────────────────────────────────────

export function readMatchedLeader(): MatchedLeaderRecord | null {
  return readJson<MatchedLeaderRecord | null>(STORAGE_KEYS.matchedLeader, null);
}

export function writeMatchedLeader(record: MatchedLeaderRecord) {
  writeJson(STORAGE_KEYS.matchedLeader, record);
}

export function clearMatchedLeader() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEYS.matchedLeader);
  emitStorageChange();
}

export function readMatchLogs(): MatchLogItem[] {
  return readJson<MatchLogItem[]>(STORAGE_KEYS.matchLogs, []);
}

export function appendMatchLog(log: MatchLogItem) {
  writeJson(STORAGE_KEYS.matchLogs, [log, ...readMatchLogs()]);
}

// ── Notifications (localStorage fallback) ───────────────────

function normalizeLegacyNotification(
  item: Partial<LocalNotification> & {
    body?: string;
    href?: string;
  },
): LocalNotification {
  return {
    id: item.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: item.userId || readDemoUser()?.id || "anonymous",
    actorId: item.actorId ?? null,
    type: (item.type as NotificationType | undefined) ?? "system",
    title: item.title || "系统提醒",
    content: item.content ?? item.body ?? "",
    linkUrl: item.linkUrl ?? item.href ?? "",
    isRead: Boolean(item.isRead),
    metadata:
      item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    createdAt: item.createdAt || createNow(),
  };
}

export function readLocalNotifications(userId?: string): LocalNotification[] {
  const currentUserId = userId ?? readDemoUser()?.id ?? null;
  const items = readJson<Array<Partial<LocalNotification> & { body?: string; href?: string }>>(
    STORAGE_KEYS.notifications,
    [],
  ).map(normalizeLegacyNotification);

  if (!currentUserId) {
    return items;
  }

  return items.filter((item) => item.userId === currentUserId);
}

export function writeLocalNotifications(items: LocalNotification[]) {
  writeJson(STORAGE_KEYS.notifications, items);
}

export function appendLocalNotification(params: {
  userId?: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  content?: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const currentUserId = params.userId ?? readDemoUser()?.id ?? "anonymous";
  const item: LocalNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: currentUserId,
    actorId: params.actorId ?? null,
    type: params.type,
    title: params.title,
    content: params.content ?? "",
    linkUrl: params.linkUrl ?? "",
    isRead: false,
    metadata: params.metadata ?? {},
    createdAt: createNow(),
  };

  const existing = readJson<Array<Partial<LocalNotification> & { body?: string; href?: string }>>(
    STORAGE_KEYS.notifications,
    [],
  ).map(normalizeLegacyNotification);
  writeLocalNotifications([item, ...existing]);
  return item;
}

export function markLocalNotificationRead(id: string, userId?: string) {
  const currentUserId = userId ?? readDemoUser()?.id ?? null;
  const items = readJson<Array<Partial<LocalNotification> & { body?: string; href?: string }>>(
    STORAGE_KEYS.notifications,
    [],
  ).map(normalizeLegacyNotification);
  const updated = items.map((item) =>
    item.id === id && (!currentUserId || item.userId === currentUserId)
      ? { ...item, isRead: true }
      : item,
  );
  writeLocalNotifications(updated);
}

export function markAllLocalNotificationsRead(userId?: string) {
  const currentUserId = userId ?? readDemoUser()?.id ?? null;
  const items = readJson<Array<Partial<LocalNotification> & { body?: string; href?: string }>>(
    STORAGE_KEYS.notifications,
    [],
  ).map(normalizeLegacyNotification);
  const updated = items.map((item) =>
    !currentUserId || item.userId === currentUserId ? { ...item, isRead: true } : item,
  );
  writeLocalNotifications(updated);
}

export function getLocalUnreadNotificationCount(userId?: string): number {
  return readLocalNotifications(userId).filter((item) => !item.isRead).length;
}

// ── Family bindings (localStorage fallback) ─────────────────

function createDemoFamilyBindings(): LocalFamilyBinding[] {
  const resident = demoUsers.find((user) => user.id === "demo-resident-zhang");
  const family = demoUsers.find((user) => user.id === "demo-family-daughter");

  if (!resident || !family) {
    return [];
  }

  const now = createNow();
  return [
    {
      id: "demo-binding-zhang-daughter",
      residentId: resident.id,
      familyId: family.id,
      residentName: resident.name,
      familyName: family.name,
      relationship: "女儿",
      note: "主要家属联系人",
      isPrimary: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function readFamilyBindings(): LocalFamilyBinding[] {
  const current = readJson<LocalFamilyBinding[]>(STORAGE_KEYS.familyBindings, []);

  if (current.length) {
    return current;
  }

  const seed = createDemoFamilyBindings();
  if (seed.length) {
    writeJson(STORAGE_KEYS.familyBindings, seed);
  }
  return seed;
}

export function writeFamilyBindings(items: LocalFamilyBinding[]) {
  writeJson(STORAGE_KEYS.familyBindings, items);
}

export function upsertFamilyBinding(item: LocalFamilyBinding) {
  const current = readFamilyBindings();
  const now = createNow();
  const nextItem: LocalFamilyBinding = {
    ...item,
    id: item.id || `binding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: item.status ?? "active",
    createdAt: item.createdAt || now,
    updatedAt: now,
  };
  const index = current.findIndex((entry) => entry.id === nextItem.id);
  const next = [...current];

  if (index >= 0) {
    next[index] = nextItem;
  } else {
    next.unshift(nextItem);
  }

  writeFamilyBindings(next);
  return nextItem;
}

export function updateFamilyBinding(id: string, patch: Partial<LocalFamilyBinding>) {
  const current = readFamilyBindings();
  const next = current.map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          updatedAt: createNow(),
        }
      : item,
  );
  writeFamilyBindings(next);
  return next.find((item) => item.id === id) ?? null;
}

export function getFamilyBindingsForResident(residentId: string) {
  return readFamilyBindings().filter((item) => item.residentId === residentId);
}

export function getFamilyBindingsForFamily(familyId: string) {
  return readFamilyBindings().filter((item) => item.familyId === familyId);
}
