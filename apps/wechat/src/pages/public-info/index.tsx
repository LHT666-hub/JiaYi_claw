import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type PublicInfoItem = {
  id: string;
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt: string;
  stale: boolean;
};

const suggestions = ["门诊时间", "疫苗接种", "体检活动", "家庭医生签约"];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "待核验" : date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

export default function PublicInfoPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicInfoItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(nextQuery = query) {
    const normalized = nextQuery.trim();
    if (!normalized) {
      Taro.showToast({ title: "请输入要查询的信息", icon: "none" });
      return;
    }
    setQuery(normalized);
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ items: PublicInfoItem[] }>(`/api/v1/public-info?q=${encodeURIComponent(normalized)}`);
      setItems(data.items);
      setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "公开信息暂时无法查询");
    } finally {
      setLoading(false);
    }
  }

  function openSource(item: PublicInfoItem) {
    if (!item.sourceUrl) {
      Taro.showToast({ title: "该资料暂无原文入口", icon: "none" });
      return;
    }
    void Taro.navigateTo({ url: `/pages/browser/index?url=${encodeURIComponent(item.sourceUrl)}` });
  }

  return (
    <View className="page public-info-page">
      <View className="page-heading">
        <Text className="eyebrow">海湾镇公开服务信息</Text>
        <Text className="title">查时间、地点和办理方式</Text>
        <Text className="subtitle">答案只来自机构审核过的资料，过期内容不会当作事实回答。</Text>
      </View>

      <View className="public-search">
        <View className="public-search-field"><Text className="public-search-mark">查</Text><Input value={query} confirmType="search" onConfirm={() => void search()} onInput={(event) => setQuery(event.detail.value)} placeholder="例如：接种门诊什么时候开" /></View>
        <Button className="public-search-button pressable" loading={loading} onClick={() => void search()}>查询</Button>
      </View>

      {!searched && !error ? (
        <View className="public-suggestions">
          <Text className="settings-group-label">常见查询</Text>
          <View className="public-suggestion-grid">{suggestions.map((suggestion) => <View key={suggestion} className="public-suggestion pressable" onClick={() => void search(suggestion)}><Text>{suggestion}</Text><Text>›</Text></View>)}</View>
          <View className="public-source-note"><Text className="public-source-note-title">信息边界</Text><Text>只查询服务时间、地点、活动与办事指南。身体不适可问 Claw；诊疗判断由医生完成。</Text></View>
        </View>
      ) : null}

      {error ? <View className="settings-state compact"><Text className="settings-state-title">暂时无法查询</Text><Text className="settings-state-copy">{error}</Text><Button className="secondary pressable" onClick={() => void search()}>重新查询</Button></View> : null}

      {searched && !loading && !error && !items.length ? <View className="settings-empty"><View className="settings-empty-mark">无</View><Text className="settings-empty-title">没有找到已核验资料</Text><Text className="settings-empty-copy">换一个更短的关键词，或在“消息”里联系所属家医团队。</Text></View> : null}

      {items.length ? <View className="public-results"><Text className="settings-group-label">查询结果 · {items.length}</Text>{items.map((item) => <View className={`public-result ${item.stale ? "stale" : ""}`} key={item.id}><View className="public-result-head"><Text className="public-result-title">{item.title}</Text><Text className={`status ${item.stale ? "warning" : ""}`}>{item.stale ? "需核验" : "已核验"}</Text></View><Text className="public-result-content">{item.stale ? "这条资料已经超过有效期，请通过原文或联系机构确认后再办理。" : item.content}</Text><View className="public-result-meta"><View className="grow"><Text className="public-result-source">{item.sourceName || "所属机构"}</Text><Text className="public-result-date">核验于 {formatDate(item.verifiedAt)}</Text></View><Button className="public-source-button pressable" onClick={() => openSource(item)}>查看原文</Button></View></View>)}</View> : null}
    </View>
  );
}
