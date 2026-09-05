import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  consumeTrustedAskContext,
  markTrustedAskRequest,
} from "./internalAskRequest";

describe("internal ask request trust boundary", () => {
  it("accepts only the exact request object marked by the v1 orchestrator", () => {
    const request = new NextRequest("https://app.example/api/ask", {
      method: "POST",
    });
    const otherRequest = new NextRequest("https://app.example/api/ask", {
      method: "POST",
    });

    markTrustedAskRequest(request, null);

    expect(consumeTrustedAskContext(otherRequest)).toBeNull();
    expect(consumeTrustedAskContext(request)).toEqual({ residentMemory: null });
  });

  it("consumes trust exactly once", () => {
    const request = new NextRequest("https://app.example/api/ask", {
      method: "POST",
    });

    markTrustedAskRequest(request, null);

    expect(consumeTrustedAskContext(request)).not.toBeNull();
    expect(consumeTrustedAskContext(request)).toBeNull();
  });
});
