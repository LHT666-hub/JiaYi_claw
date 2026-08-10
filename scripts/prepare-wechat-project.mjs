import { writeFile } from "node:fs/promises";
import path from "node:path";

const appid = process.env.WECHAT_MINIPROGRAM_APP_ID?.trim();
if (!appid || !/^wx[a-zA-Z0-9]{16}$/.test(appid)) {
  console.error("WECHAT_MINIPROGRAM_APP_ID 未配置或格式不正确。");
  process.exit(1);
}

const target = path.resolve("apps/wechat/project.private.config.json");
const config = {
  appid,
  projectname: "家医 Claw",
  setting: { urlCheck: true, compileHotReLoad: false },
  condition: {},
};
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Generated ${target} for the configured WeChat AppID.`);
