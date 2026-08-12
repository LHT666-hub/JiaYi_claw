import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getPublicInfoById = vi.fn();
const getApiAuthContext = vi.fn();
const maybeSingle = vi.fn();
const contentQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  maybeSingle,
};
contentQuery.select.mockReturnValue(contentQuery);
contentQuery.eq.mockReturnValue(contentQuery);
contentQuery.or.mockReturnValue(contentQuery);
const createSupabasePublicServerClient = vi.fn(() => ({ from: vi.fn(() => contentQuery) }));

vi.mock("@/lib/publicInfoRepository", () => ({ getPublicInfoById }));
vi.mock("@/lib/supabase/server-auth", () => ({ getApiAuthContext }));
vi.mock("@/lib/supabase/server", () => ({ createSupabasePublicServerClient }));

afterEach(() => {
  vi.clearAllMocks();
  contentQuery.select.mockReturnValue(contentQuery);
  contentQuery.eq.mockReturnValue(contentQuery);
  contentQuery.or.mockReturnValue(contentQuery);
  createSupabasePublicServerClient.mockReturnValue({ from: vi.fn(() => contentQuery) });
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

  it("allows the exact link of a reviewed public content item without authentication", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "550e8400-e29b-41d4-a716-446655440001", title: "家医课堂", original_url: "https://hospital.example/classroom" }, error: null });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(
      "https://app.example/api/v1/links/resolve?contentId=550e8400-e29b-41d4-a716-446655440001&url=https%3A%2F%2Fhospital.example%2Fclassroom",
    ));

    expect(response.status).toBe(200);
    expect((await response.json()).data.sourceType).toBe("reviewed_content");
    expect(getApiAuthContext).not.toHaveBeenCalled();
  });

  it("rejects a public content link that is not the reviewed URL", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(
      "https://app.example/api/v1/links/resolve?contentId=550e8400-e29b-41d4-a716-446655440001&url=https%3A%2F%2Fevil.example%2Farticle",
    ));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("CONTENT_NOT_AVAILABLE");
    expect(getApiAuthContext).not.toHaveBeenCalled();
  });
});
