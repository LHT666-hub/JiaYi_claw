import { expect, test, type Page } from "@playwright/test";

const ok = (data: unknown) => ({ ok: true, data, traceId: "e2e-trace" });

async function mockAssistantSession(
  page: Page,
  activities: Array<Record<string, unknown>> = [],
) {
  await page.route("**/api/v1/assistant/session*", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ json: ok({ cleared: true }) });
      return;
    }
    await route.fulfill({
      json: ok({
        session: activities.length
          ? {
              id: "76000000-0000-0000-0000-000000000001",
              lastActivityAt: "2026-08-10T10:00:00.000Z",
              expiresAt: "2026-09-09T10:00:00.000Z",
              lastChannel: "wechat",
            }
          : null,
        activities,
        retentionDays: 30,
        rawTranscriptStored: false,
      }),
    });
  });
}

test("家属手机号 OTP 注册链路", async ({ page }) => {
  let requestBody: Record<string, unknown> = {};
  let onboardingBody: Record<string, unknown> = {};
  await page.route("**/api/v1/auth/otp/request", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      json: ok({ phone: "+86138****8000", retryAfterSeconds: 60 }),
    });
  });
  await page.route("**/api/v1/auth/otp/verify", (route) =>
    route.fulfill({
      json: ok({
        needsOnboarding: true,
        profile: {
          id: "10000000-0000-0000-0000-000000000001",
          role: "resident",
          display_name: "新用户",
          onboarding_completed_at: null,
        },
      }),
    }),
  );
  await page.route("**/api/v1/onboarding", async (route) => {
    if (route.request().method() === "POST") {
      onboardingBody = route.request().postDataJSON();
      await route.fulfill({
        json: ok({ nextPath: "/family-link", profile: { role: "family" } }),
      });
      return;
    }
    await route.fulfill({
      json: ok({
        profile: {
          display_name: "新用户",
          role: "resident",
          community_id: "11000000-0000-0000-0000-000000000001",
          onboarding_completed_at: null,
        },
        communities: [
          {
            id: "11000000-0000-0000-0000-000000000001",
            name: "海湾镇社区",
            district: "上海市奉贤区",
            address: null,
            service_phone: null,
          },
        ],
        consents: [],
        policyVersion: "2026-08-11",
      }),
    });
  });
  await page.route("**/api/v1/family-links", (route) =>
    route.fulfill({ json: ok({ role: "family", bindings: [] }) }),
  );
  await page.goto("/login");
  await page.getByPlaceholder("请输入中国大陆手机号").fill("13800138000");
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: /获取验证码/ }).click();
  await page.getByPlaceholder("6 位验证码").fill("123456");
  await page.getByRole("button", { name: /验证并继续/ }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: /家属代办/ }).click();
  await page.getByPlaceholder("例如：小王（张阿姨女儿）").fill("小王");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  const checkboxes = page.locator('input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await checkboxes.nth(2).check();
  await page.getByRole("button", { name: /完成并进入/ }).click();
  await expect(page).toHaveURL(/\/family-link/);
  expect(requestBody).toEqual({ phone: "13800138000" });
  expect(onboardingBody).toMatchObject({
    role: "family",
    displayName: "小王",
    consents: {
      privacy: true,
      sensitive_health: true,
      ai_processing: true,
      notification: true,
    },
  });
});

test("工作人员使用受邀手机号进入独立工作台入口", async ({ page }) => {
  let requestedPhone = "";
  await page.route("**/api/v1/auth/staff/otp/request", async (route) => {
    requestedPhone = route.request().postDataJSON().phone;
    await route.fulfill({
      json: ok({ phone: "+86138****0001", retryAfterSeconds: 60 }),
    });
  });
  await page.route("**/api/v1/auth/staff/otp/verify", (route) =>
    route.fulfill({
      json: ok({
        destination: "/doctor",
        profile: { role: "doctor", display_name: "李医生" },
      }),
    }),
  );

  await page.goto("/login");
  await expect(page.getByText("机构工作人员")).toBeVisible();
  await page.getByRole("link", { name: /工作入口/ }).click();
  await expect(page).toHaveURL(/\/staff\/login/);
  await page.getByPlaceholder("请输入中国大陆手机号").fill("13800000001");
  await page.getByRole("button", { name: /获取验证码/ }).click();
  await page.getByPlaceholder("6 位验证码").fill("123456");
  await page.getByRole("button", { name: /验证并继续/ }).click();
  await expect(page).toHaveURL(/\/doctor/);
  expect(requestedPhone).toBe("13800000001");
});

test("正式登录通道未配置时不提供无效验证码按钮", async ({ page }) => {
  await page.route("**/api/v1/auth/capabilities", (route) =>
    route.fulfill({
      json: ok({
        sms: {
          available: false,
          unavailableMessage: "短信登录正在开通，请稍后再试。",
        },
        staffSms: {
          available: false,
          unavailableMessage: "机构登录通道正在配置，请联系管理员。",
        },
        wechat: {
          available: false,
          unavailableMessage: "微信一键登录尚未完成配置。",
        },
        preferredResidentChannel: null,
      }),
    }),
  );

  await page.goto("/login");
  await expect(page.getByText("登录通道暂未开放")).toBeVisible();
  await expect(page.getByText("短信登录正在开通，请稍后再试。")).toBeVisible();
  await expect(page.getByRole("button", { name: /获取验证码/ })).toHaveCount(0);

  await page.goto("/staff/login");
  await expect(page.getByText("机构登录通道正在配置，请联系管理员。")).toBeVisible();
  await expect(page.getByRole("button", { name: /获取验证码/ })).toHaveCount(0);
});

