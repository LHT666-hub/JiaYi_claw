import { Switch, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  apiRequest,
  getCareSubjectId,
  saveCareSubjectId,
  withCareSubject,
} from "../../lib/api";

declare const POLICY_VERSION: string;
const scopes = [
  {
    id: "privacy",
    title: "基础隐私政策",
    description: "账号、联系方式和服务记录的必要处理。",
  },
  {
    id: "sensitive_health",
    title: "敏感健康信息",
    description: "健康指标、用药和主动提交的健康情况。",
  },
  {
    id: "ai_processing",
    title: "AI 辅助整理",
    description: "用于信息分类、公开信息检索和接诊前摘要。",
  },
  {
    id: "notification",
    title: "服务通知",
    description: "预约进度、资料补充和处理结果提醒。",
  },
] as const;

type ConsentData = {
  residentId: string;
  careSubject: { displayName: string; relationship: string; isSelf: boolean };
  consents: Array<{ scope: string; granted: boolean }>;
};

export default function PrivacyPage() {
  const [data, setData] = useState<ConsentData | null>(null);
  const [grants, setGrants] = useState<Record<string, boolean>>({});

  useDidShow(() => {
    void apiRequest<ConsentData>(withCareSubject("/api/v1/consents"))
      .then((result) => {
        saveCareSubjectId(result.residentId);
        const next: Record<string, boolean> = {};
        for (const item of result.consents) {
          if (!(item.scope in next)) next[item.scope] = item.granted;
        }
        setData(result);
        setGrants(next);
      })
      .catch((error) => Taro.showToast({ title: error.message, icon: "none" }));
  });

  async function toggle(scope: string, granted: boolean) {
    try {
      await apiRequest("/api/v1/consents", {
        method: "POST",
        data: {
          residentId: getCareSubjectId() || undefined,
          scope,
          policyVersion: POLICY_VERSION,
          granted,
        },
      });
      setGrants((current) => ({ ...current, [scope]: granted }));
      Taro.showToast({ title: granted ? "已授权" : "已撤回", icon: "success" });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "保存失败",
        icon: "none",
      });
    }
  }

  return (
    <View className="page">
      <View className="page-heading">
        <Text className="title">隐私与授权</Text>
        <Text className="subtitle">每项单独记录，也可以随时撤回。</Text>
      </View>
      <View className="subject-card">
        <View className="subject-avatar">
          {data?.careSubject?.displayName?.slice(0, 1) ?? "居"}
        </View>
        <View className="grow">
          <Text className="subject-label">当前服务对象</Text>
          <Text className="subject-name">
            {data?.careSubject?.displayName ?? "正在读取"}
          </Text>
        </View>
      </View>
      <View className="card privacy-intro">
        <Text className="consent-title">医疗健康信息属于敏感个人信息</Text>
        <Text className="consent-note">
          当前设置仅作用于上方服务对象。AI 不替代医生提供诊疗服务。
        </Text>
      </View>
      <View className="card privacy-list">
        {scopes.map((scope) => (
          <View key={scope.id} className="setting-row">
            <View className="setting-copy">
              <Text className="label">{scope.title}</Text>
              <Text className="muted">{scope.description}</Text>
            </View>
            <Switch
              checked={Boolean(grants[scope.id])}
              color="#2f6c56"
              disabled={!data}
              onChange={(event) => void toggle(scope.id, event.detail.value)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
