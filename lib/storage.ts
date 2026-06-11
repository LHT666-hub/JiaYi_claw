import { courses as defaultCourses } from "@/data/courses";
import { demoUsers } from "@/data/demoUsers";
import { faqs as defaultFaqs } from "@/data/faqs";
import { tasks as defaultTasks } from "@/data/tasks";
import { buildAgentReply } from "@/lib/agent";
import {
  advanceServiceTask,
  buildPersistedServiceTask,
  getCurrentServiceOwnerRole,
  updateServiceTaskFacts,
} from "@/lib/agentTaskPayload";
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
  PersistedServiceTask,
  RiskLevel,
  ServiceRequestPayload,
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

function createDefaultStateSnapshot(): ClawState {
  return {
    ...defaultState,
    completedTaskIds: [...defaultState.completedTaskIds],
    viewedCourseIds: [...defaultState.viewedCourseIds],
    redeemedItems: [...defaultState.redeemedItems],
    askMessages: defaultState.askMessages.map((item) => ({ ...item })),
    groupMessages: defaultState.groupMessages.map((item) => ({ ...item })),
    directMessages: {},
    groupCheckInDates: [...defaultState.groupCheckInDates],
    contactRequestIds: [...defaultState.contactRequestIds],
    readNotificationIds: [...defaultState.readNotificationIds],
  };
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
    {
      id: "demo-progress-zhang-2",
      residentId: resident.id,
      residentName: resident.name,
      question: "药快吃完了怎么配药？",
      riskLevel: "medium",
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      source: "ask",
      recommendedRole: "pharmacist",
      recommendedRoleLabel: "陈药师",
      recommendedReason: "配药流程问题建议由药师协助说明。",
      originalQuestion: "药快吃完了怎么配药？",
      clawAnswer: "社区卫生服务中心可以凭处方续方配药，部分药品支持长处方。建议带上药盒和上次处方单。",
      summary: "居民询问配药流程，Claw 已给出初步解释，建议药师跟进确认。",
      preparedMaterials: ["社区配药流程说明", "长处方与延伸处方规则"],
    },
    {
      id: "demo-progress-zhang-3",
      residentId: resident.id,
      residentName: resident.name,
      question: "血压 155/98 正常吗？",
      riskLevel: "high",
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      source: "ask",
      recommendedRole: "nurse",
      recommendedRoleLabel: "王护士",
      recommendedReason: "血压数值偏高，建议护士先跟进了解连续记录情况。",
      originalQuestion: "血压 155/98 正常吗？",
      clawAnswer: "这个数值偏高，建议继续监测并记录。如果持续偏高或伴有不适，请联系家医团队。",
      summary: "居民血压读数偏高，需要护士跟进确认是否为持续异常。",
      preparedMaterials: ["近期血压记录", "用药清单"],
    },
    {
      id: "demo-progress-zhang-4",
      residentId: resident.id,
      residentName: resident.name,
      question: "体检报告怎么看？",
      riskLevel: "low",
      status: "done",
      createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      source: "ask",
      recommendedRole: "nurse",
      recommendedRoleLabel: "王护士",
      recommendedReason: "体检报告查看属于日常随访范围。",
      originalQuestion: "体检报告怎么看？",
      clawAnswer: "您可以在健康云 App 查看体检报告，也可以在随访时带纸质报告让家医团队帮您解读。",
      summary: "居民咨询体检报告查看方式，已解释完毕。",
    },
    {
      id: "demo-progress-zhang-5",
      residentId: resident.id,
      residentName: resident.name,
      question: "不会用健康云怎么办？",
      riskLevel: "low",
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      source: "ask",
      recommendedRole: "community",
      recommendedRoleLabel: "居委张老师",
      recommendedReason: "操作协助类问题建议由社区支持人员处理。",
      originalQuestion: "不会用健康云怎么办？",
      clawAnswer: "您可以在社区卫生服务中心前台请工作人员帮忙操作，也可以让家属协助。",
      summary: "居民不会使用手机应用，需要社区协助指导操作。",
      preparedMaterials: ["健康云操作指南（大字版）"],
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
    const rest = { ...legacyState };
    delete rest.currentUser;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  }
  emitStorageChange();
}

