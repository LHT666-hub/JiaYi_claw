import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { BookHeart, CalendarDays, ExternalLink, MessageCircleMore, ShieldCheck } from "lucide-react-taro";
import { PageFeedback, PageSkeleton } from "../../components/PageState";
import { apiRequest } from "../../lib/api";

type ContentItem = {
  id: string;
  category: string;
  title: string;
  summary: string;
  cover_url?: string | null;
  original_url: string;
  source_name: string;
  published_at?: string | null;
  reviewed_at?: string | null;
  effective_from?: string | null;
  expires_at?: string | null;
  institution?: { name?: string } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未设置" : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

const labels: Record<string, string> = {
  activity: "社区活动",
  health_classroom: "家医小课堂",
  notice: "服务通知",
  schedule_notice: "排班通知",
  policy: "政策信息",
};

export default function ContentDetailPage() {
  const [contentId, setContentId] = useState("");
  const [item, setItem] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ item: ContentItem }>(`/api/v1/content/${encodeURIComponent(id)}`, { auth: "optional" });
      setItem(result.item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容暂时无法读取。");
    } finally {
      setLoading(false);
    }
  }

  useLoad((params) => {
    const id = params.id?.trim() ?? "";
    if (!id) {
      setError("内容编号无效。");
      setLoading(false);
      return;
    }
    setContentId(id);
    void load(id);
  });

  function openOriginal() {
    if (!item) return;
    void Taro.navigateTo({
      url: `/pages/browser/index?url=${encodeURIComponent(item.original_url)}&contentId=${encodeURIComponent(item.id)}`,
    });
  }

  function askClaw() {
    if (!item) return;
    const prompt = "请用简单的话告诉我这篇内容讲了什么，我需要注意哪些办理信息？";
    void Taro.navigateTo({ url: `/pages/ask/index?prompt=${encodeURIComponent(prompt)}&contentId=${encodeURIComponent(item.id)}&sourceLabel=${encodeURIComponent(item.title)}` });
  }

  return <View className="page content-detail-page">
    {loading ? <PageSkeleton rows={4} /> : null}
    {!loading && error ? <PageFeedback title="内容暂时不可用" message={error} onRetry={() => contentId ? void load(contentId) : void Taro.navigateBack()} /> : null}
    {item ? <>
      <View className="content-detail-heading">
        <Text className="eyebrow">{labels[item.category] ?? "健康资讯"}</Text>
        <Text className="content-detail-title">{item.title}</Text>
        <Text className="content-detail-published">发布于 {formatDate(item.published_at ?? item.reviewed_at)}</Text>
      </View>
      {item.cover_url ? <Image className="content-detail-cover" src={item.cover_url} mode="aspectFill" aria-label={`${item.title} 封面`} /> : <View className="content-detail-cover fallback"><BookHeart size={38} color="#557C6C" strokeWidth={1.8} /></View>}
      <View className="content-detail-card">
        <Text className="content-detail-card-label">经审核摘要</Text>
        <Text className="content-detail-summary">{item.summary}</Text>
      </View>
      <View className="content-detail-source">
        <View className="content-detail-source-mark"><ShieldCheck size={22} color="#2F6C56" strokeWidth={2.1} /></View>
        <View className="grow">
          <Text className="content-detail-source-label">来源与有效性</Text>
          <Text className="content-detail-source-name">{item.institution?.name ?? item.source_name}</Text>
          <Text className="content-detail-source-meta">核验于 {formatDate(item.reviewed_at)}{item.expires_at ? ` · 有效至 ${formatDate(item.expires_at)}` : ""}</Text>
        </View>
      </View>
      <View className="content-detail-boundary"><CalendarDays size={19} color="#8A6735" /><Text>本文仅作公开健康教育或服务通知，不作为诊断、处方或实时号源依据。</Text></View>
      <View className="content-detail-actions"><Button className="secondary content-detail-action pressable" onClick={askClaw}><MessageCircleMore size={20} color="#2F6C56" /><Text>问 Claw</Text></Button><Button className="primary content-detail-action pressable" onClick={openOriginal}><ExternalLink size={20} color="#FFFFFF" /><Text>打开官方原文</Text></Button></View>
    </> : null}
  </View>;
}
