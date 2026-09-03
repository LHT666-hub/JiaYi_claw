import { expect, test } from "@playwright/test";

const showcaseApis = [
  "/api/v1/home",
  "/api/v1/service-requests",
  "/api/v1/health-observations",
  "/api/v1/account-deletion",
  "/api/v1/onboarding",
  "/api/v1/speech/transcribe",
  "/api/v1/memory/candidates?resident_id=10000000-0000-4000-8000-000000000001&status=pending",
  "/api/v1/memory/items?resident_id=10000000-0000-4000-8000-000000000001",
  "/api/v1/memory/preferences?resident_id=10000000-0000-4000-8000-000000000001",
  "/api/v1/memory/health-timeline?resident_id=10000000-0000-4000-8000-000000000001&months=3",
  "/api/v1/memory/context?resident_id=10000000-0000-4000-8000-000000000001",
  "/api/v1/consents",
  "/api/v1/family-links",
  "/api/v1/messages",
  "/api/v1/staff/work-queue",
  "/api/v1/staff/group-work-queue",
  "/api/v1/staff/care-bindings?status=pending",
  "/api/v1/admin/overview",
  "/api/v1/admin/care-network",
  "/api/v1/admin/service-catalog",
  "/api/v1/admin/staff",
  "/api/v1/admin/content-sources",
  "/api/v1/admin/channels",
  "/api/v1/admin/skills",
  "/api/v1/admin/rag/status",
  "/api/v1/admin/audit",
  "/api/v1/admin/feedback?status=open",
  "/api/v1/admin/readiness",
];

const showcasePages = [
  "/", "/ask", "/appointments", "/services", "/service-progress", "/messages",
  "/health-records", "/memory", "/tasks", "/courses", "/contacts", "/group",
  "/public-info", "/followup", "/family", "/family-link", "/notifications",
  "/notification-settings", "/privacy", "/account-security", "/me", "/support",
  "/doctor", "/workbench/requests", "/workbench/operations", "/admin",
  "/admin/care-network", "/admin/service-catalog", "/admin/staff",
  "/admin/content-sources", "/admin/channels", "/admin/skills", "/admin/audit",
  "/admin/feedback", "/admin/readiness", "/feedback", "/welcome", "/demo-center",
  "/service-requests/showcase-request",
];

test("演示环境无需验证码即可切换全部角色", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  await expect(page.getByText("全功能演示入口")).toBeVisible();
  for (const role of ["居民", "家属", "家庭医生", "团队护士", "临床药师", "社区支持", "管理员"]) {
    await expect(page.getByRole("button", { name: role, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "管理员", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "家医 Claw 管理后台" })).toBeVisible();
  await expect(page.getByText("服务工作队列")).toBeVisible();
});

test("演示环境核心居民、团队和管理接口全部开放", async ({ request }) => {
  for (const path of showcaseApis) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const payload = await response.json();
    expect(payload.data, path).toBeTruthy();
  }
});

test("演示环境允许模拟预约与团队状态动作", async ({ request }) => {
  const create = await request.post("/api/v1/service-requests", {
    headers: { "Idempotency-Key": "playwright-demo-create-001" },
    data: {
      serviceType: "clinic_registration",
      title: "门诊挂号协助",
      summary: "演示提交心内科挂号协助",
      priority: "low",
      requestedRole: "community",
      confirmed: true,
      appointment: {
        target: "协作医院",
        preferredDates: ["明天下午"],
        contactPhone: "13800138000",
        acceptWaitlist: true,
      },
    },
  });
  expect(create.status()).toBe(201);
  expect((await create.json()).data.simulated).toBe(true);

  const action = await request.post(
    "/api/v1/service-requests/showcase-request-overdue/actions/accept",
    {
      headers: { "Idempotency-Key": "playwright-demo-action-001" },
      data: { note: "演示受理" },
    },
  );
  expect(action.status()).toBe(200);
  expect((await action.json()).data.simulated).toBe(true);
});

test("居民可完整演示记忆确认、偏好编辑与健康轨迹", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "居民", exact: true }).click();
  await page.goto("/memory");

  await expect(page.getByText("最近一周早晨偶尔头晕")).toBeVisible();
  await page.getByRole("button", { name: "确认", exact: true }).first().click();
  await expect(page.getByText("最近一周早晨偶尔头晕")).toBeHidden();

  await page.getByRole("button", { name: "偏好", exact: true }).click();
  await expect(page.getByText("优先微信消息，紧急事项电话联系")).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  const input = page.getByPlaceholder("输入新值");
  await input.fill("优先微信，下午可以电话联系");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("优先微信，下午可以电话联系")).toBeVisible();

  await page.getByRole("button", { name: "健康轨迹", exact: true }).click();
  await expect(page.getByText("晨间血压 138/86 mmHg")).toBeVisible();
});

test("居民可模拟账号注销和提交正式反馈", async ({ request }) => {
  const deletion = await request.post("/api/v1/account-deletion", {
    data: { action: "request", reason: "演示注销流程" },
  });
  expect(deletion.status()).toBe(200);
  expect((await deletion.json()).data.request.status).toBe("pending");

  const feedback = await request.post("/api/v1/feedback", {
    headers: { "Idempotency-Key": "playwright-demo-feedback-001" },
    data: {
      category: "service",
      content: "演示环境提交的一条完整服务反馈。",
      contactAllowed: true,
      pagePath: "/support",
    },
  });
  expect(feedback.status()).toBe(201);
  expect((await feedback.json()).data.simulated).toBe(true);
});

test("体验中心全部页面可打开且不会被权限拦截", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "居民", exact: true }).click();

  for (const path of showcasePages) {
    const blocked: string[] = [];
    const watch = (response: { url(): string; status(): number }) => {
      if (response.url().includes("/api/") && response.status() >= 400) {
        blocked.push(`${response.status()} ${response.url()}`);
      }
    };
    page.on("response", watch);
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(250);
    page.off("response", watch);
    expect(response?.status(), path).toBeLessThan(400);
    expect(page.url(), path).not.toContain("/login");
    expect(blocked, `${path}\n${blocked.join("\n")}`).toEqual([]);
  }
});
