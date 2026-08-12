import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useRef, useState } from "react";
import {
  BookHeart,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Megaphone,
  Search,
  ShieldCheck,
} from "lucide-react-taro";
import { apiRequest, isLoggedIn } from "../../lib/api";

type PublicInfoItem = {
  id: string;
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt: string;
  stale: boolean;
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

type HubData = {
  publicInfo: PublicInfoItem[];
  content: ContentItem[];
  serviceConfigured: boolean;
  publishedOnly: true;
};

type Section = "guide" | "content";
const suggestions = ["门诊时间", "疫苗接种", "体检活动", "家庭医生签约"];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "待核验"
    : date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

function ContentIcon({ category }: { category: string }) {
  if (category === "activity")
    return <Megaphone size={22} color="#9A642C" strokeWidth={2} />;
  if (category === "health_classroom")
    return <BookHeart size={22} color="#2F6C56" strokeWidth={2} />;
  return <BookOpen size={22} color="#365F8A" strokeWidth={2} />;
}

export default function PublicInfoPage() {
  const loaded = useRef(false);
  const guest = !isLoggedIn();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicInfoItem[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [section, setSection] = useState<Section>("guide");
  const [configured, setConfigured] = useState(true);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextQuery = "", showResult = false) {
    const normalized = nextQuery.trim();
    if (normalized) setQuery(normalized);
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<HubData>(
        `/api/v1/public-hub?q=${encodeURIComponent(normalized)}`,
        { auth: "optional" },
      );
      setItems(data.publicInfo);
      setContent(data.content);
      setConfigured(data.serviceConfigured);
      setSearched(showResult || Boolean(normalized));
      loaded.current = true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "公开信息暂时无法查询");
    } finally {
      setLoading(false);
    }
  }

  async function search(nextQuery = query) {
    const normalized = nextQuery.trim();
    if (!normalized) {
      Taro.showToast({ title: "请输入要查询的信息", icon: "none" });
      return;
    }
    setSection("guide");
    await load(normalized, true);
  }

  useDidShow(() => {
    if (!loaded.current) void load();
  });

  usePullDownRefresh(() => {
    void load(query, searched).finally(() => Taro.stopPullDownRefresh());
  });

  function openSource(item: PublicInfoItem) {
    if (!item.sourceUrl) {
      Taro.showToast({ title: "该资料暂无原文入口", icon: "none" });
      return;
    }
    void Taro.navigateTo({
      url: `/pages/browser/index?url=${encodeURIComponent(item.sourceUrl)}&publicInfoId=${encodeURIComponent(item.id)}`,
    });
  }

  function openContent(item: ContentItem) {
    if (!item.original_url) {
      Taro.showToast({ title: "该内容暂无原文入口", icon: "none" });
      return;
    }
    void Taro.navigateTo({
      url: `/pages/content-detail/index?id=${encodeURIComponent(item.id)}`,
    });
  }

  return (
    <View className="page public-info-page">
      <View className="page-heading public-hub-heading">
        <Text className="eyebrow">{guest ? "无需登录 · 公开服务" : "所属社区公开服务"}</Text>
        <Text className="title">居民服务大厅</Text>
        <Text className="subtitle">查办理指南、活动和家医课堂；所有内容均显示来源与核验状态。</Text>
      </View>

      {guest ? (
        <View className="public-guest-note">
          <View className="grow">
            <Text className="public-guest-title">当前为访客查询</Text>
            <Text className="public-guest-copy">不会保存健康资料。登录后才能预约、代办和查看进度。</Text>
          </View>
          <Button className="public-guest-login pressable" onClick={() => Taro.reLaunch({ url: "/pages/login/index" })}>去登录</Button>
        </View>
      ) : null}

      <View className="public-search">
        <View className="public-search-field">
          <View className="public-search-mark"><Search size={19} color="#2F6C56" strokeWidth={2.1} /></View>
          <Input value={query} confirmType="search" onConfirm={() => void search()} onInput={(event) => setQuery(event.detail.value)} placeholder="例如：接种门诊什么时候开" />
        </View>
        <Button className="public-search-button pressable" disabled={loading} onClick={() => void search()}>{loading ? "加载中" : "查询"}</Button>
      </View>

      <View className="public-hub-segment">
        <View className={`public-hub-tab pressable ${section === "guide" ? "active" : ""}`} onClick={() => setSection("guide")}>
          <ShieldCheck size={18} color={section === "guide" ? "#FFFFFF" : "#557C6C"} /><Text>办事指南</Text>
        </View>
        <View className={`public-hub-tab pressable ${section === "content" ? "active" : ""}`} onClick={() => setSection("content")}>
          <CalendarDays size={18} color={section === "content" ? "#FFFFFF" : "#557C6C"} /><Text>活动课堂</Text>
        </View>
      </View>

      {!configured && !loading ? (
        <View className="public-config-note">
          <Text className="public-config-title">机构内容库正在接入</Text>
          <Text>当前没有可发布的正式资料。系统不会用演示排班或虚构活动填充。</Text>
        </View>
      ) : null}

      {section === "guide" && !searched && !error && !items.length ? (
        <View className="public-suggestions">
          <Text className="settings-group-label">常见查询</Text>
          <View className="public-suggestion-grid">
            {suggestions.map((suggestion) => (
              <View key={suggestion} className="public-suggestion pressable" onClick={() => void search(suggestion)}>
                <Text>{suggestion}</Text><ChevronRight size={19} color="rgba(16,42,67,.3)" />
              </View>
            ))}
          </View>
          <View className="public-source-note">
            <Text className="public-source-note-title">信息边界</Text>
            <Text>只查询服务时间、地点、活动与办事指南。身体不适可登录后问 Claw；诊疗判断由医生完成。</Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <View className="settings-state compact">
          <Text className="settings-state-title">暂时无法查询</Text>
          <Text className="settings-state-copy">{error}</Text>
          <Button className="secondary pressable" onClick={() => void load(query, searched)}>重新加载</Button>
        </View>
      ) : null}

      {section === "guide" && searched && !loading && !error && !items.length ? (
        <View className="settings-empty">
          <View className="settings-empty-mark"><Search size={25} color="#557C6C" /></View>
          <Text className="settings-empty-title">没有找到已核验资料</Text>
          <Text className="settings-empty-copy">{guest ? "换一个更短的关键词，或联系社区卫生服务中心核实。" : "换一个更短的关键词，或在“消息”里联系所属家医团队。"}</Text>
        </View>
      ) : null}

      {section === "guide" && items.length ? (
        <View className="public-results">
          <Text className="settings-group-label">{searched ? `查询结果 · ${items.length}` : `最新指南 · ${items.length}`}</Text>
          {items.map((item) => (
            <View className={`public-result ${item.stale ? "stale" : ""}`} key={item.id}>
              <View className="public-result-head">
                <Text className="public-result-title">{item.title}</Text>
                <Text className={`status ${item.stale ? "warning" : ""}`}>{item.stale ? "需核验" : "已核验"}</Text>
              </View>
              <Text className="public-result-content">{item.stale ? "这条资料已经超过有效期，请通过原文或联系机构确认后再办理。" : item.content}</Text>
              <View className="public-result-meta">
                <View className="grow"><Text className="public-result-source">{item.sourceName || "所属机构"}</Text><Text className="public-result-date">核验于 {formatDate(item.verifiedAt)}</Text></View>
                <Button className="public-source-button pressable" onClick={() => openSource(item)}>查看原文</Button>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {section === "content" ? (
        <View className="public-content-feed">
          {content.length ? content.map((item) => (
            <View className="public-content-row pressable" key={item.id} onClick={() => openContent(item)}>
              <View className={`public-content-icon category-${item.category}`}><ContentIcon category={item.category} /></View>
              <View className="grow">
                <View className="public-content-meta"><Text>{item.category === "activity" ? "社区活动" : item.category === "health_classroom" ? "家医课堂" : "健康资讯"}</Text><Text>{formatDate(item.published_at ?? item.reviewed_at ?? "")}</Text></View>
                <Text className="public-content-title">{item.title}</Text>
                <Text className="public-content-summary">{item.summary}</Text>
                <Text className="public-content-source">{item.source_name} · 已审核</Text>
              </View>
              <ChevronRight size={20} color="rgba(16,42,67,.28)" />
            </View>
          )) : (
            <View className="settings-empty">
              <View className="settings-empty-mark"><BookHeart size={25} color="#557C6C" /></View>
              <Text className="settings-empty-title">暂无已审核活动或课堂</Text>
              <Text className="settings-empty-copy">机构发布并完成审核后会在这里出现。</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
