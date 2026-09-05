import { describe, expect, it } from "vitest";
import { getShareableAskCacheKey } from "./askCachePolicy";

describe("ask cache policy", () => {
  it("keeps shared caching for non-personalized prompts", () => {
    expect(getShareableAskCacheKey("general::hello", "")).toBe(
      "general::hello",
    );
  });

  it("disables shared caching when resident memory is present", () => {
    expect(
      getShareableAskCacheKey(
        "general::hello",
        "<memory_data>resident context</memory_data>",
      ),
    ).toBeNull();
  });
});
