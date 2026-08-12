import Taro from "@tarojs/taro";
import {
  apiErrorFromPayload,
  networkError,
  sessionExpiredError,
} from "./apiError";

declare const API_BASE_URL: string;
const ACCESS_KEY = "jiayi_access_token";
const REFRESH_KEY = "jiayi_refresh_token";
const CARE_SUBJECT_KEY = "jiayi_care_subject";
let refreshInFlight: Promise<boolean> | null = null;
let redirectingToLogin = false;

export function saveSession(session: {
  accessToken: string;
  refreshToken: string;
}) {
  Taro.setStorageSync(ACCESS_KEY, session.accessToken);
  Taro.setStorageSync(REFRESH_KEY, session.refreshToken);
}

export function clearSession() {
  Taro.removeStorageSync(ACCESS_KEY);
  Taro.removeStorageSync(REFRESH_KEY);
  Taro.removeStorageSync(CARE_SUBJECT_KEY);
}

export function getCareSubjectId() {
  return Taro.getStorageSync<string>(CARE_SUBJECT_KEY) || "";
}

export function saveCareSubjectId(residentId: string) {
  Taro.setStorageSync(CARE_SUBJECT_KEY, residentId);
}

export function withCareSubject(path: string) {
  const residentId = getCareSubjectId();
  if (!residentId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}residentId=${encodeURIComponent(residentId)}`;
}

async function performRefresh() {
  const refreshToken = Taro.getStorageSync<string>(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const response = await Taro.request({
      url: `${API_BASE_URL}/api/v1/auth/refresh`,
      method: "POST",
      data: { refreshToken },
      header: { "X-Client-Platform": "weapp" },
    });
    if (response.statusCode !== 200 || !response.data?.data?.session)
      return false;
    saveSession(response.data.data.session);
    return true;
  } catch {
    return false;
  }
}

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function expireSession() {
  clearSession();
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  try {
    await Taro.reLaunch({ url: "/pages/login/index?reason=session_expired" });
  } finally {
    setTimeout(() => { redirectingToLogin = false; }, 800);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    data?: unknown;
    idempotencyKey?: string;
    auth?: "required" | "optional";
  } = {},
  retry = true,
): Promise<T> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  if (!token && options.auth !== "optional") {
    await expireSession();
    throw sessionExpiredError();
  }
  let response;
  try {
    response = await Taro.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header: {
        "Content-Type": "application/json",
        "X-Client-Platform": "weapp",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
    });
  } catch {
    throw networkError();
  }
  if (response.statusCode === 401) {
    if (token && retry && (await refreshSession()))
      return apiRequest<T>(path, options, false);
    if (options.auth !== "optional") {
      await expireSession();
      throw sessionExpiredError();
    }
  }
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw apiErrorFromPayload(response.data, response.statusCode);
  return response.data.data as T;
}

export async function uploadVoice(
  filePath: string,
  retry = true,
): Promise<{ text: string; requiresConfirmation: boolean }> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  if (!token) {
    await expireSession();
    throw sessionExpiredError();
  }
  let response;
  try {
    response = await Taro.uploadFile({
      url: `${API_BASE_URL}/api/v1/speech/transcribe`,
      filePath,
      name: "audio",
      header: {
        "X-Client-Platform": "weapp",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw networkError();
  }
  if (response.statusCode === 401 && token) {
    if (retry && (await refreshSession())) return uploadVoice(filePath, false);
    await expireSession();
    throw sessionExpiredError();
  }
  const payload =
    typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw apiErrorFromPayload(payload, response.statusCode);
  return payload.data;
}

export async function uploadVoiceBlob(
  blob: Blob,
  retry = true,
): Promise<{ text: string; requiresConfirmation: boolean }> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  if (!token) {
    await expireSession();
    throw sessionExpiredError();
  }
  const form = new FormData();
  const extension = blob.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", blob, `recording.${extension}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/speech/transcribe`, {
      method: "POST",
      headers: {
        "X-Client-Platform": "h5",
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
  } catch {
    throw networkError();
  }
  if (response.status === 401) {
    if (retry && (await refreshSession())) return uploadVoiceBlob(blob, false);
    await expireSession();
    throw sessionExpiredError();
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw apiErrorFromPayload(payload, response.status);
  return payload.data;
}

export type DocumentAnalysisResult = {
  documentType: "lab_report" | "exam_report" | "prescription" | "medicine_package" | "discharge_summary" | "other";
  visibleText: string[];
  plainSummary: string[];
  questionsForClinician: string[];
  uncertainItems: string[];
  confidence: "low" | "medium" | "high";
  safetyNotice: string;
  retained: false;
};

export async function uploadDocumentImage(
  filePath: string,
  retry = true,
): Promise<DocumentAnalysisResult> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  if (!token) {
    await expireSession();
    throw sessionExpiredError();
  }
  const residentId = getCareSubjectId();
  let response;
  try {
    response = await Taro.uploadFile({
      url: `${API_BASE_URL}/api/v1/documents/analyze`,
      filePath,
      name: "image",
      formData: residentId ? { residentId } : undefined,
      header: {
        "X-Client-Platform": "weapp",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw networkError();
  }
  if (response.statusCode === 401 && token) {
    if (retry && (await refreshSession())) return uploadDocumentImage(filePath, false);
    await expireSession();
    throw sessionExpiredError();
  }
  const payload =
    typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw apiErrorFromPayload(payload, response.statusCode);
  return payload.data;
}

export function isLoggedIn() {
  return Boolean(Taro.getStorageSync(ACCESS_KEY));
}
