import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve("apps/wechat/dist");
const strict = process.argv.includes("--strict");
const errors = [];

async function readJson(file) {
  try {
    return JSON.parse(await readFile(path.join(root, file), "utf8"));
  } catch {
    errors.push(`${file}: 缺失或不是有效 JSON`);
    return null;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

const app = await readJson("app.json");
const sitemap = await readJson("sitemap.json");
if (app) {
  if (app.__usePrivacyCheck__ !== true) errors.push("app.json: 必须启用 __usePrivacyCheck__");
  if (!app.permission?.["scope.record"]?.desc) errors.push("app.json: 缺少录音用途说明");
  if (app.sitemapLocation !== "sitemap.json") errors.push("app.json: 未声明隐私 sitemap");
  if (app.tabBar?.list?.length !== 4) errors.push("app.json: 居民端必须保留首页、服务、消息、我的四栏");
  for (const requiredPage of [
    "pages/home/index",
    "pages/services/index",
    "pages/messages/index",
    "pages/me/index",
    "pages/login/index",
    "pages/appointments/index",
    "pages/progress/index",
    "pages/health-records/index",
    "pages/public-info/index",
    "pages/browser/index",
  ]) {
    if (!app.pages?.includes(requiredPage)) errors.push(`app.json: 缺少正式居民页面 ${requiredPage}`);
  }
  for (const item of app.tabBar?.list ?? []) {
    for (const key of ["iconPath", "selectedIconPath"]) {
      if (!item[key]) {
        errors.push(`app.json: ${item.text ?? item.pagePath} 缺少 ${key}`);
        continue;
      }
      try {
        await stat(path.join(root, item[key]));
      } catch {
        errors.push(`app.json: 底栏图标 ${item[key]} 不存在`);
      }
    }
  }
  for (const page of app.pages ?? []) {
    for (const extension of ["js", "json", "wxml"]) {
      try {
        await stat(path.join(root, `${page}.${extension}`));
      } catch {
        errors.push(`${page}.${extension}: 页面编译产物缺失`);
      }
    }
  }
}
if (!sitemap?.rules?.some((rule) => rule.action === "disallow" && rule.page === "*")) {
  errors.push("sitemap.json: 健康服务页面必须禁止微信搜索索引");
}

const files = await walk(root).catch(() => []);
let totalBytes = 0;
let javascript = "";
for (const file of files) {
  totalBytes += (await stat(file)).size;
  if (file.endsWith(".js")) javascript += await readFile(file, "utf8");
}
if (totalBytes > 2 * 1024 * 1024) errors.push(`主包体积 ${(totalBytes / 1024 / 1024).toFixed(2)} MB，超过 2 MB 门限`);
for (const marker of ["本地开发预览", "/api/v1/auth/dev-session", "DEV_LOGIN_ENABLED"]) {
  if (javascript.includes(marker)) errors.push(`生产包泄漏开发入口标记：${marker}`);
}
for (const marker of ["/pages/public-info/index", "publicInfoId"]) {
  if (!javascript.includes(marker)) errors.push(`生产包缺少访客公开信息闭环标记：${marker}`);
}

if (strict) {
  const privateConfigPath = path.resolve("apps/wechat/project.private.config.json");
  try {
    const privateConfig = JSON.parse(await readFile(privateConfigPath, "utf8"));
    if (!/^wx[a-zA-Z0-9]{16}$/.test(privateConfig.appid ?? "")) errors.push("project.private.config.json: 正式 AppID 无效");
  } catch {
    errors.push("project.private.config.json: 未生成正式微信项目配置");
  }
  if (javascript.includes("https://example.invalid")) errors.push("生产包仍包含占位 API 域名");
  const apiBase = process.env.TARO_APP_API_BASE_URL?.trim();
  if (!apiBase || !javascript.includes(apiBase)) errors.push("生产包未编译配置的 TARO_APP_API_BASE_URL");
}

if (errors.length) {
  console.error("\n微信小程序包验证失败：\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Verified WeChat package: ${app?.pages?.length ?? 0} pages, ${files.length} files, ${(totalBytes / 1024).toFixed(1)} KB, privacy and production-boundary checks passed.`);
