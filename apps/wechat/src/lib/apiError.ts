export class MiniApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly traceId: string | null = null,
  ) {
    super(message);
    this.name = "MiniApiError";
  }
}

type ErrorPayload = {
  error?: { code?: unknown; message?: unknown };
  traceId?: unknown;
};

export function apiErrorFromPayload(payload: unknown, status: number) {
  const value = payload && typeof payload === "object" ? payload as ErrorPayload : {};
  const code = typeof value.error?.code === "string" ? value.error.code : "REQUEST_FAILED";
  const traceId = typeof value.traceId === "string" ? value.traceId : null;
  let message = typeof value.error?.message === "string" ? value.error.message : "服务暂时不可用，请稍后重试。";
  if (status === 429) message = "操作有些频繁，请稍后再试。";
  else if (status >= 500 && !value.error?.message) message = "服务正在恢复中，请稍后重试。";
  return new MiniApiError(message, code, status, traceId);
}

export function networkError() {
  return new MiniApiError(
    "网络连接失败，请检查网络后重试。",
    "NETWORK_ERROR",
    0,
  );
}

export function sessionExpiredError() {
  return new MiniApiError(
    "登录状态已过期，请重新登录。",
    "SESSION_EXPIRED",
    401,
  );
}