test("未登录居民可以查询已审核公开信息", async ({ page }) => {
  await page.route("**/api/v1/auth/capabilities", (route) =>
    route.fulfill({
      json: ok({
        sms: { available: false, unavailableMessage: "短信登录正在开通" },
        staffSms: { available: false, unavailableMessage: "机构登录正在配置" },
        wechat: { available: false, unavailableMessage: "微信登录尚未配置" },
        preferredResidentChannel: null,
      }),
    }),
  );
  await page.route("**/api/v1/public-info*", (route) =>
    route.fulfill({
      json: ok({
        items: [{
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "海湾镇社区门诊时间",
          category: "门诊服务",
          content: "工作日门诊安排以机构当天公告为准。",
          sourceName: "海湾镇社区卫生服务中心",
          sourceUrl: "https://hospital.example/service-hours",
          verifiedAt: "2026-08-12T01:00:00.000Z",
          stale: false,
        }],
        query: "门诊时间",
        verifiedCount: 1,
      }),
    }),
  );

  await page.goto("/login");
  await page.getByRole("link", { name: /暂不登录，查询公开信息/ }).click();
  await expect(page).toHaveURL(/\/public-info/);
  await page.getByRole("button", { name: "门诊时间" }).click();
  await expect(page.getByText("海湾镇社区门诊时间")).toBeVisible();
  await expect(page.getByText("工作日门诊安排以机构当天公告为准。")).toBeVisible();
  await expect(page.getByRole("link", { name: /海湾镇社区卫生服务中心/ })).toHaveAttribute(
    "href",
    "https://hospital.example/service-hours",
  );
});

