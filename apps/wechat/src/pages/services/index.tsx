import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  BookHeart,
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  FileHeart,
  Hospital,
  Megaphone,
  Newspaper,
  Pill,
  Route,
  Stethoscope,
  UsersRound,
} from "lucide-react-taro";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
import { apiRequest, withCareSubject } from "../../lib/api";

type ServiceItem = {
  id: string;
  service_type: string;
  name: string;
  description?: string;
  access_mode?: "team_assisted" | "official_link" | "hybrid" | "information_only";
  official_url?: string;
  response_sla_hours?: number;
  availability_note?: string;
};

type Schedule = {
  id: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  service_mode: string;
  registration_url?: string | null;
  verified_at?: string | null;
  practitioner?: {
    name?: string;
    title?: string | null;
    specialties?: string[];
  } | null;
  department?: { name?: string } | null;
  institution?: { name?: string; institution_type?: string } | null;
};

type ContentItem = {
  id: string;
  category: string;
  title: string;
  summary: string;
  original_url: string;
  source_name: string;
  published_at?: string | null;
  reviewed_at?: string | null;
};

type Data = {
  access: {
    bindingStatus: "pending" | "active" | "revoked" | "unbound";
    canSubmitService: boolean;
    message: string;
  };
  network: null | {
    name: string;
    community?: { name?: string };
    institutions?: Array<{
      id: string;
      name: string;
      level_label?: string;
      network_role: string;
      registration_url?: string;
    }>;
  };
  schedules: Schedule[];
  content: ContentItem[];
  serviceCatalog: ServiceItem[];
};

type Tab = "service" | "schedule" | "content";

const accessLabels: Record<string, string> = {
  team_assisted: "家医协助",
  official_link: "官方入口",
  hybrid: "官方 / 家医",
  information_only: "信息查询",
};

function ServiceGlyph({ type }: { type: string }) {
  const colors: Record<string, string> = {
    clinic_registration: "#365F8A",
    family_doctor_booking: "#2F6C56",
    referral_assistance: "#9A642C",
    refill_request: "#985268",
    dispense_status_query: "#985268",
    followup_reminder: "#65558A",
    report_explanation: "#376E75",
  };
  const props = { size: 23, color: colors[type] ?? "#2F6C56", strokeWidth: 2.1 } as const;
  if (type === "clinic_registration") return <CalendarCheck2 {...props} />;
  if (type === "family_doctor_booking") return <UsersRound {...props} />;
  if (type === "referral_assistance") return <Route {...props} />;
  if (["refill_request", "dispense_status_query"].includes(type)) return <Pill {...props} />;
  if (type === "followup_reminder") return <FileHeart {...props} />;
  if (type === "report_explanation") return <ClipboardList {...props} />;
  return <Stethoscope {...props} />;
}

function ContentGlyph({ category }: { category: string }) {
  const color = category === "activity" ? "#A0642B" : category === "health_classroom" ? "#2F6C56" : "#365F8A";
  const props = { size: 22, color, strokeWidth: 2.1 } as const;
  if (category === "health_classroom") return <BookHeart {...props} />;
  if (category === "activity") return <Megaphone {...props} />;
  return <Newspaper {...props} />;
}

function openVerifiedUrl(url: string) {
  void Taro.navigateTo({
    url: `/pages/browser/index?url=${encodeURIComponent(url)}`,
  });
}

function openService(item: ServiceItem, access: Data["access"]) {
  if (item.access_mode === "official_link" && item.official_url) {
    openVerifiedUrl(item.official_url);
    return;
  }
  if (!access.canSubmitService) {
    void Taro.showModal({
      title: "签约关系待核验",
      content: access.message,
      showCancel: false,
      confirmText: "我知道了",
    });
    return;
  }
  void Taro.navigateTo({
    url: `/pages/appointments/index?type=${encodeURIComponent(item.service_type)}&from=services`,
  });
}

