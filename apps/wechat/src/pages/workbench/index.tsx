import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useState } from "react";
import { BriefcaseMedical, CircleAlert, LockKeyhole } from "lucide-react-taro";
import { apiRequest } from "../../lib/api";

type WorkItem = { id: string; title: string; summary: string; status: string };

export default function WorkbenchPage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [actingId, setActingId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const data = await apiRequest<{ requests: WorkItem[] }>("/api/v1/staff/work-queue");
      setItems(data.requests);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "工作队列暂时无法加载";
      setForbidden(message.includes("权限"));
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });

  async function accept(id: string) {
    setActingId(id);
    try {
      await apiRequest(`/api/v1/service-requests/${id}/actions/accept`, {
        method: "POST",
        data: { note: "工作人员已受理。" },
      });
      await load();
    } catch (reason) {
      Taro.showToast({ title: reason instanceof Error ? reason.message : "受理失败", icon: "none" });
    } finally {
      setActingId("");
    }
  }

  if (loading) return <View className="page settings-state"><View className="loading-mark" /><Text>正在读取工作队列</Text></View>;
  if (error) return (
    <View className="page settings-state">
      <View className="settings-state-mark">{forbidden ? <LockKeyhole size={28} color="#557C6C" /> : <CircleAlert size={28} color="#9A642C" />}</View>
      <Text className="settings-state-title">{forbidden ? "当前账号没有工作台权限" : "工作队列暂时无法加载"}</Text>
      <Text className="settings-state-copy">{forbidden ? "居民和家属请在服务页查看办理进度；工作人员需使用机构审核过的账号。" : error}</Text>
      {forbidden ? <Button className="primary pressable" onClick={() => Taro.switchTab({ url: "/pages/services/index" })}>返回居民服务</Button> : <Button className="primary pressable" onClick={() => void load()}>重新加载</Button>}
    </View>
  );

  return (
    <View className="page workbench-page">
      <View className="page-heading"><Text className="eyebrow">家医团队</Text><Text className="title">轻量工作队列</Text><Text className="subtitle">移动端用于快速认领和受理，完整号源回写保留在 Web 工作台。</Text></View>
      {!items.length ? <View className="settings-empty"><View className="settings-empty-mark"><BriefcaseMedical size={26} color="#557C6C" /></View><Text className="settings-empty-title">当前没有待处理服务</Text><Text className="settings-empty-copy">新的预约、转诊和随访申请会按机构权限进入这里。</Text></View> : null}
      <View className="workbench-list">
        {items.map((item) => <View className="workbench-item" key={item.id}><Text className="workbench-title">{item.title}</Text><Text className="workbench-summary">{item.summary}</Text>{item.status === "submitted" ? <Button className="primary pressable" loading={actingId === item.id} disabled={Boolean(actingId)} onClick={() => void accept(item.id)}>受理</Button> : <Text className="status">{item.status}</Text>}</View>)}
      </View>
    </View>
  );
}
