import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type DeletionRequest = { status: string; scheduled_for: string };
export default function AccountSecurityPage() {
  const [request, setRequest] = useState<DeletionRequest | null>(null); const [confirmation, setConfirmation] = useState(""); const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false);
  useDidShow(() => { void apiRequest<{ request: DeletionRequest | null }>("/api/v1/account-deletion").then((result) => setRequest(result.request)).catch((error) => Taro.showToast({ title: error.message, icon: "none" })); });
  async function act(action: "request" | "cancel") { setSaving(true); try { const result = await apiRequest<{ request: DeletionRequest }>("/api/v1/account-deletion", { method: "POST", data: action === "request" ? { action, reason } : { action } }); setRequest(result.request); setConfirmation(""); Taro.showToast({ title: action === "request" ? "注销申请已提交" : "申请已撤销", icon: "success" }); } catch (error) { Taro.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" }); } finally { setSaving(false); } }
  const pending = request?.status === "pending" || request?.status === "processing";
  return <View className="page"><View className="page-heading"><Text className="title">账号与安全</Text><Text className="subtitle">注销不是退出登录，请谨慎操作</Text></View>{pending ? <View className="card danger-card"><Text className="label">注销申请处理中</Text><Text className="subtitle">计划处理时间：{new Date(request.scheduled_for).toLocaleString()}</Text><Text className="muted">冷静期内账号仍可使用。正式处理后将停用登录并删除或匿名化个人资料。</Text>{request.status === "pending" ? <Button className="secondary" loading={saving} onClick={() => void act("cancel")}>撤销注销申请</Button> : null}</View> : <><View className="card"><Text className="label">注销后会发生什么</Text><Text className="muted">停止手机号和微信登录；撤回健康信息和家属代办授权；删除可识别身份的资料；必要审计记录会去标识化保留。</Text></View><View className="card"><Textarea value={reason} maxlength={500} placeholder="注销原因（选填）" className="textarea" onInput={(event) => setReason(event.detail.value)} /><Text className="muted">请输入“确认注销”</Text><Input value={confirmation} onInput={(event) => setConfirmation(event.detail.value)} className="input" /></View><Button className="danger-button" disabled={saving || confirmation !== "确认注销"} onClick={() => void act("request")}>提交账号注销申请</Button></>}</View>;
}
