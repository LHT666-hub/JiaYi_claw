import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, withCareSubject } from "../../lib/api";

type Data = {
  network: null | {
    name: string;
    institutions?: Array<{
      id: string;
      name: string;
      level_label?: string;
      network_role: string;
      registration_url?: string;
    }>;
  };
  schedules: Array<Record<string, unknown>>;
  content: Array<Record<string, unknown>>;
  serviceCatalog: Array<{
    id: string;
    service_type: string;
    name: string;
    description?: string;
    access_mode?:
      "team_assisted" | "official_link" | "hybrid" | "information_only";
    official_url?: string;
    response_sla_hours?: number;
    availability_note?: string;
  }>;
};

const accessLabels: Record<string, string> = {
  team_assisted: "家医协助",
  official_link: "官方入口",
  hybrid: "两种方式",
  information_only: "信息查询",
};

function openService(item: Data["serviceCatalog"][number]) {
  if (item.access_mode === "official_link" && item.official_url) {
    void Taro.setClipboardData({
      data: item.official_url,
      success: () =>
        Taro.showToast({ title: "官方链接已复制", icon: "success" }),
    });
    return;
  }
  void Taro.navigateTo({
    url: `/pages/appointments/index?type=${encodeURIComponent(item.service_type)}&from=services`,
  });
}
export default function ServicesPage() {
  const [data, setData] = useState<Data | null>(null);
  useDidShow(() => {
    void apiRequest<Data>(withCareSubject("/api/v1/home"))
      .then(setData)
      .catch((error) => Taro.showToast({ title: error.message, icon: "none" }));
  });
  return (
    <View className="page">
      <View className="card">
        <Text className="title">分级诊疗服务</Text>
        <View className="subtitle">
          {data?.network?.name ?? "社区首诊，家医协助上转"}
        </View>
        <Button
          className="primary"
          onClick={() => Taro.navigateTo({ url: "/pages/appointments/index" })}
        >
          发起服务申请
        </Button>
        <Button
          className="secondary"
          onClick={() => Taro.navigateTo({ url: "/pages/public-info/index" })}
        >
          查询公开信息
        </Button>
      </View>
      <View className="card">
        <Text className="label service-label">可办理服务</Text>
        {data?.serviceCatalog?.length ? (
          data.serviceCatalog.map((item) => (
            <View key={item.id} className="service-capability">
              <View className="row">
                <View className="grow">
                  <Text className="service-capability-title">{item.name}</Text>
                  <Text className="service-capability-badge">
                    {accessLabels[item.access_mode ?? "team_assisted"] ??
                      "家医协助"}
                  </Text>
                </View>
                <Button
                  className="assistant-action-button"
                  size="mini"
                  onClick={() => openService(item)}
                >
                  {item.access_mode === "official_link" ? "去官方" : "去办理"}
                </Button>
              </View>
              {item.description ? (
                <Text className="service-capability-copy">
                  {item.description}
                </Text>
              ) : null}
              <Text className="service-capability-note">
                {item.availability_note ?? "以家医团队最终确认结果为准。"}
                {item.response_sla_hours
                  ? ` 预计 ${item.response_sla_hours} 小时内响应。`
                  : ""}
              </Text>
            </View>
          ))
        ) : (
          <View className="empty-copy">暂无已启用的正式服务。</View>
        )}
      </View>
      <View className="card">
        <Text className="label">协作医疗网络</Text>
        {data?.network?.institutions?.length ? (
          data.network.institutions.map((item) => (
            <View key={item.id} className="row">
              <View className="grow">
                <Text style={{ fontWeight: 600 }}>{item.name}</Text>
                <View className="muted">
                  {item.network_role === "primary_care"
                    ? "社区首诊"
                    : "协作上转"}{" "}
                  · {item.level_label ?? "医疗机构"}
                </View>
              </View>
              {item.registration_url ? (
                <Button
                  size="mini"
                  onClick={() =>
                    Taro.setClipboardData({ data: item.registration_url! })
                  }
                >
                  官方入口
                </Button>
              ) : null}
            </View>
          ))
        ) : (
          <View className="muted">尚未配置正式合作医院。</View>
        )}
      </View>
      <View className="card">
        <Text className="label">已核验排班</Text>
        <View className="muted">
          {data?.schedules.length
            ? `近期有 ${data.schedules.length} 条已核验排班`
            : "暂无已核验排班，不展示推测号源。"}
        </View>
      </View>
      <View className="card">
        <Text className="label">社区动态与家医课堂</Text>
        {data?.content.length ? (
          data.content.slice(0, 5).map((item) => (
            <View key={String(item.id)} className="row">
              <View className="grow">
                <Text style={{ fontWeight: 600 }}>{String(item.title)}</Text>
                <View className="muted">来源：{String(item.source_name)}</View>
              </View>
            </View>
          ))
        ) : (
          <View className="muted">暂无已审核内容。</View>
        )}
      </View>
    </View>
  );
}
