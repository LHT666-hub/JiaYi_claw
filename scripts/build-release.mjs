import { spawnSync } from "node:child_process";
import process from "node:process";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

run(process.execPath, ["scripts/check-release-env.mjs"]);
run(process.execPath, ["scripts/prepare-wechat-project.mjs"]);
run(npm, ["run", "build:all"]);
run(process.execPath, ["scripts/verify-wechat-package.mjs", "--strict"]);
