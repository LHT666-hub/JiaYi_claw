import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getPublicInfoById = vi.fn();
const getApiAuthContext = vi.fn();

vi.mock("@/lib/publicInfoRepository", () => ({ getPublicInfoById }));
vi.mock("@/lib/supabase/server-auth", () => ({ getApiAuthContext }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("official link resolver", () => {
  it("allows an unauthenticated visitor to open the exact source of published public information", async () => {
    getPublicInfoById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "海湾镇门诊时间",
      sourceUrl: "https://hospital.example/service-hours",
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(
      "https://app.example/api/v1/links/resolve?publicInfoId=550e8400-e29b-41d4-a716-446655440000&url=https%3A%2F%2Fhospital.example%2Fservice-hours",
    ));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      sourceType: "public_info",
      url: "https://hospital.example/service-hours",
    });
    expect(getApiAuthContext).not.toHaveBeenCalled();
  });

  it("rejects a URL that does not match the reviewed public information source", async () => {
    getPublicInfoById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "海湾镇门诊时间",
      sourceUrl: "https://hospital.example/service-hours",
    });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(
      "https://app.example/api/v1/links/resolve?publicInfoId=550e8400-e29b-41d4-a716-446655440000&url=https%3A%2F%2Fevil.example%2Fphishing",
    ));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("PUBLIC_INFO_SOURCE_MISMATCH");
    expect(getApiAuthContext).not.toHaveBeenCalled();
  });

  it("still requires authentication for arbitrary service and institution links", async () => {
    getApiAuthContext.mockResolvedValue({ supabase: null, profile: null });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(
      "https://app.example/api/v1/links/resolve?url=https%3A%2F%2Fhospital.example%2Fregistration",
    ));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });
});
