import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { apiRequest } from "../../lib/api";

type Binding = {
  id: string;
  residentName: string;
  familyName: string;
  relationship: string;
  status: "pending" | "active" | "disabled";
};

type LinkData = {
  role: "resident" | "family" | "admin";
  bindings: Binding[];
};

export default function FamilyLinkPage() {
  const [data, setData] = useState<LinkData | null>(null);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [relationship, setRelationship] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<LinkData>("/api/v1/family-links"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "家属关系暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  async function generate() {
    setSavingId("generate");
    try {
      const result = await apiRequest<{ code: string; expiresAt: string }>(
        "/api/v1/family-links",
        { method: "POST" },
      );
      setCode(result.code);
      setExpiresAt(result.expiresAt);
      Taro.showToast({ title: "授权码已生成", icon: "success" });
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "生成失败", icon: "none" });
    } finally {
      setSavingId("");
    }
  }

  async function copy() {
    if (!code) return;
    await Taro.setClipboardData({ data: code });
  }

  async function redeem() {
    setSavingId("redeem");
    try {
      await apiRequest("/api/v1/family-links", {
        method: "PUT",
        data: { code, relationship: relationship.trim() },
      });
      Taro.showToast({ title: "绑定成功", icon: "success" });
      setCode("");
      setRelationship("");
      await load();
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "绑定失败", icon: "none" });
    } finally {
      setSavingId("");
    }
  }

  async function revoke(binding: Binding) {
    const name = data?.role === "family" ? binding.residentName : binding.familyName;
    const confirmation = await Taro.showModal({
      title: "解除家属授权",
      content: `解除与${name}的授权后，将不能继续代办或查看对方的服务进度。`,
      confirmText: "确认解除",
      confirmColor: "#a44a3f",
    });
    if (!confirmation.confirm) return;
    setSavingId(binding.id);
    try {
      await apiRequest("/api/v1/family-links", {
        method: "DELETE",
        data: { bindingId: binding.id },
      });
      Taro.showToast({ title: "授权已解除", icon: "success" });
      await load();
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "解除失败", icon: "none" });
    } finally {
      setSavingId("");
    }
  }

  if (loading) {
    return <View className="page settings-state"><View className="loading-mark" /><Text>正在读取家属关系</Text></View>;
  }

  if (error) {
    return <View className="page settings-state"><Text className="settings-state-title">家属关系暂时无法加载</Text><Text className="settings-state-copy">{error}</Text><Button className="primary pressable" onClick={() => void load()}>重新加载</Button></View>;
  }

  return (
    <View className="page settings-page">
      <View className="page-heading">
        <Text className="eyebrow">居民本人授权</Text>
        <Text className="title">家属协助</Text>
        <Text className="subtitle">家属关系可随时撤销，所有代办都保留操作记录。</Text>
      </View>

      {data?.role === "resident" ? (
        <View className="card family-action-card">
          <View className="settings-section-head"><View className="settings-icon green">家</View><View className="grow"><Text className="settings-section-title">邀请家属协助</Text><Text className="settings-section-note">授权码仅在 15 分钟内有效，使用一次后失效</Text></View></View>
          {code ? (
            <View className="link-code pressable" onClick={() => void copy()}>
              <Text>{code}</Text>
              <Text className="muted">点击复制 · {new Date(expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效</Text>
            </View>
          ) : (
            <View className="notice">生成授权码即表示您同意家属在授权范围内代为提交服务、查看进度和补充资料。</View>
          )}
          <Button className="primary pressable" loading={savingId === "generate"} disabled={Boolean(savingId)} onClick={() => void generate()}>{code ? "重新生成" : "生成家属授权码"}</Button>
        </View>
      ) : null}

      {data?.role === "family" ? (
        <View className="card family-action-card">
          <View className="settings-section-head"><View className="settings-icon blue">绑</View><View className="grow"><Text className="settings-section-title">绑定要协助的家人</Text><Text className="settings-section-note">请向居民本人获取一次性授权码</Text></View></View>
          <Text className="label">授权码</Text>
          <Input className="input otp-input" maxlength={8} value={code} onInput={(event) => setCode(event.detail.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ""))} placeholder="8 位授权码" />
          <Text className="label">您与居民的关系</Text>
          <Input className="input" maxlength={20} value={relationship} onInput={(event) => setRelationship(event.detail.value)} placeholder="例如：女儿、儿子、配偶" />
          <Button className="primary pressable" loading={savingId === "redeem"} disabled={Boolean(savingId) || code.length !== 8 || !relationship.trim()} onClick={() => void redeem()}>确认绑定</Button>
        </View>
      ) : null}

      {data?.bindings.length ? (
        <View className="settings-group">
          <Text className="settings-group-label">已绑定家人</Text>
          {data.bindings.map((binding) => (
            <View key={binding.id} className="family-binding-row">
              <View className="settings-icon small green">{data.role === "family" ? "助" : "家"}</View>
              <View className="grow"><Text className="consent-title">{data.role === "family" ? binding.residentName : binding.familyName}</Text><Text className="consent-note">{binding.relationship} · {binding.status === "active" ? "已授权" : "已解除"}</Text></View>
              {binding.status === "active" ? <Button className="inline-danger pressable" loading={savingId === binding.id} disabled={Boolean(savingId)} onClick={() => void revoke(binding)}>解除</Button> : null}
            </View>
          ))}
        </View>
      ) : (
        <View className="settings-empty"><View className="settings-empty-mark">家</View><Text className="settings-empty-title">尚未建立家属关系</Text><Text className="settings-empty-copy">绑定前，家属无法查看居民资料、服务申请或进度。</Text></View>
      )}
      <Text className="settings-footnote">授权范围由居民决定，解除后即时停止新的代办访问。</Text>
    </View>
  );
}
