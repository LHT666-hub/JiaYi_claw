const productionConfig = {
  env: { NODE_ENV: '"production"' },
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE_URL || "https://example.invalid"),
    DEV_LOGIN_ENABLED: "false",
  },
};
export default productionConfig;
