import Taro from "@tarojs/taro";

declare const API_BASE_URL: string;
const ACCESS_KEY = "jiayi_access_token";
const REFRESH_KEY = "jiayi_refresh_token";
const CARE_SUBJECT_KEY = "jiayi_care_subject";

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

async function refreshSession() {
  const refreshToken = Taro.getStorageSync<string>(REFRESH_KEY);
  if (!refreshToken) return false;
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
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    data?: unknown;
    idempotencyKey?: string;
  } = {},
  retry = true,
): Promise<T> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  const response = await Taro.request({
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
  if (response.statusCode === 401 && retry && (await refreshSession()))
    return apiRequest<T>(path, options, false);
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(response.data?.error?.message ?? "请求失败");
  return response.data.data as T;
}

export async function uploadVoice(
  filePath: string,
  retry = true,
): Promise<{ text: string; requiresConfirmation: boolean }> {
  const token = Taro.getStorageSync<string>(ACCESS_KEY);
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/api/v1/speech/transcribe`,
    filePath,
    name: "audio",
    header: {
      "X-Client-Platform": "weapp",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.statusCode === 401 && retry && (await refreshSession()))
    return uploadVoice(filePath, false);
  const payload =
    typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(payload?.error?.message ?? "语音识别失败");
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
  const residentId = getCareSubjectId();
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/api/v1/documents/analyze`,
    filePath,
    name: "image",
    formData: residentId ? { residentId } : undefined,
    header: {
      "X-Client-Platform": "weapp",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.statusCode === 401 && retry && (await refreshSession()))
    return uploadDocumentImage(filePath, false);
  const payload =
    typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(payload?.error?.message ?? "图片识别失败");
  return payload.data;
}

export function isLoggedIn() {
  return Boolean(Taro.getStorageSync(ACCESS_KEY));
}
