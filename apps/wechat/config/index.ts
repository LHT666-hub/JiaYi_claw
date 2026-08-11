import { defineConfig, type UserConfigExport, type UserConfigFn } from "@tarojs/cli";

const createConfig: UserConfigFn = async (merge, { command, mode }) => {
  const base: UserConfigExport = {
    projectName: "jiayi-claw-wechat",
    date: "2026-07-10",
    designWidth: 750,
    deviceRatio: { 750: 1 },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    compiler: "webpack5",
    cache: { enable: true },
    copy: {
      patterns: [{ from: "src/sitemap.json", to: "dist/sitemap.json" }],
      options: {},
    },
    mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
  };
  const envConfig = (await import(`./${mode || command}.ts`)).default;
  return merge({}, base, envConfig);
};

export default defineConfig(createConfig);
