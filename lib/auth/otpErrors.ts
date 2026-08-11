type OtpFailure = {
  code: "INVALID_PHONE" | "OTP_RATE_LIMITED" | "OTP_SERVICE_UNAVAILABLE";
  message: string;
  status: 400 | 429 | 503;
  logCategory: "invalid_phone" | "rate_limited" | "provider_unavailable";
};

export function classifyOtpFailure(error: unknown): OtpFailure {
  const record = typeof error === "object" && error ? error as Record<string, unknown> : null;
  const raw = [
    error instanceof Error ? error.message : "",
    typeof record?.code === "string" ? record.code : "",
    typeof record?.name === "string" ? record.name : "",
  ].join(" ").toLowerCase();
  const status = typeof record?.status === "number" ? record.status : null;

  if (raw.includes("invalid_phone")) {
    return {
      code: "INVALID_PHONE",
      message: "手机号格式不正确。",
      status: 400,
      logCategory: "invalid_phone",
    };
  }
  if (
    status === 429 ||
    raw.includes("rate limit") ||
    raw.includes("over_request_rate_limit") ||
    raw.includes("sms_send_frequency")
  ) {
    return {
      code: "OTP_RATE_LIMITED",
      message: "验证码请求过于频繁，请稍后再试。",
      status: 429,
      logCategory: "rate_limited",
    };
  }
  return {
    code: "OTP_SERVICE_UNAVAILABLE",
    message: "验证码服务暂时不可用，请稍后再试。",
    status: 503,
    logCategory: "provider_unavailable",
  };
}