export default function ServicesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("service");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<Data>(withCareSubject("/api/v1/home")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "服务暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  function scheduleTime(value: string) {
    const date = new Date(value);
    const today = new Date();
    const day = date.toDateString() === today.toDateString() ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <View className="page services-page">
      <View className="services-heading">
        <Text className="eyebrow">分级诊疗服务</Text>
        <Text className="brand-title left">服务</Text>
        <Text className="services-heading-copy">
          从社区首诊开始，需要时由家医团队协助上转。
        </Text>
      </View>

      {loading && !data ? <PageSkeleton rows={3} /> : null}
      {!loading && error && !data ? (
        <PageFeedback title="服务暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && data ? <InlineRetry message={error} onRetry={() => void load()} /> : null}

      {data ? <><View className={`network-ribbon ${data.access.canSubmitService ? "" : "pending"}`}>
        <View className="network-mark"><Hospital size={25} color="#2F6C56" strokeWidth={2} /></View>
        <View className="grow">
          <Text className="network-kicker">我的家医网络</Text>
          <Text className="network-name">
            {data?.network?.name ?? (data.access.bindingStatus === "pending" ? "社区登记核验中" : "尚未绑定家医协作网络")}
          </Text>
          <Text className="network-community">
            {data?.network?.community?.name ?? data.access.message}
          </Text>
        </View>
        <Text className="network-count">
          {data.access.canSubmitService ? `${data?.network?.institutions?.length ?? 0} 家机构` : "待核验"}
        </Text>
      </View>

      <View className="service-segment">
        {([
          ["service", "办服务"],
          ["schedule", "看排班"],
          ["content", "看资讯"],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <View
            key={value}
            className={`service-segment-item pressable ${tab === value ? "active" : ""}`}
            onClick={() => setTab(value)}
          >
            <Text>{label}</Text>
            {value === "schedule" && data?.schedules.length ? (
              <Text className="segment-count">{data.schedules.length}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {loading ? <View className="service-loading">正在加载已核验信息...</View> : null}

      {!loading && tab === "service" ? (
        <>
          <View className="service-section-head">
            <Text className="service-section-title">可办理服务</Text>
            <Text className="service-section-note">提交前均需您确认</Text>
          </View>
          <View className="service-list-surface">
            {data?.serviceCatalog?.length ? (
              data.serviceCatalog.map((item) => (
                <View
                  key={item.id}
                  className={`service-list-row pressable ${!data.access.canSubmitService && item.access_mode !== "official_link" ? "locked" : ""}`}
                  onClick={() => openService(item, data.access)}
                >
                  <View className={`service-glyph service-${item.service_type}`}>
                    <ServiceGlyph type={item.service_type} />
                  </View>
                  <View className="grow">
                    <View className="row">
                      <Text className="service-row-title">{item.name}</Text>
                      <Text className="service-mode-badge">
                        {!data.access.canSubmitService && item.access_mode !== "official_link"
                          ? "核验后开放"
                          : accessLabels[item.access_mode ?? "team_assisted"] ?? "家医协助"}
                      </Text>
                    </View>
                    <Text className="service-row-copy">
                      {item.description ?? "由家医团队核对资料并反馈办理结果。"}
                    </Text>
                    <Text className="service-row-meta">
                      {item.response_sla_hours
                        ? `预计 ${item.response_sla_hours} 小时内首次响应`
                        : item.availability_note ?? "以团队最终确认结果为准"}
                    </Text>
                  </View>
                  <ChevronRight className="service-row-arrow" size={20} color="rgba(16,42,67,.3)" />
                </View>
              ))
            ) : (
              <View className="service-empty">暂无已启用的正式服务。</View>
            )}
          </View>

          <View className="service-section-head network-section-head">
            <Text className="service-section-title">协作医疗网络</Text>
            <Text className="service-section-note">社区首诊，按需上转</Text>
          </View>
          <View className="institution-timeline">
            {data?.network?.institutions?.length ? (
              data.network.institutions.map((item, index) => (
                <View key={item.id} className="institution-row">
                  <View className="institution-track">
                    <View className={`institution-dot ${index === 0 ? "primary" : ""}`} />
                    {index < (data.network?.institutions?.length ?? 0) - 1 ? (
                      <View className="institution-line" />
                    ) : null}
                  </View>
                  <View className="grow institution-copy">
                    <Text className="institution-role">
                      {item.network_role === "primary_care" ? "社区首诊" : "协作上转"}
                    </Text>
                    <Text className="institution-name">{item.name}</Text>
                    <Text className="institution-level">{item.level_label ?? "医疗机构"}</Text>
                  </View>
                  {item.registration_url ? (
                    <Button
                      className="institution-link pressable"
                      size="mini"
                      onClick={() => openVerifiedUrl(item.registration_url!)}
                    >
                      官方入口
                    </Button>
                  ) : null}
                </View>
              ))
            ) : (
              <View className="service-empty">尚未配置正式合作医院。</View>
            )}
          </View>
        </>
      ) : null}

      {!loading && tab === "schedule" ? (
        <>
          <View className="service-section-head">
            <Text className="service-section-title">已核验排班</Text>
            <Text className="service-section-note">过期信息自动下架</Text>
          </View>
          <View className="schedule-surface">
            {data?.schedules.length ? (
              data.schedules.map((item) => (
                <View key={item.id} className="schedule-row">
                  <View className="schedule-date">
                    <Text className="schedule-day">{scheduleTime(item.starts_at).split(" ")[0]}</Text>
                    <Text className="schedule-clock">{scheduleTime(item.starts_at).split(" ")[1]}</Text>
                  </View>
                  <View className="grow">
                    <Text className="schedule-doctor">
                      {item.practitioner?.name ?? "机构坐班医生"}
                      {item.practitioner?.title ? ` · ${item.practitioner.title}` : ""}
                    </Text>
                    <Text className="schedule-place">
                      {item.department?.name ?? "全科门诊"} · {item.institution?.name ?? "家医网络机构"}
                    </Text>
                    {item.practitioner?.specialties?.length ? (
                      <Text className="schedule-specialty">
                        擅长：{item.practitioner.specialties.slice(0, 3).join("、")}
                      </Text>
                    ) : null}
                  </View>
                  {item.registration_url ? (
                    <Button
                      className="schedule-action pressable"
                      size="mini"
                      onClick={() => openVerifiedUrl(item.registration_url!)}
                    >
                      去挂号
                    </Button>
                  ) : (
                    <Button
                      className="schedule-action pressable"
                      size="mini"
                      onClick={() => openService({
                        id: item.id,
                        service_type: "clinic_registration",
                        name: "家医预约协助",
                      }, data.access)}
                    >
                      请家医协助
                    </Button>
                  )}
                </View>
              ))
            ) : (
              <View className="service-empty spacious">
                暂无已核验排班。系统不会展示推测号源，您可以请家医团队协助确认。
              </View>
            )}
          </View>
        </>
      ) : null}

      {!loading && tab === "content" ? (
        <>
          <View className="service-section-head">
            <Text className="service-section-title">活动与家医课堂</Text>
            <Text className="service-section-note">仅展示审核通过内容</Text>
          </View>
          <View className="content-feed-surface">
            {data?.content.length ? (
              data.content.map((item) => (
                <View
                  key={item.id}
                  className="content-feed-row pressable"
                  onClick={() => openVerifiedUrl(item.original_url)}
                >
                  <View className={`content-category category-${item.category}`}>
                    <ContentGlyph category={item.category} />
                  </View>
                  <View className="grow">
                    <Text className="content-feed-title">{item.title}</Text>
                    <Text className="content-feed-summary">{item.summary}</Text>
                    <Text className="content-feed-source">
                      {item.source_name} · 已审核
                    </Text>
                  </View>
                  <ChevronRight className="service-row-arrow" size={20} color="rgba(16,42,67,.3)" />
                </View>
              ))
            ) : (
              <View className="service-empty spacious">暂无已审核活动或课堂内容。</View>
            )}
          </View>
        </>
      ) : null}
      </> : null}
    </View>
  );
}
