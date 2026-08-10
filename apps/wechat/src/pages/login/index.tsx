import { Button, Checkbox, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { apiRequest, saveSession } from "../../lib/api";
import {
  resolvePrivacyAuthorization,
  subscribePrivacyAuthorization,
} from "../../lib/privacy";

const PRIVACY_AGREE_BUTTON_ID = "jiayi-privacy-agree";

type VerifyResult = {
  needsOnboarding: boolean;
  session: { accessToken: string; refreshToken: string };
};

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [privacyAuthorizationNeeded, setPrivacyAuthorizationNeeded] =
    useState(false);

  useEffect(
    () =>
      subscribePrivacyAuthorization((request) =>
        setPrivacyAuthorizationNeeded(Boolean(request)),
      ),
    [],
  );

  async function wechatLogin(event: { detail: { code?: string; errMsg?: string } }) {
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
    if (!accepted) {
      Taro.showToast({ title: "请先同意隐私政策与用户协议", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/api/v1/auth/otp/request", { method: "POST", data: { phone } });
      setSent(true);
      Taro.showToast({ title: "验证码已发送", icon: "success" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "发送失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    try {
      const data = await apiRequest<VerifyResult>("/api/v1/auth/otp/verify", {
        method: "POST",
        data: { phone, token: otp },
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

  return (
    <View className="page auth-page">
      <View className="brand-mark">家医</View>
      <Text className="brand-title">家医 Claw</Text>
      <Text className="brand-subtitle">海湾镇家医服务与分级诊疗协同入口</Text>
      <View className="card auth-card">
        <Text className="title">{sent ? "输入验证码" : "手机号登录"}</Text>
        <View className="subtitle">新用户验证后再选择居民或家属身份，并完成服务社区建档。</View>
        <Text className="label">手机号</Text>
        <View className="phone-input"><Text className="country-code">+86</Text><Input className="phone-field" type="number" maxlength={11} value={phone} onInput={(event) => setPhone(event.detail.value.replace(/\D/g, ""))} placeholder="请输入中国大陆手机号" /></View>
        {sent ? (
          <>
            <Text className="label">短信验证码</Text>
            <Input className="input otp-input" type="number" maxlength={10} value={otp} onInput={(event) => setOtp(event.detail.value.replace(/\D/g, ""))} placeholder="请输入短信验证码" />
            <Button className="primary" loading={loading} disabled={otp.length < 6} onClick={verify}>验证并继续</Button>
            <Button className="text-button" onClick={() => { setSent(false); setOtp(""); }}>修改手机号</Button>
          </>
        ) : (
          <>
            <View className="consent-row" onClick={() => setAccepted((value) => !value)}><Checkbox value="base-policy" checked={accepted} color="#6f9996" /><Text>我已阅读并同意隐私政策与用户协议。其他健康信息授权将在登录后分别确认。</Text></View><View className="legal-links"><Text onClick={() => Taro.navigateTo({ url: "/pages/legal/index?doc=privacy" })}>查看隐私政策</Text><Text onClick={() => Taro.navigateTo({ url: "/pages/legal/index?doc=agreement" })}>查看用户协议</Text></View>
            <Button className="primary wechat-primary" openType="getPhoneNumber" loading={loading} onGetPhoneNumber={wechatLogin}>微信手机号一键登录</Button>
            <View className="auth-divider"><View className="divider-line" /><Text>或使用短信验证码</Text><View className="divider-line" /></View>
            <Button className="secondary" loading={loading} disabled={phone.length !== 11} onClick={requestOtp}>获取验证码</Button>
          </>
        )}
      </View>
      <View className="subtitle footer-note">平台提供服务导航、资料整理和人工协同，不替代医生诊疗。</View>
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