test("居民解除家属授权后页面即时更新", async ({ page }) => {
  let active = true;
  let revokedBindingId = "";
  await page.route("**/api/v1/family-links", async (route) => {
    if (route.request().method() === "DELETE") {
      revokedBindingId = route.request().postDataJSON().bindingId;
      active = false;
      await route.fulfill({
        json: ok({
          binding: {
            id: revokedBindingId,
            status: "disabled",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      json: ok({
        role: "resident",
        bindings: active
          ? [
              {
                id: "12000000-0000-0000-0000-000000000001",
                residentName: "张阿姨",
                familyName: "小王",
                relationship: "女儿",
                status: "active",
                isPrimary: true,
              },
            ]
          : [],
      }),
    });
  });

  await page.goto("/family-link");
  await expect(page.getByText("小王", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "解除授权" }).click();
  await expect.poll(() => revokedBindingId).toBe(
    "12000000-0000-0000-0000-000000000001",
  );
  await expect(page.getByText("尚未建立家属关系")).toBeVisible();
});

test("居民提交预约并明确确认写操作", async ({ page }) => {
  let submitted = false;
  await page.route("**/api/v1/service-requests", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON().confirmed === true;
      await route.fulfill({
        json: ok({
          deduplicated: false,
          request: { id: "20000000-0000-0000-0000-000000000001" },
        }),
      });
    } else await route.fulfill({ json: ok({ items: [] }) });
  });
  await page.goto("/appointments");
  await page.getByPlaceholder("这次主要想解决什么问题？").fill("高血压复诊");
  await page.locator('input[type="date"]').fill("2026-07-20");
  await page.getByPlaceholder("接收确认电话的手机号").fill("13800138000");
  await page.getByText("我确认以上信息准确").click();
  await page.getByRole("button", { name: /确认提交预约/ }).click();
  await expect.poll(() => submitted).toBe(true);
});

test("工作人员受理服务申请", async ({ page }) => {
  let status = "submitted";
  const item = () => ({
    id: "30000000-0000-0000-0000-000000000001",
    title: "门诊挂号协助",
    summary: "高血压复诊",
    status,
    priority: "low",
    service_type: "clinic_registration",
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    assigned_to: status === "submitted" ? null : "staff-1",
    resident: { id: "r1", display_name: "张阿姨", phone: "13800138000" },
    assignee: status === "submitted" ? null : { id: "staff-1", display_name: "李医生", role: "doctor" },
    service_request_events: [],
  });
  await page.route("**/api/v1/staff/work-queue", (route) =>
    route.fulfill({ json: ok({ profile: { id: "staff-1", role: "doctor", displayName: "李医生" }, requests: [item()] }) }),
  );
  let briefRequestUrl = "";
  await page.route("**/api/v1/residents/r1/clinical-brief?**", (route) => {
    briefRequestUrl = route.request().url();
    route.fulfill({ json: ok({ briefs: [{ id: "brief-1", summary: "居民希望高血压复诊，未提供近期血压。", structured_content: {}, source_refs: [], skill_id: "clinician-previsit-summary", skill_version: "1.0.0-cn.1", created_at: "2026-07-11T00:00:00Z" }] }) });
  });
  await page.route(
    "**/api/v1/service-requests/*/actions/accept",
    async (route) => {
      status = "accepted";
      await route.fulfill({ json: ok({ request: item() }) });
    },
  );
  await page.goto("/workbench/requests");
  await expect(page.getByText("张阿姨", { exact: true })).toBeVisible();
  await expect(page.getByText("居民希望高血压复诊，未提供近期血压。")).toBeVisible();
  await expect.poll(() => briefRequestUrl).toContain("serviceRequestId=30000000-0000-0000-0000-000000000001");
  await page.getByRole("button", { name: /受理申请/ }).click();
  await page.getByRole("button", { name: /确认并更新状态/ }).click();
  await expect(page.getByText("团队已受理").first()).toBeVisible();
});

test("居民从消息进入具体服务并确认团队时段", async ({ page }) => {
  const requestId = "31000000-0000-0000-0000-000000000001";
  let status = "awaiting_user_confirmation";
  let actionUsedIdempotency = false;
  const request = () => ({
    id: requestId,
    title: "家庭医生门诊预约",
    summary: "希望家庭医生查看近期血压记录。",
    service_type: "family_doctor_booking",
    status,
    created_at: "2026-08-13T01:00:00.000Z",
    updated_at: "2026-08-13T02:00:00.000Z",
    appointment_details: {
      scheduled_at: "2026-08-14T06:00:00.000Z",
      institution_name: "海湾镇社区卫生服务中心",
      department_name: "全科门诊",
      clinician_name: "李医生",
      booking_reference: null,
    },
    service_request_events: [
      { id: "event-1", action: "propose_slot", new_status: "awaiting_user_confirmation", note: "团队提出明天下午时段。", created_at: "2026-08-13T02:00:00.000Z" },
    ],
  });
  await page.route("**/api/v1/messages", (route) => route.fulfill({ json: ok({ messages: [{ id: "message-1", type: "service_progress", title: "请确认预约时间", content: "团队已提出明天下午时段。", link_url: `/service-requests/${requestId}`, is_read: false, created_at: "2026-08-13T02:00:00.000Z" }], channelBindings: [] }) }));
  await page.route(`**/api/v1/service-requests/${requestId}`, (route) => route.fulfill({ json: ok({ request: request() }) }));
  await page.route(`**/api/v1/service-requests/${requestId}/actions/confirm_booking`, async (route) => {
    actionUsedIdempotency = Boolean(route.request().headers()["idempotency-key"]);
    status = "booked";
    await route.fulfill({ json: ok({ request: request() }) });
  });

  await page.goto("/messages");
  await page.getByRole("button", { name: /请确认预约时间/ }).click();
  await expect(page).toHaveURL(new RegExp(`/service-requests/${requestId}$`));
  await expect(page.getByText("团队提出明天下午时段。")).toBeVisible();
  await page.getByRole("button", { name: "确认时间" }).click();
  await expect.poll(() => actionUsedIdempotency).toBe(true);
  await expect(page.getByText("预约成功", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认时间" })).toHaveCount(0);
});

test("公开信息回答展示来源与核验状态", async ({ page }) => {
  await page.route("**/api/v1/public-info?*", (route) =>
    route.fulfill({
      json: ok({
        items: [
          {
            id: "k1",
            category: "服务时间",
            title: "接种门诊时间",
            content: "周二上午开放",
            stale: false,
            sourceName: "海湾镇社区卫生服务中心",
            sourceUrl: "https://example.com/source",
            verifiedAt: "2026-07-10",
          },
        ],
      }),
    }),
  );
  await page.goto("/public-info");
  await page.getByPlaceholder("例如：接种门诊什么时候开").fill("接种门诊");
  await page.getByRole("button", { name: "搜索公开信息" }).click();
  await expect(page.getByText("接种门诊时间")).toBeVisible();
  await expect(page.getByText(/海湾镇社区卫生服务中心/)).toBeVisible();
  await expect(page.getByText("已核验")).toBeVisible();
});

test("居民从社区网络进入分级转诊协助", async ({ page }) => {
  await page.route("**/api/v1/home", (route) =>
    route.fulfill({
      json: ok({
        profile: { displayName: "张阿姨" },
        network: {
          name: "海湾镇家医协作网络",
          community: { name: "海湾镇社区卫生服务中心" },
          institutions: [
            {
              id: "40000000-0000-0000-0000-000000000001",
              name: "海湾镇社区卫生服务中心",
              institution_type: "community",
              level_label: "社区卫生服务中心",
              network_role: "primary_care",
              registration_url: null,
            },
            {
              id: "40000000-0000-0000-0000-000000000002",
              name: "正式协作医院",
              institution_type: "tertiary",
              level_label: "三级医院",
              network_role: "referral",
              registration_url: "https://example.com/register",
            },
          ],
        },
        serviceCatalog: [
          {
            id: "41000000-0000-0000-0000-000000000001",
            service_type: "referral_assistance",
            name: "分级转诊协助",
            description: "社区评估后协助上转。",
            service_hours: null,
          },
        ],
        schedules: [],
        content: [],
        serviceRequests: [],
        notifications: [],
      }),
    }),
  );
  await page.goto("/services");
  await expect(page.getByText("海湾镇家医协作网络")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /官方挂号入口/ }),
  ).toHaveAttribute("href", "https://example.com/register");
  await page.getByRole("link", { name: "请家医协助" }).last().click();
  await expect(page).toHaveURL(/\/appointments\?type=referral_assistance/);
});

test("管理员审核候选内容后才发布", async ({ page }) => {
  let published = false;
  let expiresAt = "";
  let reviewedTitle = "";
  let reviewedSummary = "";
  await page.route("**/api/v1/staff/care-bindings?status=pending", (route) =>
    route.fulfill({ json: ok({ bindings: [] }) }),
  );
  await page.route("**/api/v1/staff/group-work-queue", (route) =>
    route.fulfill({ json: ok({ candidates: [] }) }),
  );
  await page.route("**/api/v1/admin/content-sources", (route) =>
    route.fulfill({
      json: ok({
        sources: [],
        candidates: [
          {
            id: "50000000-0000-0000-0000-000000000001",
            source_name: "机构公众号",
            category: "activity",
            title: "义诊活动",
            summary: "本周开展慢病义诊，并提供家庭医生签约咨询。",
            original_url: "https://example.com/article",
            institution: { name: "海湾镇社区卫生服务中心" },
            published_at: "2026-08-01T00:00:00.000Z",
            ingested_at: "2026-08-13T08:00:00.000Z",
            previous_revision: {
              summary: "原定上周开展慢病义诊。",
              captured_at: "2026-08-12T08:00:00.000Z",
            },
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/admin/schedules", (route) =>
    route.fulfill({ json: ok({ schedules: [] }) }),
  );
  await page.route("**/api/v1/admin/broadcasts", (route) =>
    route.fulfill({ json: ok({ broadcasts: [] }) }),
  );
  await page.route("**/api/v1/admin/content-sources/review", async (route) => {
    const body = route.request().postDataJSON();
    published = body.decision === "publish";
    expiresAt = body.expiresAt;
    reviewedTitle = body.title;
    reviewedSummary = body.summary;
    await route.fulfill({ json: ok({ item: { status: "published" } }) });
  });
  await page.goto("/workbench/operations");
  await page.getByRole("button", { name: /内容审核/ }).click();
  await expect(page.getByText("义诊活动")).toBeVisible();
  await expect(page.getByText("海湾镇社区卫生服务中心")).toBeVisible();
  await expect(page.getByText("已发布内容有更新")).toBeVisible();
  await expect(page.getByText("原定上周开展慢病义诊。")).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: "本周开展慢病义诊，并提供家庭医生签约咨询。" })).toBeVisible();
  await expect(page.getByLabel("居民端审核摘要")).toHaveValue("本周开展慢病义诊，并提供家庭医生签约咨询。");
  await page.getByLabel("居民端标题").fill("本周慢病义诊与家医签约咨询");
  await page.getByLabel("居民端审核摘要").fill("本周开展慢病义诊，并提供家庭医生签约政策咨询，具体时间以官方原文为准。");
  await page.locator("select").selectOption("180");
  await page.getByRole("button", { name: "核对原文并发布" }).click();
  await expect.poll(() => published).toBe(true);
  await expect.poll(() => reviewedTitle).toBe("本周慢病义诊与家医签约咨询");
  await expect.poll(() => reviewedSummary).toContain("具体时间以官方原文为准");
  await expect.poll(() => new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(179 * 86_400_000);
});

test("居民端保持原版圆角手机视觉", async ({ page }) => {
  const home = {
    profile: { displayName: "张阿姨", role: "resident" },
    network: {
      name: "海湾镇家医协作网络",
      community: { name: "海湾镇社区卫生服务中心" },
      institutions: [],
    },
    serviceCatalog: [
      {
        id: "41000000-0000-0000-0000-000000000001",
        service_type: "clinic_registration",
        name: "门诊挂号协助",
        description: "团队核对号源并回写结果。",
        service_hours: null,
      },
      {
        id: "41000000-0000-0000-0000-000000000002",
        service_type: "family_doctor_booking",
        name: "家庭医生预约",
        description: "协调家医服务时间。",
        service_hours: null,
      },
      {
        id: "41000000-0000-0000-0000-000000000003",
        service_type: "referral_assistance",
        name: "分级转诊协助",
        description: "社区评估后协助上转。",
        service_hours: null,
      },
      {
        id: "41000000-0000-0000-0000-000000000004",
        service_type: "refill_request",
        name: "续方配药申请",
        description: "交由医生和药师处理。",
        service_hours: null,
      },
      {
        id: "41000000-0000-0000-0000-000000000005",
        service_type: "followup_reminder",
        name: "随访与复诊",
        description: "建立可追踪随访任务。",
        service_hours: null,
      },
      {
        id: "41000000-0000-0000-0000-000000000006",
        service_type: "report_explanation",
        name: "检查报告整理",
        description: "准备向医生提问。",
        service_hours: null,
      },
    ],
    schedules: [],
    content: [],
    serviceRequests: [],
    notifications: [],
  };
  await page.route("**/api/v1/home", (route) =>
    route.fulfill({ json: ok(home) }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("海湾镇家医协作网络")).toBeVisible();

  const shell = page.locator(".resident-ui").locator("..");
  await expect(shell).toHaveCSS("border-radius", "42px");
  await expect(page.locator("nav").locator(":scope > div")).toHaveCSS(
    "border-radius",
    "32px",
  );
  await expect(shell).toHaveScreenshot("resident-home-shell.png", {
    animations: "disabled",
  });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      shellWidth: document
        .querySelector<HTMLElement>(".resident-ui")
        ?.parentElement?.getBoundingClientRect().width,
    }));
    expect(metrics.pageWidth).toBe(metrics.viewport);
    expect(metrics.shellWidth).toBeLessThanOrEqual(430);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/services");
  await expect(page.getByText("快捷办理")).toBeVisible();
  await expect(page.locator(".resident-ui").locator("..")).toHaveScreenshot(
    "resident-services-shell.png",
    { animations: "disabled" },
  );
});

test("正式登录与首次建档保持移动端圆角视觉", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByPlaceholder("请输入中国大陆手机号")).toBeVisible();
  const loginShell = page.locator(".resident-ui").locator("..");
  await expect(loginShell).toHaveCSS("border-radius", "42px");
  await expect(loginShell).toHaveScreenshot("resident-login-shell.png", {
    animations: "disabled",
  });

  await page.route("**/api/v1/onboarding", (route) =>
    route.fulfill({
      json: ok({
        profile: {
          display_name: "新用户",
          role: "resident",
          community_id: "11000000-0000-0000-0000-000000000001",
          onboarding_completed_at: null,
        },
        communities: [
          {
            id: "11000000-0000-0000-0000-000000000001",
            name: "海湾镇社区",
            district: "上海市奉贤区",
            address: null,
            service_phone: "021-12345678",
          },
        ],
        consents: [],
        policyVersion: "2026-08-11",
      }),
    }),
  );
  await page.goto("/onboarding");
  await expect(page.getByText("建立您的家医服务档案")).toBeVisible();
  const onboardingShell = page.locator(".resident-ui").locator("..");
  await expect(onboardingShell).toHaveScreenshot(
    "resident-onboarding-shell.png",
    { animations: "disabled" },
  );
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.pageWidth).toBe(metrics.viewport);
});

test("居民语音先转写并确认文字", async ({ page }) => {
  await mockAssistantSession(page);
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        this.onstart?.();
      }

      stop() {
        this.onresult?.({
          results: [[{ transcript: "我想预约明天下午的家庭医生" }]],
        });
        this.onend?.();
      }

      abort() {
        this.onend?.();
      }
    }
    for (const property of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, property, {
        configurable: true,
        value: MockSpeechRecognition,
      });
    }
  });
  await page.goto("/ask");
  await expect(page.locator("nav")).toHaveCount(0);
  await page.getByRole("button", { name: "切换到语音输入" }).click();
  const holdToTalk = page.getByRole("button", {
    name: "按住说话，松开转文字",
  });
  await expect(holdToTalk).toContainText("按住说话");
  await holdToTalk.dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await expect(holdToTalk).toContainText("松开，转成文字");
  await holdToTalk.dispatchEvent("pointerup", { button: 0, pointerId: 1 });
  await expect(
    page.getByPlaceholder("问服务、排班、活动或准备材料"),
  ).toHaveValue("我想预约明天下午的家庭医生");
});

