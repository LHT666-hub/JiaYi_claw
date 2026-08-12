import { defineConfig, type UserConfigExport, type UserConfigFn } from "@tarojs/cli";
import path from "node:path";

const createConfig: UserConfigFn = async (merge, { command, mode }) => {
  const base: UserConfigExport = {
    projectName: "jiayi-claw-wechat",
    date: "2026-07-10",
    designWidth: 750,
    deviceRatio: { 750: 1 },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    plugins: ["@tarojs/plugin-framework-react"],
    alias: {
      react: path.resolve(__dirname, "../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
    },
    compiler: {
      type: "webpack5",
      // Taro 4.2's optional development prebundle is incompatible with Node 24.
      // Regular webpack compilation remains enabled for both H5 preview and WeChat.
      prebundle: { enable: false },
    },
    cache: { enable: true },
    copy: {
      patterns: [{ from: "src/sitemap.json", to: "dist/sitemap.json" }],
      options: {},
    },
    mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      postcss: { cssModules: { enable: false } },
      devServer: {
        port: 10086,
        host: "127.0.0.1",
        proxy: [{ context: ["/api"], target: "http://127.0.0.1:3000", changeOrigin: true }],
      },
    },
  };
  const envConfig = (await import(`./${mode || command}.ts`)).default;
  return merge({}, base, envConfig);
};

export default defineConfig(createConfig);
