import { Button, Checkbox, Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  LogIn,
  MessageCircleMore,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react-taro";
import { apiRequest, isLoggedIn, saveSession } from "../../lib/api";
import appIcon from "../../assets/brand/app-icon.png";

declare const DEV_LOGIN_ENABLED: boolean;

type VerifyResult = {
  needsOnboarding: boolean;
  session: { accessToken: string; refreshToken: string };
};

type AuthCapabilities = {
  sms: { available: boolean; unavailableMessage: string | null };
  wechat: { available: boolean; unavailableMessage: string | null };
  preferredResidentChannel: "wechat" | "sms" | null;
  policyVersion: string;
};

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [devPreviewOpen, setDevPreviewOpen] = useState(false);
  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const otpValid = /^\d{6}$/.test(otp);

  useEffect(() => {
    if (isLoggedIn()) void Taro.switchTab({ url: "/pages/home/index" });
  }, []);

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
        data: {
          loginCode: login.code,
          phoneCode: event.detail.code,
          privacyAccepted: true,
          policyVersion: capabilities.policyVersion,
        },
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
        data: {
          phone,
          token: otp,
          privacyAccepted: true,
          policyVersion: capabilities?.policyVersion,
        },
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
      <View className="auth-hero">
        <View className="auth-brand-line">
          <Image
            className="brand-mark-image"
            src={appIcon}
            mode="aspectFit"
            aria-label="家医 Claw"
          />
          <View className="grow auth-brand-copy">
            <Text className="brand-title">家医 Claw</Text>
            <Text className="auth-pilot-badge">海湾镇家庭医生服务</Text>
          </View>
        </View>
        <Text className="auth-hero-title">有事，先问家医</Text>
        <Text className="auth-hero-copy">把问题讲给 Claw，它会帮您查清楚、理好资料，再交给家医团队接着办。</Text>
        <View className="auth-capability-row">
          <View className="auth-capability-item">
            <View className="auth-capability-icon green"><MessageCircleMore size={20} color="#2F6C56" /></View>
            <Text>问公开信息</Text>
          </View>
          <View className="auth-capability-item">
            <View className="auth-capability-icon blue"><CalendarCheck2 size={20} color="#315B7D" /></View>
            <Text>办预约转诊</Text>
          </View>
          <View className="auth-capability-item">
            <View className="auth-capability-icon red"><ClipboardList size={20} color="#A64F45" /></View>
            <Text>整理就诊资料</Text>
          </View>
        </View>
      </View>

      <View className="auth-entry">
        <View className="auth-entry-head">
          <View className="auth-entry-mark"><ShieldCheck size={25} color="#2F6C56" strokeWidth={2} /></View>
          <View className="grow">
            <Text className="auth-welcome">继续使用个人服务</Text>
            <Text className="auth-intro">居民本人和家属都可使用</Text>
          </View>
        </View>

        {!capabilities && !capabilityError ? <View className="auth-channel-loading"><View /><View /></View> : null}
        {(capabilityError || (capabilities && !capabilities.wechat.available && !capabilities.sms.available)) ? (
          <View className="auth-channel-unavailable">
            <View className="auth-channel-status-line">
              <View className="auth-channel-status-dot" />
              <Text>{capabilityError ? "服务状态待确认" : "个人服务通道接入中"}</Text>
            </View>
            <Text className="auth-channel-note-title">公开服务可以直接查看</Text>
            <Text className="auth-channel-note-copy">{capabilityError ? "暂时无法核验身份通道。您可先查看已审核的门诊、排班、活动和办事说明。" : "机构尚未开放居民身份验证。预约、健康资料和进度查询将在验证通道开通后开放。"}</Text>
            <View className="auth-unavailable-actions">
              <Button className="auth-public-primary pressable" onClick={() => Taro.navigateTo({ url: "/pages/public-info/index" })}>
                <BookOpen size={19} color="#FFFFFF" />
                <Text>进入公开服务</Text>
              </Button>
              <Button className="auth-channel-retry pressable" onClick={() => void loadCapabilities()} aria-label="刷新登录状态"><RefreshCw size={18} color="#102A43" /></Button>
            </View>
          </View>
        ) : null}

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
              <LogIn size={21} color="#FFFFFF" strokeWidth={2.1} />
              <Text>微信手机号快捷登录</Text>
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
          <MessageSquareText size={19} color="#557C6C" strokeWidth={2.1} />
          <Text>{smsOpen ? "收起短信登录" : "使用短信验证码登录"}</Text>
        </Button> : null}

        {capabilities?.sms.available && (smsOpen || !capabilities.wechat.available) ? (
          <View className="sms-panel">
            {!capabilities.wechat.available ? <Text className="sms-panel-copy">验证手机号后，系统会查找您的家医签约与家属代办关系</Text> : null}
            <Text className="label">手机号码</Text>
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

      </View>
      {capabilities && (capabilities.wechat.available || capabilities.sms.available) ? (
        <View className="auth-public-entry pressable" onClick={() => Taro.navigateTo({ url: "/pages/public-info/index" })}>
          <View className="auth-public-mark"><BookOpen size={22} color="#2F6C56" strokeWidth={2} /></View>
          <View className="grow"><Text className="auth-public-title">暂不登录，先看公开服务</Text><Text className="auth-public-copy">门诊、排班、活动和办事说明</Text></View>
          <ChevronRight className="auth-public-arrow" size={20} color="rgba(16,42,67,.34)" />
        </View>
      ) : null}
      {DEV_LOGIN_ENABLED ? (
        <View className="dev-preview-compact">
          <Text className="dev-preview-toggle" onClick={() => setDevPreviewOpen((value) => !value)}>
            {devPreviewOpen ? "收起本地预览" : "本地预览入口"}
          </Text>
          {devPreviewOpen ? <View className="dev-preview-actions">
            <Button className="dev-preview-button pressable" loading={loading} onClick={() => void enterLocalPreview("resident")}><UserRound size={18} color="#557C6C" /><Text>居民端</Text></Button>
            <Button className="dev-preview-button pressable" loading={loading} onClick={() => void enterLocalPreview("family")}><UsersRound size={18} color="#557C6C" /><Text>家属端</Text></Button>
          </View> : null}
        </View>
      ) : null}
      <View className="auth-trust-row">
        <Text>家医团队协同</Text><View /><Text>按需授权</Text><View /><Text>操作有记录</Text>
      </View>
      <View className="subtitle footer-note">Claw 提供服务导航与资料整理，不替代医生诊疗</View>
    </View>
  );
}
