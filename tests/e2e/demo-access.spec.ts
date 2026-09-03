import { expect, test } from "@playwright/test";

const showcaseApis = [
  "/api/v1/home",
  "/api/v1/service-requests",
  "/api/v1/health-observations",
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
