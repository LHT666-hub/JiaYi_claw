import { readFile } from "node:fs/promises";
import path from "node:path";

const requestedBaseUrl = process.env.TARO_APP_API_BASE_URL?.trim();
const baseUrl = (requestedBaseUrl && requestedBaseUrl !== "__SAME_ORIGIN__"
  ? requestedBaseUrl
  : process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3000").replace(/\/+$/, "");

const checks = [];
function record(label, status, detail) {
  checks.push({ label, status, detail });
}

async function readProjectAppId() {
  for (const file of ["project.private.config.json", "project.config.json"]) {
    try {
      const source = await readFile(path.resolve("apps/wechat", file), "utf8");
      const appid = JSON.parse(source).appid;
      if (appid) return { appid, file };
    } catch {
      // The private config is expected to be absent before formal release setup.
    }
  }
  return { appid: "", file: "" };
}

const { appid, file } = await readProjectAppId();
const formalAppId = /^wx[a-zA-Z0-9]{16}$/.test(appid) && !/^wx0{16}$/i.test(appid);
record(
  "微信项目 AppID",
  formalAppId ? "ready" : "preview",
  formalAppId ? `${file} 已配置正式 AppID` : "当前为 touristappid，仅能本地预览，不能上传审核",
);

try {
  const url = new URL(baseUrl);
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  record(
    "小程序 API 地址",
    url.protocol === "https:" ? "ready" : local ? "local" : "blocked",
    baseUrl,
  );
} catch {
  record("小程序 API 地址", "blocked", `${baseUrl} 不是有效 URL`);
}

let apiReachable = false;
try {
  const response = await fetch(`${baseUrl}/api/v1/auth/capabilities`, {
    headers: { "X-Client-Platform": "weapp" },
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok || !payload?.data) throw new Error(`HTTP ${response.status}`);
  apiReachable = true;
  const capabilities = payload.data;
  record("后端 API", "ready", "能力探测接口可访问");
  record(
    "居民登录",
    capabilities.wechat?.available || capabilities.sms?.available ? "ready" : "blocked",
    capabilities.wechat?.available
      ? "微信手机号快捷登录已开放"
      : capabilities.sms?.available
        ? "短信验证码可用；微信快捷登录尚未配置"
        : "微信和短信身份通道均未开放，只能查看公开服务",
  );
} catch (error) {
  record("后端 API", "blocked", error instanceof Error ? error.message : "无法访问能力探测接口");
}

if (apiReachable) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/public-hub`, {
      headers: { "X-Client-Platform": "weapp" },
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(`HTTP ${response.status}`);
    record("访客公开服务", "ready", "未登录居民可打开排班、活动和办事信息入口");
  } catch (error) {
    record("访客公开服务", "blocked", error instanceof Error ? error.message : "公开服务接口不可访问");
  }
}

const symbols = { ready: "[OK]", local: "[LOCAL]", preview: "[PREVIEW]", blocked: "[BLOCKED]" };
console.log("\n家医 Claw 小程序启动诊断\n");
for (const check of checks) console.log(`${symbols[check.status]} ${check.label}: ${check.detail}`);
console.log("\n开发者工具导入目录: apps/wechat");
console.log("开发编译命令: npm run dev:wechat");
if (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
  console.log("本地新居民测试: 13800000003 / 123456（需要本地 Supabase 按当前 config 启动）");
}
console.log("正式发布检查: npm run check:release\n");

if (checks.some((check) => check.status === "blocked")) process.exitCode = 1;