test("居民拍摄报告后先核对临时识别结果", async ({ page }) => {
  await mockAssistantSession(page);
  let uploaded = false;
  await page.route("**/api/v1/documents/analyze", async (route) => {
    uploaded = route.request().method() === "POST";
    await route.fulfill({
      json: ok({
        documentType: "lab_report",
        visibleText: ["血红蛋白 120 g/L", "参考范围 115 - 150 g/L"],
        plainSummary: ["图片中可见血红蛋白结果为 120 g/L。"],
        questionsForClinician: ["这个结果需要结合哪些情况一起看？"],
        uncertainItems: [],
        confidence: "high",
        safetyNotice: "识别结果可能有误，请以原始文件和医生核对为准。Claw 不提供诊断、处方或用药调整建议。",
        retained: false,
      }),
    });
  });
  await page.goto("/ask");
  await page.getByRole("button", { name: "添加附件" }).click();
  await expect(page.getByRole("button", { name: "拍照", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "相册", exact: true })).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "文件", exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "synthetic-report.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  await expect.poll(() => uploaded).toBe(true);
  await expect(page.getByText("化验报告", { exact: true })).toBeVisible();
  await expect(page.getByText("图片中可见血红蛋白结果为 120 g/L。"))
    .toBeVisible();
  await page.getByRole("button", { name: "核对文字并继续问 Claw" }).click();
  await expect(page.getByPlaceholder("问服务、排班、活动或准备材料"))
    .toHaveValue(/血红蛋白 120 g\/L/);
});

