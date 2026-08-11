import { Button, Checkbox, Input, Picker, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";

type Community = {
  id: string;
  name: string;
  district: string | null;
  address?: string | null;
  service_phone: string | null;
};

type OnboardingData = {
  profile: {
    display_name: string;
    role: string;
    community_id: string | null;
    onboarding_completed_at: string | null;
  };
  communities: Community[];
};

const steps = [
  { eyebrow: "使用身份", title: "先确认是谁在使用" },
  { eyebrow: "服务归属", title: "绑定常住服务社区" },
  { eyebrow: "隐私授权", title: "由您决定信息怎么用" },
] as const;

const consentItems = [
  ["privacy", "账号与隐私政策", "用于账号验证、服务办理和安全审计。", true],
  ["sensitive_health", "敏感健康信息", "保存您主动提交的症状、指标、药品与报告。", false],
  ["ai_processing", "Claw 辅助整理", "只整理服务资料，不诊断、开方或调整用药。", false],
  ["notification", "服务进度通知", "用于预约、补资料、排班活动与随访提醒。", false],
] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"resident" | "family">("resident");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [consents, setConsents] = useState({
    privacy: false,
    sensitive_health: false,
    ai_processing: false,
    notification: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCommunity = useMemo(
    () => communities.find((item) => item.id === communityId) ?? null,
    [communities, communityId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<OnboardingData>("/api/v1/onboarding");
      if (data.profile.onboarding_completed_at) {
        Taro.switchTab({ url: "/pages/home/index" });
        return;
      }
      setDisplayName(data.profile.display_name === "新用户" ? "" : data.profile.display_name);
      setRole(data.profile.role === "family" ? "family" : "resident");
      setCommunities(data.communities);
      setCommunityId(data.profile.community_id ?? data.communities[0]?.id ?? "");
      if (!data.communities.length) setError("当前还没有开放建档的服务社区，请联系机构工作人员。");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "建档信息暂时无法加载");
    } finally {
      setLoading(false);
    }
  }

  useLoad(() => {
    void load();
  });

  function next() {
    if (step === 0 && displayName.trim().length < 2) {
      Taro.showToast({ title: "请填写至少 2 个字的称呼", icon: "none" });
      return;
    }
    if (step === 1 && !communityId) {
      Taro.showToast({ title: "请选择服务社区", icon: "none" });
      return;
    }
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function complete() {
    if (!consents.privacy) {
      Taro.showToast({ title: "请先同意账号与隐私政策", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/v1/onboarding", {
        method: "POST",
        data: { displayName: displayName.trim(), role, communityId, consents },
      });
      Taro.showToast({ title: "服务档案已建立", icon: "success" });
      setTimeout(() => role === "family"
        ? Taro.redirectTo({ url: "/pages/family-link/index" })
        : Taro.switchTab({ url: "/pages/home/index" }), 300);
    } catch (saveError) {
      Taro.showToast({ title: saveError instanceof Error ? saveError.message : "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="page onboarding-page">
        <View className="onboarding-loading"><View className="loading-mark" /><Text>正在读取可服务社区</Text></View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="page onboarding-page">
        <View className="onboarding-error">
          <Text className="onboarding-error-title">暂时无法开始建档</Text>
          <Text className="onboarding-error-copy">{error}</Text>
          <Button className="primary pressable" onClick={() => void load()}>重新加载</Button>
        </View>
      </View>
    );
  }

  return (
    <View className="page onboarding-page">
      <View className="onboarding-head">
        <Text className="eyebrow">首次使用 · {step + 1}/{steps.length}</Text>
        <Text className="onboarding-title">{steps[step].title}</Text>
        <Text className="onboarding-subtitle">
          {step === 0 ? "居民本人和家属代办使用不同的授权边界。" : step === 1 ? "社区决定您看到的家医团队、排班和转诊网络。" : "除账号必需项外，其余授权均可稍后在“我的”中调整。"}
        </Text>
        <View className="onboarding-progress">
          {steps.map((item, index) => (
            <View key={item.eyebrow} className={`onboarding-progress-item ${index <= step ? "active" : ""}`}>
              <View className="onboarding-progress-line" />
              <Text>{item.eyebrow}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="onboarding-surface">
        {step === 0 ? (
          <>
            <View className="choice-list">
              <View className={`choice-row pressable ${role === "resident" ? "selected" : ""}`} onClick={() => setRole("resident")}>
                <View className="choice-icon resident">本人</View>
                <View className="grow"><Text className="choice-title">居民本人</Text><Text className="choice-note">办理自己的家医、预约与随访服务</Text></View>
                <View className="choice-check">{role === "resident" ? "✓" : ""}</View>
              </View>
              <View className={`choice-row pressable ${role === "family" ? "selected" : ""}`} onClick={() => setRole("family")}>
                <View className="choice-icon family">代办</View>
                <View className="grow"><Text className="choice-title">家属代办</Text><Text className="choice-note">经居民授权后，为家人办理和查看进度</Text></View>
                <View className="choice-check">{role === "family" ? "✓" : ""}</View>
              </View>
            </View>
            <Text className="label">怎么称呼您</Text>
            <Input
              className="input onboarding-input"
              value={displayName}
              maxlength={40}
              onInput={(event) => setDisplayName(event.detail.value)}
              placeholder={role === "resident" ? "例如：张阿姨" : "例如：小王"}
            />
            <Text className="field-help">只需填写日常称呼，实名信息将在需要办理具体服务时另行核验。</Text>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text className="surface-label">当前可服务社区</Text>
            <Picker
              mode="selector"
              range={communities.map((item) => item.name)}
              onChange={(event) => setCommunityId(communities[Number(event.detail.value)]?.id ?? "")}
            >
              <View className="community-picker pressable">
                <View className="community-symbol">社区</View>
                <View className="grow">
                  <Text className="community-name">{selectedCommunity?.name ?? "请选择服务社区"}</Text>
                  <Text className="community-area">{selectedCommunity?.district ?? "点击选择"}</Text>
                </View>
                <Text className="community-chevron">›</Text>
              </View>
            </Picker>
            {selectedCommunity ? (
              <View className="community-facts">
                {selectedCommunity.address ? <View className="community-fact"><Text>服务地址</Text><Text>{selectedCommunity.address}</Text></View> : null}
                {selectedCommunity.service_phone ? <View className="community-fact"><Text>联系电话</Text><Text>{selectedCommunity.service_phone}</Text></View> : null}
                <View className="community-fact"><Text>绑定方式</Text><Text>先登记，后由工作人员核验签约关系</Text></View>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View className="consent-summary">
              <Text className="consent-summary-title">授权由您控制</Text>
              <Text className="consent-summary-copy">不同用途分别记录；撤回非必需授权不会影响账号登录。</Text>
            </View>
            <View className="consent-list">
              {consentItems.map(([key, title, note, required]) => (
                <View key={key} className={`consent-row-v2 pressable ${consents[key] ? "selected" : ""}`} onClick={() => setConsents((value) => ({ ...value, [key]: !value[key] }))}>
                  <Checkbox value={key} checked={consents[key]} color="#2f6c56" />
                  <View className="grow">
                    <View className="row"><Text className="consent-title">{title}</Text>{required ? <Text className="required-badge">必需</Text> : <Text className="optional-badge">可选</Text>}</View>
                    <Text className="consent-note">{note}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View className="legal-links onboarding-legal">
              <Text onClick={() => Taro.navigateTo({ url: "/pages/legal/index?doc=privacy" })}>查看隐私政策</Text>
              <Text onClick={() => Taro.navigateTo({ url: "/pages/legal/index?doc=agreement" })}>查看用户协议</Text>
            </View>
          </>
        ) : null}
      </View>

      <View className="onboarding-actions">
        {step > 0 ? <Button className="onboarding-back pressable" onClick={() => setStep((value) => value - 1)}>上一步</Button> : null}
        {step < steps.length - 1
          ? <Button className="primary grow pressable" onClick={next}>继续</Button>
          : <Button className="primary grow pressable" loading={saving} disabled={!consents.privacy} onClick={complete}>同意并完成建档</Button>}
      </View>
      <Text className="onboarding-footnote">平台提供服务导航、资料整理和人工协同，不替代医生诊疗。</Text>
    </View>
  );
}
