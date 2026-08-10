import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, clearSession } from "../../lib/api";

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
};
export default function MePage() {
  const [data, setData] = useState<Data | null>(null);
  useDidShow(() => {
    void apiRequest<Data>("/api/v1/me")
      .then(setData)
      .catch((error) => Taro.showToast({ title: error.message, icon: "none" }));
  });
  function logout() {
    clearSession();
    void Taro.reLaunch({ url: "/pages/login/index" });
  }
  const links = [
    { label: "隐私与授权", url: "/pages/privacy/index" },
    { label: "通知设置", url: "/pages/notification-settings/index" },
    { label: "账号与安全", url: "/pages/account-security/index" },
    { label: "隐私政策", url: "/pages/legal/index?doc=privacy" },
    { label: "用户协议", url: "/pages/legal/index?doc=agreement" },
  ];
  return (
    <View className="page">
      <View className="card">
        <Text className="title">{data?.profile.display_name ?? "我的"}</Text>
        <View className="subtitle">{data?.profile.phone ?? ""}</View>
      </View>
      <View className="card">
        <Text className="label">家医服务绑定</Text>
        <View className="subtitle">
          {data?.network?.name ?? "尚未绑定家医网络"}
        </View>
        <View className="muted">
          {data?.network?.community?.name ?? "请联系社区工作人员"} · 协作机构{" "}
          {data?.network?.institutions?.length ?? 0} 家
        </View>
        <Button
          className="secondary"
          onClick={() => Taro.navigateTo({ url: "/pages/family-link/index" })}
        >
          {data?.profile.role === "family" ? "绑定与管理家人" : "家属协助授权"}
        </Button>
      </View>
      <View className="card">
        <Text className="label">我的数据</Text>
        <View className="row">
          <Text>健康记录</Text>
          <Text>{data?.observations.length ?? 0} 条</Text>
        </View>
        <View className="row">
          <Text>服务申请</Text>
          <Text>{data?.serviceRequests.length ?? 0} 条</Text>
        </View>
        <View className="row">
          <Text>企业微信</Text>
          <Text>{data?.channelBindings.length ? "已绑定" : "未绑定"}</Text>
        </View>
      </View>
      <View className="card link-list">
        {links.map((item) => (
          <View
            key={item.url}
            className="row link-row"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
            <Text>{item.label}</Text>
            <Text className="muted">›</Text>
          </View>
        ))}
      </View>
      <Button className="secondary" onClick={logout}>
        退出登录
      </Button>
    </View>
  );
}