test("Claw 只生成待确认预约草稿，不直接写入", async ({ page }) => {
  await mockAssistantSession(page);
  let assistantBody: Record<string, unknown> = {};
  let serviceRequestCreated = false;
  await page.route("**/api/v1/assistant/messages", async (route) => {
    assistantBody = route.request().postDataJSON();
    await route.fulfill({
      json: ok({
        reply: {
          answer: "我已把心内科复诊诉求整理成办理草稿。",
          nextStep: "请核对科室、日期和联系电话后再提交。",
          source: "agent",
          riskLevel: "low",
          suggestDoctor: false,
        },
        actions: [
          {
            id: "start-clinic-registration",
            kind: "service",
            label: "核对并发起挂号协助",
            description: "确认资料后才会提交给家医团队。",
            href: "/appointments?type=clinic_registration&from=claw&target=%E5%BF%83%E5%86%85%E7%A7%91%E5%A4%8D%E8%AF%8A&department=%E5%BF%83%E5%86%85%E7%A7%91",
            requiresConfirmation: true,
          },
        ],
        writePerformed: false,
      }),
    });
  });
  await page.route("**/api/v1/service-requests", async (route) => {
    if (route.request().method() === "POST") serviceRequestCreated = true;
    await route.fulfill({ json: ok({ items: [] }) });
  });

  await page.goto("/ask");
  await page
    .getByPlaceholder("问服务、排班、活动或准备材料")
    .fill("帮我预约心内科复诊");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("核对并发起挂号协助")).toBeVisible();
  expect(assistantBody).toMatchObject({ question: "帮我预约心内科复诊" });
  expect(serviceRequestCreated).toBe(false);

  await page.getByText("核对并发起挂号协助").click();
  await expect(page).toHaveURL(/\/appointments\?.*from=claw/);
  await expect(page.getByText("Claw 已生成办理草稿")).toBeVisible();
  await expect(
    page.getByPlaceholder("这次主要想解决什么问题？"),
  ).toHaveValue("心内科复诊");
  expect(serviceRequestCreated).toBe(false);
});

