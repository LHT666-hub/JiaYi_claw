import { chromium } from "playwright";

const baseUrl = process.env.MOBILE_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const routes = [
  "/",
  "/services",
  "/messages",
  "/me",
  "/ask",
  "/ask/history",
  "/appointments",
  "/health-records",
  "/family",
  "/memory",
  "/courses",
  "/contacts",
  "/tasks",
  "/privacy",
  "/login",
  "/onboarding",
  "/doctor",
  "/workbench/requests",
  "/workbench/operations",
  "/admin",
  "/admin/content-sources",
  "/admin/readiness",
];
const viewports = [
  { width: 320, height: 568, label: "small-phone" },
  { width: 360, height: 640, label: "android-compact" },
  { width: 375, height: 812, label: "iphone-compact" },
  { width: 390, height: 844, label: "iphone-standard" },
  { width: 412, height: 915, label: "android-standard" },
  { width: 430, height: 932, label: "large-phone" },
  { width: 844, height: 390, label: "phone-landscape" },
];

const browser = await chromium.launch({ channel: "msedge" });
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);
      const metrics = await page.evaluate(() => {
        const controls = [...document.querySelectorAll("button, a, input:not([type=file]), textarea, select")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 1 && rect.height > 1;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label: (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40),
              left: rect.left,
              right: rect.right,
            };
          })
          .filter((element) => element.left < -1 || element.right > window.innerWidth + 1);
        const frame = document.querySelector(".phone-shell-frame")?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          frameWidth: frame?.width ?? null,
          frameHeight: frame?.height ?? null,
          controls,
        };
      });
      if (
        metrics.documentWidth > metrics.viewportWidth ||
        (metrics.frameWidth !== null && metrics.frameWidth > Math.min(430, metrics.viewportWidth)) ||
        (metrics.frameHeight !== null && metrics.frameHeight > metrics.viewportHeight) ||
        metrics.controls.length
      ) {
        failures.push({ viewport: viewport.label, route, ...metrics });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Mobile layout audit passed: ${routes.length} routes x ${viewports.length} viewports.`);
