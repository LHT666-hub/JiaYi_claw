import { Button, Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

export default function WorkbenchPage() { const [items, setItems] = useState<Array<{ id: string; title: string; summary: string; status: string }>>([]); async function load() { try { const data = await apiRequest<{ requests: typeof items }>("/api/v1/staff/work-queue"); setItems(data.requests); } catch { setItems([]); } } useDidShow(() => { void load(); }); async function accept(id: string) { await apiRequest(`/api/v1/service-requests/${id}/actions/accept`, { method: "POST", data: { note: "工作人员已受理。" } }); await load(); } return <View className="page"><View className="card"><Text className="title">工作队列</Text><View className="subtitle">小程序仅提供快速受理，完整号源回写请使用 Web 工作台。</View></View>{items.map((item) => <View className="card" key={item.id}><Text style={{ fontWeight: 600 }}>{item.title}</Text><View className="subtitle">{item.summary}</View>{item.status === "submitted" ? <Button className="primary" onClick={() => accept(item.id)}>受理</Button> : <Text className="status">{item.status}</Text>}</View>)}</View>; }
