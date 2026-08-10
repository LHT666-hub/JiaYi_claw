const developmentConfig = { env: { NODE_ENV: '"development"' }, defineConstants: { API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE_URL || "http://127.0.0.1:3020") } };
export default developmentConfig;
