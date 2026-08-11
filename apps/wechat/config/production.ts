const productionConfig = {
  env: { NODE_ENV: '"production"' },
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE_URL || "https://example.invalid"),
    DEV_LOGIN_ENABLED: "false",
    OPERATOR_NAME: JSON.stringify(process.env.NEXT_PUBLIC_OPERATOR_NAME || "待配置"),
    PRIVACY_CONTACT: JSON.stringify(process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "待配置"),
    POLICY_VERSION: JSON.stringify("2026-08-11"),
  },
};
export default productionConfig;
