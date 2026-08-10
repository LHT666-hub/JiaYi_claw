import { Button, Checkbox, Input, Picker, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type Community = { id: string; name: string; district: string | null; service_phone: string | null };
type OnboardingData = {
  profile: { display_name: string; role: string; community_id: string | null; onboarding_completed_at: string | null };
  communities: Community[];
};

const consentItems = [
  ["privacy", "隐私政策与账号服务", "用于创建账号、提供服务并保护账号安全，此项为必需。"],
  ["sensitive_health", "敏感健康信息处理", "保存您主动提交的症状、指标、药品和报告资料。"],
  ["ai_processing", "AI 辅助整理", "提取服务意图并整理资料，不自动诊断、开方或调药。"],
  ["notification", "服务通知", "接收预约进度、补充资料、排班活动和随访提醒。"],
] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"resident" | "family">("resident");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [consents, setConsents] = useState({ privacy: false, sensitive_health: false, ai_processing: false, notification: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useLoad(() => {
    void (async () => {
      try {
        const data = await apiRequest<OnboardingData>("/api/v1/onboarding");
        if (data.profile.onboarding_completed_at) {
          Taro.switchTab({ url: "/pages/home/index" });
          return;
        }
        setDisplayName(data.profile.display_name === "新用户" ? "" : data.profile.display_name);
        setCommunities(data.communities);
        setCommunityId(data.profile.community_id ?? data.communities[0]?.id ?? "");
      } catch (error) {
        Taro.showToast({ title: error instanceof Error ? error.message : "建档信息加载失败", icon: "none" });
      } finally {
        setLoading(false);
      }
    })();
  });

  function next() {
    if (step === 0 && displayName.trim().length < 2) return void Taro.showToast({ title: "请填写至少 2 个字的称呼", icon: "none" });
    if (step === 1 && !communityId) return void Taro.showToast({ title: "请选择服务社区", icon: "none" });
    setStep((value) => Math.min(value + 1, 2));
  }

  async function complete() {
    if (!consents.privacy) return void Taro.showToast({ title: "请先同意隐私政策与账号服务", icon: "none" });
    setSaving(true);
    try {
      await apiRequest("/api/v1/onboarding", { method: "POST", data: { displayName, role, communityId, consents } });
      Taro.showToast({ title: "建档完成", icon: "success" });
      setTimeout(() => role === "family"
        ? Taro.redirectTo({ url: "/pages/family-link/index" })
        : Taro.switchTab({ url: "/pages/home/index" }), 300);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="page"><View className="card"><Text className="title">正在准备建档信息</Text></View></View>;

  return (
    <View className="page onboarding-page">
      <Text className="eyebrow">首次使用</Text><Text className="brand-title left">建立您的家医服务档案</Text>
      <View className="step-bar">{["身份", "服务社区", "授权"].map((label, index) => <View key={label} className={`step-pill ${step === index ? "active" : index < step ? "done" : ""}`}>{index < step ? "✓" : index + 1} {label}</View>)}</View>
      <View className="card onboarding-card">
        {step === 0 ? <><Text className="title">您以什么身份使用？</Text><View className="role-grid"><View className={`role-card ${role === "resident" ? "selected" : ""}`} onClick={() => setRole("resident")}><Text className="role-title">居民本人</Text><Text className="role-note">办理本人服务</Text></View><View className={`role-card ${role === "family" ? "selected" : ""}`} onClick={() => setRole("family")}><Text className="role-title">家属代办</Text><Text className="role-note">协助家人办理</Text></View></View><Text className="label">怎么称呼您</Text><Input className="input" value={displayName} maxlength={40} onInput={(event) => setDisplayName(event.detail.value)} placeholder={role === "resident" ? "例如：张阿姨" : "例如：小王（张阿姨女儿）"} /></> : null}
        {step === 1 ? <><Text className="title">选择服务社区</Text><View className="subtitle">这里决定您看到的家医团队、排班和转诊网络。</View><Picker mode="selector" range={communities.map((item) => item.name)} onChange={(event) => setCommunityId(communities[Number(event.detail.value)]?.id ?? "")}><View className="input picker-value">{communities.find((item) => item.id === communityId)?.name ?? "请选择服务社区"}</View></Picker>{communities.find((item) => item.id === communityId)?.district ? <View className="notice">{communities.find((item) => item.id === communityId)?.district}。后续由工作人员核验签约关系。</View> : null}</> : null}
        {step === 2 ? <><Text className="title">确认授权范围</Text><View className="subtitle">每项单独记录，可在“我的”中撤回。</View>{consentItems.map(([key, title, note]) => <View key={key} className={`consent-card ${consents[key] ? "selected" : ""}`} onClick={() => setConsents((value) => ({ ...value, [key]: !value[key] }))}><Checkbox value={key} checked={consents[key]} color="#6f9996" /><View className="grow"><Text className="consent-title">{title}{key === "privacy" ? "（必需）" : ""}</Text><Text className="consent-note">{note}</Text></View></View>)}</> : null}
      </View>
      <View className="action-row">{step > 0 ? <Button className="back-button" onClick={() => setStep((value) => value - 1)}>‹</Button> : null}{step < 2 ? <Button className="primary grow" onClick={next}>继续</Button> : <Button className="primary grow" loading={saving} disabled={!consents.privacy} onClick={complete}>完成并进入</Button>}</View>
    </View>
  );
}