test("Claw 遇到急症只提供立即拨打 120", async ({ page }) => {
  await mockAssistantSession(page);
  let serviceRequestCreated = false;
  await page.route("**/api/v1/assistant/messages", (route) =>
    route.fulfill({
      json: ok({
        reply: {
          answer: "这种情况不要等待线上回复，请立即拨打 120。",
          nextStep: "尽快寻求线下急救帮助。",
          source: "safety",
          riskLevel: "emergency",
          suggestDoctor: true,
        },
        actions: [
          {
            id: "call-120",
            kind: "emergency",
            label: "立即拨打 120",
            description: "紧急情况不要等待线上回复。",
            href: "tel:120",
            requiresConfirmation: false,
          },
        ],
        writePerformed: false,
      }),
    }),
  );
  await page.route("**/api/v1/service-requests", async (route) => {
    if (route.request().method() === "POST") serviceRequestCreated = true;
    await route.fulfill({ json: ok({ items: [] }) });
  });

  await page.goto("/ask");
  await page
    .getByPlaceholder("问服务、排班、活动或准备材料")
    .fill("伤口大出血怎么都止不住");
  await page.getByRole("button", { name: "发送" }).click();

  const emergencyLink = page.getByRole("link", { name: /立即拨打 120/ });
  await expect(emergencyLink).toBeVisible();
  await expect(emergencyLink).toHaveAttribute("href", "tel:120");
  await expect(page.getByText("需您核对确认后提交")).toHaveCount(0);
  expect(serviceRequestCreated).toBe(false);
});

test("Claw 恢复可清除的服务轨迹而不恢复对话原文", async ({ page }) => {
  await mockAssistantSession(page, [
    {
      id: "76000000-0000-0000-0000-000000000002",
      type: "service_draft_prepared",
      title: "已整理挂号协助草稿",
      detail: "原对话未保存；核对资料后才会提交给家医团队。",
      badge: "待确认",
      riskLevel: "low",
      occurredAt: "2026-08-10T10:00:00.000Z",
      primaryAction: {
        label: "继续办理",
        href: "/appointments?type=clinic_registration&from=claw",
      },
    },
  ]);

  await page.goto("/ask");
  await expect(page.getByText("继续上次服务")).toBeVisible();
  await expect(page.getByText("已整理挂号协助草稿")).toBeVisible();
  await page.getByRole("button", { name: /继续上次服务/ }).click();
  await expect(page.getByText("原对话未保存；核对资料后才会提交给家医团队。")).toBeVisible();
  await expect(page.getByRole("link", { name: "继续办理" })).toHaveAttribute(
    "href",
    "/appointments?type=clinic_registration&from=claw",
  );
  await page.getByRole("button", { name: /清除/ }).click();
  await expect(page.getByText("继续上次服务")).toHaveCount(0);
  await expect(page.getByText(/办理动作会形成可清除的服务轨迹/)).toBeVisible();
});

