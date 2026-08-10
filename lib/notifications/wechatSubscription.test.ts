import { afterEach, describe, expect, it } from "vitest";
import {
  buildWechatSubscriptionData,
  getWechatSubscriptionTemplates,
  indexLatestSubscriptionGrant,
} from "./wechatSubscription";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("WeChat subscription delivery", () => {
  it("builds template data and applies WeChat field limits", () => {
    expect(
      buildWechatSubscriptionData(
        {
          title: "thing1",
          status: "phrase2",
          updatedAt: "time3",
          note: "thing4",
        },
        {
          title: "家医服务进度更新提醒",
          status: "等待居民确认时段",
          updatedAt: "2026-08-10 21:45",
          note: "工作人员已提出新的可选时间，请进入小程序确认。",
        },
      ),
    ).toEqual({
      thing1: { value: "家医服务进度更新提醒" },
      phrase2: { value: "等待居民确" },
      time3: { value: "2026-08-10 21:45" },
      thing4: { value: "工作人员已提出新的可选时间，请进入小程序" },
    });
  });

  it("exposes only fully configured templates", () => {
    process.env.WECHAT_SUBSCRIBE_SERVICE_TEMPLATE_ID = "template-service";
    process.env.WECHAT_SUBSCRIBE_SERVICE_FIELD_MAP = JSON.stringify({
      title: "thing1",
      status: "phrase2",
      updatedAt: "time3",
      note: "thing4",
    });
    process.env.WECHAT_SUBSCRIBE_FOLLOWUP_TEMPLATE_ID = "template-followup";
    process.env.WECHAT_SUBSCRIBE_FOLLOWUP_FIELD_MAP = "not-json";

    expect(getWechatSubscriptionTemplates()).toEqual([
      expect.objectContaining({
        key: "service_update",
        id: "template-service",
      }),
    ]);
  });

  it("keeps the newest decision when a template has multiple grants", () => {
    const latest = indexLatestSubscriptionGrant([
      { template_id: "service", decision: "accept", requested_at: "new" },
      { template_id: "followup", decision: "reject", requested_at: "new" },
      { template_id: "service", decision: "ban", requested_at: "old" },
    ]);

    expect(latest.service.decision).toBe("accept");
    expect(latest.followup.decision).toBe("reject");
  });
});
