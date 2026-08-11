import { Button, Checkbox, Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, isLoggedIn, saveSession } from "../../lib/api";
import {
  resolvePrivacyAuthorization,
  subscribePrivacyAuthorization,
} from "../../lib/privacy";
import appIcon from "../../assets/brand/app-icon.png";

const PRIVACY_AGREE_BUTTON_ID = "jiayi-privacy-agree";
declare const DEV_LOGIN_ENABLED: boolean;

type VerifyResult = {
  needsOnboarding: boolean;
  session: { accessToken: string; refreshToken: string };
};

type AuthCapabilities = {
  sms: { available: boolean; unavailableMessage: string | null };
  wechat: { available: boolean; unavailableMessage: string | null };
  preferredResidentChannel: "wechat" | "sms" | null;
};

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [privacyAuthorizationNeeded, setPrivacyAuthorizationNeeded] =
    useState(false);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const otpValid = /^\d{6}$/.test(otp);

  useEffect(() => {
    if (isLoggedIn()) void Taro.switchTab({ url: "/pages/home/index" });
  }, []);

  useEffect(
    () =>
      subscribePrivacyAuthorization((request) =>
        setPrivacyAuthorizationNeeded(Boolean(request)),
      ),
    [],
  );

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const loadCapabilities = useCallback(async () => {
    setCapabilityError(false);
    setCapabilities(null);
    try {
      const result = await apiRequest<AuthCapabilities>("/api/v1/auth/capabilities", { auth: "optional" });
      setCapabilities(result);
      if (result.preferredResidentChannel === "sms") setSmsOpen(true);
    } catch {
      setCapabilityError(true);
    }
  }, []);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  async function wechatLogin(event: { detail: { code?: string; errMsg?: string } }) {
    if (!capabilities?.wechat.available) {
      Taro.showToast({ title: capabilities?.wechat.unavailableMessage ?? "微信登录尚未开放", icon: "none" });
      return;
    }
    if (!accepted) {
      Taro.showToast({ title: "请先同意隐私政策与用户协议", icon: "none" });
      return;
    }
    if (!event.detail.code) {
      Taro.showToast({ title: "未获得手机号授权，可使用短信登录", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      const login = await Taro.login();
      const data = await apiRequest<VerifyResult>("/api/v1/auth/wechat/verify", {
        method: "POST",
        data: { loginCode: login.code, phoneCode: event.detail.code },
        auth: "optional",
      });
      saveSession(data.session);
      Taro.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => data.needsOnboarding
        ? Taro.redirectTo({ url: "/pages/onboarding/index" })
        : Taro.switchTab({ url: "/pages/home/index" }), 300);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "微信登录失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp() {
    if (!capabilities?.sms.available) {
      Taro.showToast({ title: capabilities?.sms.unavailableMessage ?? "短信登录尚未开放", icon: "none" });
      return;
    }
    if (!accepted) {
      Taro.showToast({ title: "请先同意隐私政策与用户协议", icon: "none" });
      return;
    }
    if (!phoneValid) {
      Taro.showToast({ title: "请输入正确的 11 位手机号", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/api/v1/auth/otp/request", { method: "POST", data: { phone }, auth: "optional" });
      setSent(true);
      setCountdown(60);
      Taro.showToast({ title: "验证码已发送", icon: "success" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "发送失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!accepted) {
      Taro.showToast({ title: "请先同意隐私政策与用户协议", icon: "none" });
      return;
    }
    if (!otpValid) {
      Taro.showToast({ title: "请输入 6 位短信验证码", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<VerifyResult>("/api/v1/auth/otp/verify", {
        method: "POST",
        data: { phone, token: otp },
        auth: "optional",
      });
      saveSession(data.session);
      Taro.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => {
        if (data.needsOnboarding) Taro.redirectTo({ url: "/pages/onboarding/index" });
        else Taro.switchTab({ url: "/pages/home/index" });
      }, 300);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "验证失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function enterLocalPreview(role: "resident" | "family") {
    setLoading(true);
    try {
      const data = await apiRequest<VerifyResult>("/api/v1/auth/dev-session", {
        method: "POST",
        data: { role },
        auth: "optional",
      });
      saveSession(data.session);
      Taro.showToast({ title: role === "resident" ? "已进入居民预览" : "已进入家属预览", icon: "success" });
      setTimeout(() => data.needsOnboarding
        ? Taro.redirectTo({ url: "/pages/onboarding/index" })
        : Taro.switchTab({ url: "/pages/home/index" }), 300);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "本地预览不可用", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="page auth-page">
      <View className="auth-brand">
        <Image
          className="brand-mark-image"
          src={appIcon}
          mode="aspectFit"
          aria-label="家医 Claw"
        />
        <Text className="brand-title">家医 Claw</Text>
        <Text className="brand-subtitle">海湾镇居民家医服务入口</Text>
      </View>

      <View className="auth-entry">
        <View className="auth-entry-head">
          <View className="auth-entry-mark">医</View>
          <View className="grow">
            <Text className="auth-welcome">连接您的家医服务</Text>
            <Text className="auth-intro">首次验证后，可选择居民本人或家属代办身份。</Text>
          </View>
        </View>

        {!capabilities && !capabilityError ? <View className="auth-channel-loading"><View /><View /></View> : null}
        {(capabilityError || (capabilities && !capabilities.wechat.available && !capabilities.sms.available)) ? <View className="auth-channel-unavailable"><Text className="auth-channel-note-title">登录通道暂未开放</Text><Text>{capabilityError ? "暂时无法核验登录通道，请稍后重试。" : "微信和短信登录正在完成机构配置。"}</Text><Button className="auth-channel-retry pressable" onClick={() => void loadCapabilities()}>刷新状态</Button></View> : null}

        {capabilities && (capabilities.wechat.available || capabilities.sms.available) ? (
          <>
            <View className="consent-row" onClick={() => setAccepted((value) => !value)}>
              <Checkbox value="base-policy" checked={accepted} color="#2f6c56" />
              <Text>我已阅读并同意<Text className="legal-inline" onClick={(event) => { event.stopPropagation(); Taro.navigateTo({ url: "/pages/legal/index?doc=privacy" }); }}>《隐私政策》</Text>和<Text className="legal-inline" onClick={(event) => { event.stopPropagation(); Taro.navigateTo({ url: "/pages/legal/index?doc=agreement" }); }}>《用户协议》</Text></Text>
            </View>
            <Text className="auth-consent-note">健康信息、AI 辅助和通知将在首次建档时分别征得同意。</Text>
          </>
        ) : null}

        {capabilities?.wechat.available ? (
          <>
            <Button
              className="primary wechat-primary pressable"
              openType="getPhoneNumber"
              loading={loading}
              disabled={!accepted || loading}
              onGetPhoneNumber={wechatLogin}
            >
              微信手机号快捷登录
            </Button>
            <Text className="auth-secure-note">手机号仅用于账号验证和服务联系</Text>
          </>
        ) : null}

        {capabilities?.sms.available && capabilities.wechat.available ? (
          <View className="auth-divider"><View className="divider-line" /><Text>或</Text><View className="divider-line" /></View>
        ) : null}

        {capabilities?.sms.available && capabilities.wechat.available ? <Button
          className="sms-toggle pressable"
          onClick={() => {
            setSmsOpen((value) => !value);
            setSent(false);
            setOtp("");
          }}
        >
          {smsOpen ? "收起短信登录" : "使用短信验证码登录"}
        </Button> : null}

        {capabilities?.sms.available && (smsOpen || !capabilities.wechat.available) ? (
          <View className="sms-panel">
            {!capabilities.wechat.available ? <View className="sms-panel-head"><Text className="sms-panel-title">手机号验证</Text><Text className="sms-panel-copy">新用户验证后再完成居民或家属建档</Text></View> : null}
            <Text className="label">手机号</Text>
            <View className="phone-input">
              <Text className="country-code">+86</Text>
              <Input
                className="phone-field"
                type="number"
                maxlength={11}
                value={phone}
                onInput={(event) => setPhone(event.detail.value.replace(/\D/g, ""))}
                placeholder="请输入中国大陆手机号"
              />
            </View>
            {sent ? (
              <>
                <View className="otp-heading">
                  <Text className="label">短信验证码</Text>
                  <Text
                    className={countdown > 0 ? "otp-resend disabled" : "otp-resend"}
                    onClick={() => {
                      if (countdown === 0 && !loading) void requestOtp();
                    }}
                  >
                    {countdown > 0 ? `${countdown} 秒后重发` : "重新发送"}
                  </Text>
                </View>
                <Input
                   className="input otp-input"
                   type="number"
                   maxlength={6}
                  value={otp}
                  onInput={(event) => setOtp(event.detail.value.replace(/\D/g, ""))}
                  placeholder="请输入短信验证码"
                />
                <Button
                   className="primary pressable"
                   loading={loading}
                   disabled={!accepted || !otpValid || loading}
                  onClick={verify}
                >
                  验证并继续
                </Button>
                <Button
                  className="text-button"
                  onClick={() => {
                    setSent(false);
                    setOtp("");
                    setCountdown(0);
                  }}
                >
                  修改手机号
                </Button>
              </>
            ) : (
              <Button
                 className="secondary pressable"
                 loading={loading}
                 disabled={!accepted || !phoneValid || loading}
                onClick={requestOtp}
              >
                获取验证码
              </Button>
            )}
          </View>
        ) : null}

        {DEV_LOGIN_ENABLED ? (
          <View className="dev-preview">
            <Text className="dev-preview-label">本地开发预览</Text>
            <View className="dev-preview-actions">
              <Button className="dev-preview-button pressable" loading={loading} onClick={() => void enterLocalPreview("resident")}>居民端</Button>
              <Button className="dev-preview-button pressable" loading={loading} onClick={() => void enterLocalPreview("family")}>家属端</Button>
            </View>
          </View>
        ) : null}
      </View>
      <View className="auth-public-entry pressable" onClick={() => Taro.navigateTo({ url: "/pages/public-info/index" })}>
        <View className="auth-public-mark">查</View>
        <View className="grow"><Text className="auth-public-title">先查询公开服务信息</Text><Text className="auth-public-copy">门诊时间、活动和办理方式，无需登录</Text></View>
        <Text className="auth-public-arrow">›</Text>
      </View>
      <View className="auth-trust-row">
        <Text>机构核验</Text><View /><Text>授权可撤回</Text><View /><Text>操作可追踪</Text>
      </View>
      <View className="subtitle footer-note">服务导航、资料整理与人工协同，不替代医生诊疗。</View>
      {privacyAuthorizationNeeded ? (
        <View className="privacy-mask">
          <View className="privacy-dialog">
            <Text className="privacy-dialog-title">隐私保护提示</Text>
            <Text className="privacy-dialog-copy">
              为完成微信手机号登录，家医 Claw 需要在您明确同意后获取本次授权手机号。手机号用于身份验证和服务联系，不用于广告推送。
            </Text>
            <View className="legal-links privacy-dialog-links">
              <Text
                onClick={() =>
                  Taro.navigateTo({ url: "/pages/legal/index?doc=privacy" })
                }
              >
                查看隐私政策
              </Text>
              <Text
                onClick={() =>
                  Taro.navigateTo({ url: "/pages/legal/index?doc=agreement" })
                }
              >
                查看用户协议
              </Text>
            </View>
            <View className="privacy-dialog-actions">
              <Button
                className="privacy-dialog-cancel"
                onClick={() => resolvePrivacyAuthorization(false)}
              >
                暂不授权
              </Button>
              <Button
                id={PRIVACY_AGREE_BUTTON_ID}
                className="privacy-dialog-agree"
                onClick={() =>
                  resolvePrivacyAuthorization(
                    true,
                    PRIVACY_AGREE_BUTTON_ID,
                  )
                }
              >
                同意并继续
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