test("居民保存通知偏好并设置免打扰", async ({ page }) => {
  let saved: Record<string, unknown> = {};
  await page.route("**/api/v1/notification-preferences", async (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      await route.fulfill({
        json: ok({
          preferences: {
            service_updates: true,
            followup_reminders: true,
            content_updates: true,
            sms_enabled: false,
            wecom_enabled: true,
            wechat_mini_enabled: false,
            quiet_hours_start: "22:00",
            quiet_hours_end: "07:00",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      json: ok({
        preferences: {
          service_updates: true,
          followup_reminders: true,
          content_updates: false,
          sms_enabled: false,
          wecom_enabled: true,
          wechat_mini_enabled: false,
          quiet_hours_start: "21:00",
          quiet_hours_end: "08:00",
        },
      }),
    });
  });
  await page.goto("/notification-settings");
  await page.getByRole("switch").nth(2).click();
  await page.locator('input[type="time"]').nth(0).fill("22:00");
  await page.locator('input[type="time"]').nth(1).fill("07:00");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect
    .poll(() => saved)
    .toMatchObject({
      contentUpdates: true,
      wechatMiniEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
});

test("居民发起账号注销并获得冷静期", async ({ page }) => {
  let action = "";
  await page.route("**/api/v1/account-deletion", async (route) => {
    if (route.request().method() === "POST") {
      action = route.request().postDataJSON().action;
      await route.fulfill({
        json: ok({
          request: {
            id: "90000000-0000-0000-0000-000000000001",
            status: "pending",
            requested_at: "2026-07-18T00:00:00Z",
            scheduled_for: "2026-07-25T00:00:00Z",
          },
        }),
      });
      return;
    }
    await route.fulfill({ json: ok({ request: null }) });
  });
  await page.goto("/account-security");
  await page.getByLabel("请输入“确认注销”").fill("确认注销");
  await page.getByRole("button", { name: "提交账号注销申请" }).click();
  await expect.poll(() => action).toBe("request");
  await expect(page.getByText("注销申请处理中")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "撤销注销申请" }),
  ).toBeVisible();
});

test("登录前可以阅读隐私政策和用户协议", async ({ page }) => {
  await page.goto("/legal/privacy-policy");
  await expect(page.getByRole("heading", { name: "隐私政策" })).toBeVisible();
  await expect(
    page.getByText("医疗健康信息属于敏感个人信息", { exact: false }),
  ).toBeVisible();
  await page.goto("/legal/user-agreement");
  await expect(page.getByRole("heading", { name: "用户协议" })).toBeVisible();
  await expect(
    page.getByText("平台不提供诊断、处方、停药、换药", { exact: false }),
  ).toBeVisible();
});

test("居民在所属社区提交可追踪的问题反馈", async ({ page }) => {
  let submittedBody: Record<string, unknown> = {};
  let idempotencyKey = "";
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: ok({
        profile: { display_name: "张阿姨" },
        residentId: "10000000-0000-0000-0000-000000000001",
        network: {
          name: "海湾镇家医协作网络",
          community: {
            name: "海湾镇社区卫生服务中心",
            service_phone: "021-12345678",
            address: "上海市奉贤区海湾镇",
          },
        },
      }),
    }),
  );
  await page.route("**/api/v1/feedback", async (route) => {
    submittedBody = route.request().postDataJSON();
    idempotencyKey = route.request().headers()["idempotency-key"] ?? "";
    await route.fulfill({
      json: ok({
        feedback: { id: "92000000-0000-0000-0000-000000000001" },
        duplicate: false,
      }),
    });
  });

  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "海湾镇社区卫生服务中心" })).toBeVisible();
  await expect(page.getByRole("link", { name: /拨打 021-12345678/ })).toHaveAttribute(
    "href",
    "tel:021-12345678",
  );
  await page.getByLabel("问题类型").selectOption("bug");
  await page.getByLabel("具体情况").fill("我在预约确认页点击后没有看到新的进度，请工作人员帮忙核查。");
  await page.getByLabel("允许工作人员联系我").check();
  await page.getByRole("button", { name: "提交给服务团队" }).click();

  await expect(page.getByText("反馈已经收到")).toBeVisible();
  expect(submittedBody).toMatchObject({
    category: "bug",
    contactAllowed: true,
    residentId: "10000000-0000-0000-0000-000000000001",
    pagePath: "/support",
  });
  expect(idempotencyKey).toMatch(/^feedback:/);
});

test("社区工作人员处理居民反馈并记录结论", async ({ page }) => {
  let patchBody: Record<string, unknown> = {};
  await page.route("**/api/v1/admin/feedback**", async (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      await route.fulfill({ json: ok({ feedback: { id: patchBody.id, status: "resolved" } }) });
      return;
    }
    await route.fulfill({
      json: ok({
        feedback: [{
          id: "92000000-0000-0000-0000-000000000001",
          category: "bug",
          content: "我在预约确认页点击后没有看到新的进度，请工作人员帮忙核查。",
          contact_allowed: true,
          page_path: "/support",
          status: "open",
          resolution_note: null,
          created_at: "2026-08-12T02:00:00.000Z",
          updated_at: "2026-08-12T02:00:00.000Z",
          user: { display_name: "张阿姨", phone: "13800138000" },
          resident: { display_name: "张阿姨" },
        }],
      }),
    });
  });

  await page.goto("/admin/feedback");
  await expect(page.getByText("13800138000")).toBeVisible();
  await page.getByPlaceholder(/记录核查结果/).fill("已核查服务申请，进度通知已重新发送。 ");
  await page.getByRole("button", { name: "标记解决" }).click();

  await expect(page.getByText("我在预约确认页点击后没有看到新的进度")).toHaveCount(0);
  expect(patchBody).toMatchObject({
    id: "92000000-0000-0000-0000-000000000001",
    status: "resolved",
    resolutionNote: "已核查服务申请，进度通知已重新发送。",
  });
});

