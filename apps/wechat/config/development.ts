const configuredApiBaseUrl = process.env.TARO_APP_API_BASE_URL;
const apiBaseUrl = configuredApiBaseUrl === "__SAME_ORIGIN__"
  ? ""
  : (configuredApiBaseUrl || (process.env.TARO_ENV === "h5" ? "" : "http://127.0.0.1:3000")).replace(/\/+$/, "");

const developmentConfig = {
  env: { NODE_ENV: '"development"' },
  defineConstants: {
    API_BASE_URL: JSON.stringify(apiBaseUrl),
    DEV_LOGIN_ENABLED: JSON.stringify(process.env.TARO_APP_DEV_LOGIN !== "false"),
    OPERATOR_NAME: JSON.stringify(process.env.NEXT_PUBLIC_OPERATOR_NAME || "家医 Claw 本地测试"),
    PRIVACY_CONTACT: JSON.stringify(process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "本地测试环境"),
    POLICY_VERSION: JSON.stringify("2026-08-11"),
  },
};
export default developmentConfig;
