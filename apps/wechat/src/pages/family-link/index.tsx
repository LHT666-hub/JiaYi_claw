import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type Binding = { id: string; residentName: string; familyName: string; relationship: string; status: string };
type LinkData = { role: "resident" | "family" | "admin"; bindings: Binding[] };

export default function FamilyLinkPage() {
  const [data, setData] = useState<LinkData | null>(null);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [relationship, setRelationship] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try { setData(await apiRequest<LinkData>("/api/v1/family-links")); }
    catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" }); }
  }
  useLoad(() => { void load(); });

  async function generate() {
    setLoading(true);
    try {
      const result = await apiRequest<{ code: string; expiresAt: string }>("/api/v1/family-links", { method: "POST" });
      setCode(result.code); setExpiresAt(result.expiresAt);
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "生成失败", icon: "none" }); }
    finally { setLoading(false); }
  }

  async function copy() {
    await Taro.setClipboardData({ data: code });
  }

  async function redeem() {
    setLoading(true);
    try {
      await apiRequest("/api/v1/family-links", { method: "PUT", data: { code, relationship } });
      Taro.showToast({ title: "绑定成功", icon: "success" }); setCode(""); await load();
    } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "绑定失败", icon: "none" }); }
    finally { setLoading(false); }
  }

  return <View className="page"><Text className="eyebrow">居民本人授权</Text><Text className="brand-title left">家属协助</Text>
    {data?.role === "resident" ? <View className="card"><Text className="title">邀请家属协助</Text><View className="subtitle">授权码 15 分钟有效，使用一次后自动失效。</View>{code ? <View className="link-code" onClick={copy}><Text>{code}</Text><Text className="muted">点击复制 · {new Date(expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效</Text></View> : <View className="notice">生成授权码代表您同意家属在绑定后，在授权范围内代办服务。</View>}<Button className="primary" loading={loading} onClick={generate}>{code ? "重新生成" : "生成家属授权码"}</Button></View> : null}
    {data?.role === "family" ? <View className="card"><Text className="title">绑定要协助的家人</Text><View className="subtitle">向居民本人获取 8 位一次性授权码。</View><Text className="label">授权码</Text><Input className="input otp-input" maxlength={8} value={code} onInput={(event) => setCode(event.detail.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ""))} placeholder="8 位授权码" /><Text className="label">您与居民的关系</Text><Input className="input" maxlength={20} value={relationship} onInput={(event) => setRelationship(event.detail.value)} placeholder="例如：女儿、儿子、配偶" /><Button className="primary" loading={loading} disabled={code.length !== 8 || !relationship} onClick={redeem}>确认绑定</Button></View> : null}
    {data?.bindings.length ? <View className="card"><Text className="title">已绑定家人</Text>{data.bindings.map((binding) => <View key={binding.id} className="binding-row"><View><Text className="consent-title">{data.role === "family" ? binding.residentName : binding.familyName}</Text><Text className="consent-note">{binding.relationship} · {binding.status === "active" ? "已授权" : "待核验"}</Text></View></View>)}</View> : null}
  </View>;
}
