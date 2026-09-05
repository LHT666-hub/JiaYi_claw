import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
  } else {
    process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
  }
});

describe("legacy ask route", () => {
  it("rejects direct POST requests outside demo mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    const response = await POST(
      new NextRequest("https://app.example/api/ask", {
        method: "POST",
        body: JSON.stringify({
          question: "你好",
          residentMemory: {
            identity: { residentId: "attacker-controlled" },
          },
        }),
      }),
    );

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("LEGACY_API_DISABLED");
  });

  it("rejects direct GET model dry-runs outside demo mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    const response = await GET(
      new NextRequest("https://app.example/api/ask?q=hello"),
    );

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("LEGACY_API_DISABLED");
  });
});
