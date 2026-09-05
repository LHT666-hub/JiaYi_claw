import type { NextRequest } from "next/server";
import type { BuiltMemoryContext } from "@/lib/memory";

type TrustedAskContext = {
  residentMemory: BuiltMemoryContext | null;
};

const trustedAskRequests = new WeakMap<NextRequest, TrustedAskContext>();

export function markTrustedAskRequest(
  request: NextRequest,
  residentMemory: BuiltMemoryContext | null,
) {
  trustedAskRequests.set(request, { residentMemory });
  return request;
}

export function consumeTrustedAskContext(request: NextRequest) {
  const context = trustedAskRequests.get(request) ?? null;
  trustedAskRequests.delete(request);
  return context;
}
