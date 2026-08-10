import { expect, test } from "@playwright/test";

const ok = (data: unknown) => ({ ok: true, data, traceId: "e2e-trace" });

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
        policyVersion: "2026-07-18",
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
    resident: { id: "r1", display_name: "张阿姨", phone: "13800138000" },
  });
  await page.route("**/api/v1/staff/work-queue", (route) =>
    route.fulfill({ json: ok({ requests: [item()] }) }),
  );
  await page.route(
    "**/api/v1/service-requests/*/actions/accept",
    async (route) => {
      status = "accepted";
      await route.fulfill({ json: ok({ request: item() }) });
    },
  );
  await page.goto("/workbench/requests");
  await expect(page.getByText("张阿姨")).toBeVisible();
  await page.getByRole("button", { name: "受理", exact: true }).click();
  await expect(page.getByText("已受理")).toBeVisible();
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
  await expect(page.getByText("有效")).toBeVisible();
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
            summary: "本周开展慢病义诊。",
            original_url: "https://example.com/article",
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
    published = route.request().postDataJSON().decision === "publish";
    await route.fulfill({ json: ok({ item: { status: "published" } }) });
  });
  await page.goto("/workbench/operations");
  await page.getByRole("button", { name: /内容审核/ }).click();
  await expect(page.getByText("义诊活动")).toBeVisible();
  await page.getByRole("button", { name: "审核发布" }).click();
  await expect.poll(() => published).toBe(true);
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
        policyVersion: "2026-07-18",
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
  await page.route("**/api/v1/speech/transcribe", (route) =>
    route.fulfill({
      json: ok({
        text: "我想预约明天下午的家庭医生",
        provider: "whisper-wu-local",
        requiresConfirmation: true,
      }),
    }),
  );
  await page.goto("/ask");
  await page.getByRole("button", { name: "语音输入" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "resident-voice.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("RIFF-test-audio"),
  });
  await expect(
    page.getByText("我想预约明天下午的家庭医生", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用这段文字" }).click();
  await expect(
    page.getByPlaceholder("问服务、排班、活动或准备材料"),
  ).toHaveValue("我想预约明天下午的家庭医生");
});

test("Claw 只生成待确认预约草稿，不直接写入", async ({ page }) => {
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