export function readDoctorTodos(): DemoDoctorTodo[] {
  if (!isBrowser()) {
    return [];
  }

  const current = readJson<DemoDoctorTodo[]>(STORAGE_KEYS.doctorTodos, []);
  if (current.length > 1) {
    return current;
  }
  if (current.length === 1 && current[0].id === "demo-progress-zhang-1") {
    const seed = createDemoDoctorTodos();
    writeJson(STORAGE_KEYS.doctorTodos, seed);
    return seed;
  }
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
  serviceFactUpdates?: Array<{ label: string; value: string; tone?: "neutral" | "positive" | "warning" }>;
}) {
  const current = readDoctorTodos();
  const target = current.find((item) => item.id === params.todoId);

  if (!target || target.status === params.status) {
    return target ?? null;
  }

  const updated: DemoDoctorTodo[] = current.map((item) => {
    if (item.id !== params.todoId) {
      return item;
    }

    const updatedServiceTask = updateServiceTaskFacts(item.serviceTask, params.serviceFactUpdates);

    if (params.status === "done" && updatedServiceTask) {
      const advanced = advanceServiceTask(updatedServiceTask);

      if (advanced) {
        const nextServiceTask = advanced.serviceTask;
        return {
          ...item,
          status: advanced.completed ? ("done" as const) : ("processing" as const),
          serviceTask: nextServiceTask,
          recommendedRole: getCurrentServiceOwnerRole(nextServiceTask) ?? item.recommendedRole,
        };
      }
    }

    return {
      ...item,
      status: params.status as DemoDoctorTodo["status"],
      serviceTask: updatedServiceTask,
    };
  });

  const nextTodo = updated.find((item) => item.id === params.todoId) ?? null;

  writeDoctorTodos(updated);
  appendTodoStatusEvent({
    id: `todo-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    todoId: params.todoId,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? "",
    oldStatus: target.status,
    newStatus: nextTodo?.status ?? params.status,
    note: params.note ?? getStatusEventNote(params.status),
    createdAt: createNow(),
  });

  return nextTodo;
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

function createSeedNotifications(): LocalNotification[] {
  const now = Date.now();
  return [
    {
      id: "seed-notif-followup",
      userId: "demo-resident-zhang",
      actorId: null,
      type: "todo_status_changed",
      title: "随访确认提醒",
      content: "王护士想确认您本周慢病随访是否方便参加。",
      linkUrl: "/followup",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 20).toISOString(),
    },
    {
      id: "seed-notif-course",
      userId: "demo-resident-zhang",
      actorId: null,
      type: "course_recommended",
      title: "小课堂推荐",
      content: "今天的小课堂《高血压药为什么不能随便停》已上线，看完可得 5 分。",
      linkUrl: "/courses",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 60).toISOString(),
    },
    {
      id: "seed-notif-task",
      userId: "demo-resident-zhang",
      actorId: null,
      type: "task_completed",
      title: "健康打卡提醒",
      content: "今天还没有完成血压记录，记得量一次血压并打卡。",
      linkUrl: "/tasks",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
    },
    {
      id: "seed-notif-doctor-todo",
      userId: "demo-doctor-li",
      actorId: "demo-resident-zhang",
      type: "ask_todo_created",
      title: "新待办：居民咨询停药问题",
      content: "张阿姨咨询「我能不能停药？」，Claw 判定为高风险，已转入您的待办。",
      linkUrl: "/doctor",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 15).toISOString(),
    },
    {
      id: "seed-notif-nurse-todo",
      userId: "demo-nurse-wang",
      actorId: "demo-resident-zhang",
      type: "ask_todo_created",
      title: "新待办：居民血压偏高",
      content: "张阿姨血压 155/98，建议跟进确认是否持续异常。",
      linkUrl: "/doctor",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 50).toISOString(),
    },
    {
      id: "seed-notif-family",
      userId: "demo-family-daughter",
      actorId: null,
      type: "family_binding_created",
      title: "家属绑定成功",
      content: "您已成功绑定张阿姨，可以查看老人的健康提醒和任务情况。",
      linkUrl: "/family",
      isRead: true,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 180).toISOString(),
    },
    {
      id: "seed-notif-family-remind",
      userId: "demo-family-daughter",
      actorId: null,
      type: "todo_status_changed",
      title: "老人随访提醒",
      content: "张阿姨本周有慢病随访安排，请帮忙提醒确认。",
      linkUrl: "/family",
      isRead: false,
      metadata: {},
      createdAt: new Date(now - 1000 * 60 * 30).toISOString(),
    },
  ];
}

export function ensureSeedNotifications() {
  if (!isBrowser()) return;
  const existing = readJson<LocalNotification[]>(STORAGE_KEYS.notifications, []);
  if (existing.length) return;
  writeLocalNotifications(createSeedNotifications());
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

type ResetDemoLocalDataOptions = {
  keepCurrentUser?: boolean;
  keepCustomContent?: boolean;
};

export function resetDemoLocalData(options: ResetDemoLocalDataOptions = {}) {
  if (!isBrowser()) {
    return;
  }

  const keepCurrentUser = options.keepCurrentUser ?? true;
  const keepCustomContent = options.keepCustomContent ?? false;
  const preservedUser = keepCurrentUser ? readDemoUser() : null;
  const preservedFaqs = keepCustomContent ? readCustomFaqs() : [];
  const preservedCourses = keepCustomContent ? readCustomCourses() : [];
  const preservedTasks = keepCustomContent ? readCustomTasks() : [];

  const keysToClear = [
    STORAGE_KEY,
    LEGACY_DEMO_USER_KEY,
    LEGACY_DEMO_ROLE_KEY,
    LEGACY_DOCTOR_TODOS_KEY,
    ...Object.values(STORAGE_KEYS),
  ];

  keysToClear.forEach((key) => {
    window.localStorage.removeItem(key);
  });

  writeState(createDefaultStateSnapshot());

  const seededTodos = createDemoDoctorTodos();
  if (seededTodos.length) {
    writeDoctorTodos(seededTodos);
    ensureDemoTodoEvents(seededTodos);
  }

  const seededBindings = createDemoFamilyBindings();
  if (seededBindings.length) {
    writeFamilyBindings(seededBindings);
  }

  ensureSeedNotifications();

  if (keepCustomContent) {
    if (preservedFaqs.length) {
      writeCustomFaqs(preservedFaqs);
    }
    if (preservedCourses.length) {
      writeCustomCourses(preservedCourses);
    }
    if (preservedTasks.length) {
      writeCustomTasks(preservedTasks);
    }
  }

  if (preservedUser) {
    writeDemoUser(preservedUser);
  } else {
    emitStorageChange();
  }
}

export function seedShowcaseScenario() {
  if (!isBrowser()) {
    return null;
  }

  const resident =
    demoUsers.find((item) => item.id === "demo-resident-zhang") ??
    demoUsers.find((item) => item.role === "resident") ??
    null;
  const doctor =
    demoUsers.find((item) => item.id === "demo-doctor-li") ??
    demoUsers.find((item) => item.role === "doctor") ??
    null;

  const question = "最近两天血压都在155/98，需要马上去医院吗？";
  const answer =
    "这个数值偏高，建议继续监测并尽快联系家医团队进一步评估。若伴随胸痛、呼吸困难、肢体无力或言语不清，请立即就医。";
  const todoId = `demo-showcase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = createNow();
  const residentName = resident?.name ?? "当前居民";

  appendAskLog({
    id: `ask-showcase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    answer,
    source: "safety",
    category: "风险提醒",
    riskLevel: "high",
    suggestDoctor: true,
    reason: "high_risk_pattern",
    createdAt,
  });

  const todo: DemoDoctorTodo = {
    id: todoId,
    residentId: resident?.id,
    residentName,
    question,
    riskLevel: "high",
    status: "pending",
    createdAt,
    source: "demo_showcase",
    recommendedRole: "doctor",
    recommendedRoleLabel: doctor?.name ?? "家庭医生",
    recommendedReason: "连续偏高读数伴随风险提示，建议医生优先评估。",
    originalQuestion: question,
    clawAnswer: answer,
    summary: "居民连续两天血压偏高，Claw 已提示高风险，建议医生尽快跟进。",
    preparedMaterials: ["最近3天血压记录", "当前用药清单", "最近一次就诊信息"],
  };
  appendDoctorTodo(todo);

  if (resident?.id) {
    appendLocalNotification({
      userId: resident.id,
      actorId: doctor?.id ?? null,
      type: "ask_todo_created",
      title: "已转交家医团队处理",
      content: "您的高风险问题已同步给家医团队，建议在服务进度查看处理状态。",
      linkUrl: "/service-progress",
      metadata: {
        todoId: todo.id,
      },
    });
  }

  if (doctor?.id) {
    appendLocalNotification({
      userId: doctor.id,
      actorId: resident?.id ?? null,
      type: "ask_todo_created",
      title: "新高风险待办",
      content: `${residentName}咨询了连续高血压问题，请优先处理。`,
      linkUrl: "/doctor",
      metadata: {
        todoId: todo.id,
      },
    });
  }

  return todo;
}

type ServiceShowcaseScenarioKind = "registration" | "refill" | "family_doctor";

function getDemoUserByIdOrRole(id: string, role: DemoUser["role"]) {
  return demoUsers.find((item) => item.id === id) ?? demoUsers.find((item) => item.role === role) ?? null;
}

function buildAdvancedServiceTask(params: {
  question: string;
  serviceRequest: ServiceRequestPayload;
  advanceCount?: number;
  factUpdates?: Array<{ label: string; value: string; tone?: "positive" | "warning" | "neutral" }>;
}) {
  const reply = buildAgentReply(params.question, params.serviceRequest);
  let serviceTask = buildPersistedServiceTask(reply?.agentResult, params.serviceRequest);

  if (!serviceTask) {
    return null;
  }

  if (params.factUpdates?.length) {
    serviceTask = updateServiceTaskFacts(serviceTask, params.factUpdates);
  }

  for (let index = 0; index < (params.advanceCount ?? 0); index += 1) {
    const advanced = advanceServiceTask(serviceTask);
    if (!advanced?.serviceTask) {
      break;
    }
    serviceTask = advanced.serviceTask;
  }

  return {
    reply,
    serviceTask,
  };
}

export function seedServiceShowcaseScenario(kind: ServiceShowcaseScenarioKind) {
  if (!isBrowser()) {
    return null;
  }

  const resident = getDemoUserByIdOrRole("demo-resident-zhang", "resident");
  const doctor = getDemoUserByIdOrRole("demo-doctor-li", "doctor");
  const nurse = getDemoUserByIdOrRole("demo-nurse-wang", "nurse");
  const pharmacist = getDemoUserByIdOrRole("demo-pharmacist-chen", "pharmacist");
  const createdAt = createNow();
  const residentName = resident?.name ?? "当前居民";

  const scenarioMap: Record<
    ServiceShowcaseScenarioKind,
    {
      question: string;
      serviceRequest: ServiceRequestPayload;
      riskLevel: RiskLevel;
      recommendedRole: string;
      recommendedRoleLabel: string;
      recommendedReason: string;
      summary: string;
      preparedMaterials: string[];
      advanceCount?: number;
      factUpdates?: Array<{ label: string; value: string; tone?: "positive" | "warning" | "neutral" }>;
      residentNotification: { title: string; content: string; linkUrl: string };
      teamNotification: { userId?: string; title: string; content: string; linkUrl: string };
    }
  > = {
    registration: {
      question: "帮我预约明天下午看心脏病，推荐合适医生",
      serviceRequest: {
        kind: "registration",
        symptom: "心慌、胸闷，想看心脏方面问题",
        department: "心血管门诊",
        preferredDate: "明天",
        preferredTime: "下午",
      },
      riskLevel: "medium",
      recommendedRole: "community",
      recommendedRoleLabel: "导诊/社区前台",
      recommendedReason: "需要先锁定合适号源，再协调候选医生和到诊时间。",
      summary: "居民已发起挂号协助，Agent 正在匹配合适门诊、候选医生和可约时段。",
      preparedMaterials: ["身份证", "医保卡", "既往心血管检查结果"],
      advanceCount: 1,
      factUpdates: [
        { label: "号源确认", value: "已进入导诊锁号阶段，正在确认明天下午可约时段", tone: "positive" },
        { label: "下一动作", value: "请留意候选医生和最终预约结果通知", tone: "neutral" },
      ],
      residentNotification: {
        title: "挂号协助已发起",
        content: "已为您生成挂号协助任务，可去服务进度查看当前候选医生和锁号情况。",
        linkUrl: "/service-progress",
      },
      teamNotification: {
        userId: doctor?.id,
        title: "新挂号协助任务",
        content: `${residentName}想预约明天下午的心血管门诊，请协助确认候选医生和号源。`,
        linkUrl: "/doctor",
      },
    },
    refill: {
      question: "我药快吃完了，帮我续上次那个降压药",
      serviceRequest: {
        kind: "refill",
        medicineName: "苯磺酸氨氯地平片",
        disease: "高血压",
        deliveryMethod: "mail",
        stockLeft: "还剩3天",
      },
      riskLevel: "medium",
      recommendedRole: "pharmacist",
      recommendedRoleLabel: pharmacist?.name ?? "药师",
      recommendedReason: "需要按续方流程核对既往处方、药房库存和交付方式。",
      summary: "居民已发起续方申请，任务已进入医生审核后的药师审方环节。",
      preparedMaterials: ["上次处方单", "药盒照片", "最近一周血压记录"],
      advanceCount: 2,
      factUpdates: [
        { label: "可续方目录", value: "已初步判断属于常见可续方目录，待药师完成最终审方", tone: "positive" },
        { label: "药房库存", value: "社区药房有常备库存，适合继续推进配药", tone: "positive" },
        { label: "交付方式", value: "拟安排邮寄到家，待居民确认地址", tone: "neutral" },
      ],
      residentNotification: {
        title: "续方配药申请已创建",
        content: "您的续方申请已进入流转，当前正由药师继续审方，可去服务进度查看。",
        linkUrl: "/service-progress",
      },
      teamNotification: {
        userId: pharmacist?.id,
        title: "新续方待审方",
        content: `${residentName}的降压药续方已通过医生初审，请继续审方并确认库存。`,
        linkUrl: "/doctor",
      },
    },
    family_doctor: {
      question: "帮我约一下家庭医生，明天下午电话回访也可以",
      serviceRequest: {
        kind: "family_doctor",
        serviceMode: "phone",
        preferredDate: "明天",
        preferredTime: "下午",
        note: "想先电话回访，必要时再安排面诊",
      },
      riskLevel: "low",
      recommendedRole: "nurse",
      recommendedRoleLabel: nurse?.name ?? "王护士",
      recommendedReason: "需要家医团队先确认回访时段，再同步给居民。",
      summary: "居民已发起家庭医生回访需求，任务正在等待家医团队确认明天下午时段。",
      preparedMaterials: ["近期不适记录", "想咨询的问题清单", "最近一次用药情况"],
      advanceCount: 1,
      factUpdates: [
        { label: "联系窗口", value: "家医团队将在明天下午前确认电话回访时段", tone: "positive" },
        { label: "下一动作", value: "请保持电话畅通，必要时可改约面诊", tone: "neutral" },
      ],
      residentNotification: {
        title: "家医回访需求已提交",
        content: "家庭医生服务任务已建立，可在服务进度中查看回访时段确认情况。",
        linkUrl: "/service-progress",
      },
      teamNotification: {
        userId: nurse?.id,
        title: "新家医回访安排",
        content: `${residentName}希望明天下午电话回访，请协助确认最终时段。`,
        linkUrl: "/doctor",
      },
    },
  };

  const scenario = scenarioMap[kind];
  const built = buildAdvancedServiceTask({
    question: scenario.question,
    serviceRequest: scenario.serviceRequest,
    advanceCount: scenario.advanceCount,
    factUpdates: scenario.factUpdates,
  });

  if (!built?.reply || !built.serviceTask) {
    return null;
  }

  const todoId = `demo-service-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const todo: DemoDoctorTodo = {
    id: todoId,
    residentId: resident?.id,
    residentName,
    question: scenario.question,
    riskLevel: scenario.riskLevel,
    status: "processing",
    createdAt,
    source: "demo_service_showcase",
    recommendedRole: scenario.recommendedRole,
    recommendedRoleLabel: scenario.recommendedRoleLabel,
    recommendedReason: scenario.recommendedReason,
    originalQuestion: scenario.question,
    clawAnswer: built.reply.answer,
    summary: scenario.summary,
    preparedMaterials: scenario.preparedMaterials,
    serviceTask: built.serviceTask as PersistedServiceTask,
  };

  appendAskLog({
    id: `ask-service-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: scenario.question,
    answer: built.reply.answer,
    source: built.reply.source,
    category: built.reply.category,
    riskLevel: built.reply.riskLevel,
    suggestDoctor: built.reply.suggestDoctor,
    createdAt,
  });

  appendDoctorTodo(todo);

  if (resident?.id) {
    appendLocalNotification({
      userId: resident.id,
      actorId: scenario.teamNotification.userId ?? null,
      type: "ask_todo_created",
      title: scenario.residentNotification.title,
      content: scenario.residentNotification.content,
      linkUrl: scenario.residentNotification.linkUrl,
      metadata: { todoId: todo.id, scenario: kind },
    });
  }

  if (scenario.teamNotification.userId) {
    appendLocalNotification({
      userId: scenario.teamNotification.userId,
      actorId: resident?.id ?? null,
      type: "ask_todo_created",
      title: scenario.teamNotification.title,
      content: scenario.teamNotification.content,
      linkUrl: scenario.teamNotification.linkUrl,
      metadata: { todoId: todo.id, scenario: kind },
    });
  }

  return todo;
}