test("管理员创建并撤销工作人员邀请", async ({ page }) => {
  const inviteId = "94000000-0000-0000-0000-000000000001";
  let invites: Array<Record<string, unknown>> = [];
  let createBody: Record<string, unknown> = {};
  let revokedId = "";
  await page.route("**/api/v1/admin/staff**", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      createBody = route.request().postDataJSON();
      invites = [{ id: inviteId, phone: "+8613800000022", display_name: "周护士", role: "nurse", community_id: "11000000-0000-0000-0000-000000000001", status: "pending", created_at: "2026-08-13T02:00:00.000Z", expires_at: "2026-08-15T02:00:00.000Z" }];
      await route.fulfill({ status: 201, json: ok({ invite: invites[0], token: "a".repeat(43) }) });
      return;
    }
    if (method === "DELETE") {
      revokedId = new URL(route.request().url()).searchParams.get("id") ?? "";
      invites = invites.map((item) => ({ ...item, status: "revoked" }));
      await route.fulfill({ json: ok({ revoked: true }) });
      return;
    }
    await route.fulfill({ json: ok({
      staff: [{ id: "20000000-0000-0000-0000-000000000001", display_name: "李医生", role: "doctor", phone: "+8613800000001", community_id: "11000000-0000-0000-0000-000000000001", account_status: "active", created_at: "2026-08-01T02:00:00.000Z" }],
      invites,
      communities: [{ id: "11000000-0000-0000-0000-000000000001", name: "海湾镇社区" }],
    }) });
  });

  await page.goto("/admin/staff");
  await expect(page.getByRole("heading", { name: "工作人员与邀请" })).toBeVisible();
  await page.getByPlaceholder("姓名").fill("周护士");
  await page.getByPlaceholder("中国大陆手机号").fill("13800000022");
  await page.locator("select").nth(0).selectOption("nurse");
  await page.getByRole("button", { name: "生成一次性邀请" }).click();
  await expect(page.getByText("链接只在本次创建后显示")).toBeVisible();
  await expect(page.getByText("周护士")).toBeVisible();
  expect(createBody).toMatchObject({ phone: "13800000022", displayName: "周护士", role: "nurse" });
  await page.getByRole("button", { name: "撤销" }).click();
  await expect.poll(() => revokedId).toBe(inviteId);
});

test("受邀工作人员验证手机号后接受一次性邀请", async ({ page }) => {
  let acceptedToken = "";
  await page.route("**/api/v1/auth/capabilities", (route) => route.fulfill({ json: ok({ sms: { available: true }, staffSms: { available: true } }) }));
  await page.route("**/api/v1/auth/otp/request", (route) => route.fulfill({ json: ok({ phone: "+86138****0022", retryAfterSeconds: 60 }) }));
  await page.route("**/api/v1/auth/otp/verify", (route) => route.fulfill({ json: ok({ needsOnboarding: true, profile: { role: "resident" } }) }));
  await page.route("**/api/v1/staff-invites/accept", async (route) => {
    acceptedToken = route.request().postDataJSON().token;
    await route.fulfill({ json: ok({ profile: { role: "nurse", display_name: "周护士" } }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/staff-invite#token=${"a".repeat(43)}`);
  await page.getByPlaceholder("请输入中国大陆手机号").fill("13800000022");
  await page.getByRole("button", { name: /获取验证码/ }).click();
  await page.getByPlaceholder("6 位验证码").fill("123456");
  await page.getByRole("button", { name: /验证并继续/ }).click();
  await expect(page.getByText("身份已开通", { exact: true })).toBeVisible();
  expect(acceptedToken).toBe("a".repeat(43));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("管理员查询机构审计证据", async ({ page }) => {
  const requestedUrls: string[] = [];
  await page.route("**/api/v1/admin/audit**", async (route) => {
    requestedUrls.push(route.request().url());
    await route.fulfill({ json: ok({ logs: [{ id: "95000000-0000-0000-0000-000000000001", action: "staff_invite.created", target_table: "staff_invites", target_id: "94000000-0000-0000-0000-000000000001", detail: { role: "nurse" }, created_at: "2026-08-13T02:00:00.000Z", actor: { display_name: "管理员", role: "admin" } }] }) });
  });
  await page.goto("/admin/audit");
  await expect(page.getByText("创建人员邀请")).toBeVisible();
  await expect(page.getByText("管理员 · admin")).toBeVisible();
  await page.getByPlaceholder(/按动作筛选/).fill("staff_invite");
  await page.getByRole("button", { name: "查询" }).click();
  await expect.poll(() => requestedUrls.some((url) => url.includes("action=staff_invite"))).toBe(true);
});
