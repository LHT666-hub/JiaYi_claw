import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  Bell,
  ChevronRight,
  FileText,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from "lucide-react-taro";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
import { apiRequest, clearSession, withCareSubject } from "../../lib/api";

type Data = {
  profile: { display_name: string; role: string; phone?: string };
  network: null | {
    name: string;
    community?: { name?: string };
    institutions?: unknown[];
  };
  observations: unknown[];
  serviceRequests: unknown[];
  channelBindings: unknown[];
  access: null | {
    bindingStatus: "pending" | "active" | "revoked" | "unbound";
    canSubmitService: boolean;
    canStoreHealthData: boolean;
    message: string;
  };
};

const roleLabels: Record<string, string> = {
  resident: "居民本人",
  family: "家属代办人",
};

function SettingIcon({ type }: { type: string }) {
  const props = { size: 22, strokeWidth: 2.1 } as const;
  if (type === "support") return <LifeBuoy {...props} color="#2F6C56" />;
  if (type === "privacy") return <ShieldCheck {...props} color="#365F8A" />;
  if (type === "notification") return <Bell {...props} color="#8B5E83" />;
  if (type === "security") return <LockKeyhole {...props} color="#A0642B" />;
  return <FileText {...props} color="#52677A" />;
}

export default function MePage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<Data>(withCareSubject("/api/v1/me")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账户暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  function logout() {
    clearSession();
    void Taro.reLaunch({ url: "/pages/login/index" });
  }

  const links = [
    { icon: "support", label: "帮助与反馈", note: "联系社区、微信客服和问题反馈", url: "/pages/support/index" },
    { icon: "privacy", label: "隐私与授权", note: "健康信息和 AI 处理范围", url: "/pages/privacy/index" },
    { icon: "notification", label: "通知设置", note: "订阅消息与免打扰时间", url: "/pages/notification-settings/index" },
    { icon: "security", label: "账号与安全", note: "手机号、登录设备和注销", url: "/pages/account-security/index" },
    { icon: "legal", label: "隐私政策与用户协议", note: "查看当前生效版本", url: "/pages/legal/index?doc=privacy" },
  ];

  const phone = data?.profile.phone ?? "";
  const maskedPhone = phone.length >= 7
    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
    : phone;

  function openHealthRecords() {
    if (!data?.access?.canStoreHealthData) {
      void Taro.showModal({
        title: "健康记录暂未开放",
        content: data?.access?.message ?? "家医团队核验签约关系后即可使用。",
        showCancel: false,
        confirmText: "我知道了",
      });
      return;
    }
    void Taro.navigateTo({ url: "/pages/health-records/index" });
  }

  return (
    <View className="page me-page">
      {loading && !data ? <PageSkeleton rows={4} /> : null}
      {!loading && error && !data ? (
        <PageFeedback title="账户暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && data ? <InlineRetry message={error} onRetry={() => void load()} /> : null}
      {data ? <>
      <View className="me-profile">
        <View className="me-avatar">
          {(data?.profile.display_name ?? "我").slice(0, 1)}
        </View>
        <View className="grow">
          <Text className="me-name">{data?.profile.display_name ?? "我的账户"}</Text>
          <Text className="me-identity">
            {roleLabels[data?.profile.role ?? ""] ?? "家医服务用户"}
            {maskedPhone ? ` · ${maskedPhone}` : ""}
          </Text>
        </View>
        <View className={`me-verified ${data.access?.canSubmitService ? "active" : "pending"}`}>
          {data.access?.canSubmitService ? "签约已核验" : "账号已登录"}
        </View>
      </View>

      <View className="binding-panel">
        <View className="binding-panel-head">
          <View>
            <Text className="binding-kicker">家医服务绑定</Text>
            <Text className="binding-name">
              {data?.network?.name ?? (data.access?.bindingStatus === "pending" ? "社区登记核验中" : "尚未绑定家医网络")}
            </Text>
          </View>
          <View className={`binding-state ${data.access?.canSubmitService ? "active" : ""}`}>
            {data.access?.canSubmitService ? "服务中" : data.access?.bindingStatus === "pending" ? "待核验" : "未开通"}
          </View>
        </View>
        <Text className="binding-community">
          {data?.network?.community?.name ?? data.access?.message ?? "请联系社区工作人员"}
          {data?.network ? ` · 协作机构 ${data.network.institutions?.length ?? 0} 家` : ""}
        </Text>
        <Button
          className="binding-action pressable"
          onClick={() => Taro.navigateTo({ url: "/pages/family-link/index" })}
        >
          <UsersRound size={19} color="#102A43" strokeWidth={2.1} />
          {data?.profile.role === "family" ? "管理服务对象" : "管理家属协助授权"}
        </Button>
      </View>

      <View className="me-data-surface">
        <View
          className="me-data-item pressable"
          onClick={() => Taro.navigateTo({ url: "/pages/progress/index" })}
        >
          <Text className="me-data-value">{data?.serviceRequests.length ?? 0}</Text>
          <Text className="me-data-label">服务记录</Text>
        </View>
        <View className="me-data-divider" />
        <View className="me-data-item pressable" onClick={openHealthRecords}>
          <Text className="me-data-value">{data?.observations.length ?? 0}</Text>
          <Text className="me-data-label">健康记录</Text>
        </View>
        <View className="me-data-divider" />
        <View className="me-data-item">
          <Text className="me-data-value">{data?.channelBindings.length ? 1 : 0}</Text>
          <Text className="me-data-label">已连渠道</Text>
        </View>
      </View>

      <View className="me-section-head">
        <Text className="service-section-title">账户与服务</Text>
      </View>
      <View className="me-settings-surface">
        {links.map((item) => (
          <View
            key={item.url}
            className="me-setting-row pressable"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
            <View className="me-setting-glyph"><SettingIcon type={item.icon} /></View>
            <View className="grow">
              <Text className="me-setting-title">{item.label}</Text>
              <Text className="me-setting-note">{item.note}</Text>
            </View>
            <ChevronRight className="me-setting-arrow" size={20} color="rgba(16,42,67,.3)" />
          </View>
        ))}
      </View>

      <Button className="me-logout pressable" disabled={loading} onClick={logout}>
        退出当前账号
      </Button>
      <Text className="me-version">家医 Claw · 服务导航与家庭医生协同</Text>
      </> : null}
    </View>
  );
}
