import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { apiRequest } from "../../lib/api";

type DeletionRequest = { status: "pending" | "processing" | "cancelled" | "completed"; scheduled_for: string };

export default function AccountSecurityPage() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ request: DeletionRequest | null }>("/api/v1/account-deletion");
      setRequest(result.request);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "账号状态暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    void load();
  });

  async function act(action: "request" | "cancel") {
    if (action === "request") {
      const modal = await Taro.showModal({
        title: "确认申请注销账号",
        content: "提交后进入冷静期。正在办理的预约或转诊不会自动完成，请先与家医团队确认。",
        confirmText: "提交申请",
        confirmColor: "#a44a3f",
      });
      if (!modal.confirm) return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ request: DeletionRequest }>("/api/v1/account-deletion", {
        method: "POST",
        data: action === "request" ? { action, reason: reason.trim() || undefined } : { action },
      });
      setRequest(result.request);
      setConfirmation("");
      Taro.showToast({ title: action === "request" ? "注销申请已提交" : "申请已撤销", icon: "success" });
    } catch (reasonValue) {
      Taro.showToast({ title: reasonValue instanceof Error ? reasonValue.message : "操作失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View className="page settings-state"><View className="loading-mark" /><Text>正在核对账号状态</Text></View>;
  if (error) return <View className="page settings-state"><Text className="settings-state-title">账号状态暂时无法加载</Text><Text className="settings-state-copy">{error}</Text><Button className="primary pressable" onClick={() => void load()}>重新加载</Button></View>;

  const pending = request?.status === "pending" || request?.status === "processing";
  return (
    <View className="page settings-page">
      <View className="page-heading"><Text className="eyebrow">账号管理</Text><Text className="title">账号与安全</Text><Text className="subtitle">注销不是退出登录，重要服务办理完成后再操作。</Text></View>
      {pending ? (
        <View className="security-pending">
          <View className="settings-section-head"><View className="settings-icon danger">期</View><View className="grow"><Text className="settings-section-title">注销申请处理中</Text><Text className="settings-section-note">计划处理：{new Date(request.scheduled_for).toLocaleString("zh-CN")}</Text></View></View>
          <Text className="security-copy">冷静期内账号仍可正常使用。正式处理后将停用登录、撤回授权，并按保留规则删除或匿名化资料。</Text>
          {request.status === "pending" ? <Button className="secondary pressable" loading={saving} onClick={() => void act("cancel")}>撤销注销申请</Button> : <Text className="settings-footnote">账号正在执行停用流程，如需帮助请联系机构管理员。</Text>}
        </View>
      ) : (
        <>
          <View className="security-summary"><View className="settings-section-head"><View className="settings-icon danger">安</View><View className="grow"><Text className="settings-section-title">注销后会发生什么</Text><Text className="settings-section-note">账号与居民健康资料将进入停用处理</Text></View></View><View className="security-list"><Text>停止手机号和微信登录</Text><Text>撤回健康信息与家属代办授权</Text><Text>删除可直接识别身份的资料</Text><Text>必要审计记录去标识化保留</Text></View></View>
          <View className="settings-group security-form">
            <Text className="settings-group-label">申请信息</Text>
            <Textarea value={reason} maxlength={500} placeholder="注销原因（选填）" className="textarea security-reason" onInput={(event) => setReason(event.detail.value)} />
            <Text className="settings-confirm-label">为避免误操作，请输入“确认注销”</Text>
            <Input value={confirmation} onInput={(event) => setConfirmation(event.detail.value)} className="input" placeholder="确认注销" />
          </View>
          <Button className="danger-button pressable" loading={saving} disabled={saving || confirmation !== "确认注销"} onClick={() => void act("request")}>提交账号注销申请</Button>
        </>
      )}
    </View>
  );
}
