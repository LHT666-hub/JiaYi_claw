import { NextResponse } from "next/server";

export function createTraceId() {
  return crypto.randomUUID();
}

export function apiOk<T>(data: T, traceId = createTraceId(), status = 200) {
  return NextResponse.json({ ok: true, data, traceId }, { status });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  traceId = createTraceId(),
) {
  return NextResponse.json({ ok: false, error: { code, message }, traceId }, { status });
}

export function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "UNKNOWN_ERROR";
}
