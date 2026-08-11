import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  PRIVACY_AGREE_BUTTON_ID,
  resolvePrivacyAuthorization,
  subscribePrivacyAuthorization,
  type PendingPrivacyAuthorization,
} from "../lib/privacy";

type PrivacyContractApi = typeof Taro & {
  openPrivacyContract?: () => Promise<unknown>;
};

function capabilityLabel(referrer: string) {
  const value = referrer.toLowerCase();
  if (value.includes("phone")) return "微信手机号";
  if (value.includes("record") || value.includes("microphone")) return "麦克风";
  if (value.includes("image") || value.includes("media") || value.includes("camera")) return "所选照片或相机";
  if (value.includes("subscribe")) return "订阅消息";
  return "本次请求的微信能力";
}

export function GlobalPrivacyGate() {
  const [request, setRequest] = useState<PendingPrivacyAuthorization | null>(null);

  useEffect(() => subscribePrivacyAuthorization(setRequest), []);

  if (!request) return null;

  async function openPrivacyContract() {
    const api = Taro as PrivacyContractApi;
    if (api.openPrivacyContract) {
      try {
        await api.openPrivacyContract();
        return;
      } catch {
        // Preview projects do not expose the platform contract until an AppID is configured.
      }
    }
    await Taro.navigateTo({ url: "/pages/legal/index?doc=privacy" });
  }

  return (
    <View className="privacy-mask global-privacy-mask" role="dialog" aria-label="隐私保护提示">
      <View className="privacy-dialog global-privacy-dialog">
        <View className="global-privacy-mark">隐私</View>
        <Text className="privacy-dialog-title">使用前请确认隐私授权</Text>
        <Text className="privacy-dialog-copy">
          为继续使用{capabilityLabel(request.referrer)}，需要您阅读并同意《家医 Claw 小程序隐私保护指引》。不同健康信息用途仍会在建档时分别征得同意。
        </Text>
        <View className="global-privacy-links">
          <Text onClick={() => void openPrivacyContract()}>查看小程序隐私保护指引</Text>
          <Text onClick={() => Taro.navigateTo({ url: "/pages/legal/index?doc=agreement" })}>查看用户协议</Text>
        </View>
        <View className="privacy-dialog-actions">
          <Button className="privacy-dialog-cancel" onClick={() => resolvePrivacyAuthorization(false)}>
            暂不授权
          </Button>
          <Button
            id={PRIVACY_AGREE_BUTTON_ID}
            className="privacy-dialog-agree"
            openType="agreePrivacyAuthorization"
            onAgreePrivacyAuthorization={() => resolvePrivacyAuthorization(true, PRIVACY_AGREE_BUTTON_ID)}
          >
            同意并继续
          </Button>
        </View>
        <Text className="global-privacy-footnote">拒绝不会退出小程序，您仍可查询公开服务信息。</Text>
      </View>
    </View>
  );
}
