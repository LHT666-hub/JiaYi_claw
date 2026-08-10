import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type Message = { id: string; title: string; content: string; is_read: boolean; created_at: string };
export default function MessagesPage() { const [messages, setMessages] = useState<Message[]>([]); const [bound, setBound] = useState(false); useDidShow(() => { void apiRequest<{ messages: Message[]; channelBindings: unknown[] }>("/api/v1/messages").then((data) => { setMessages(data.messages); setBound(data.channelBindings.length > 0); }).catch((error) => Taro.showToast({ title: error.message, icon: "none" })); }); return <View className="page"><View className="card"><Text className="title">消息</Text><View className="subtitle">服务进度、团队补充资料和社区通知。</View><View className="muted">企业微信：{bound ? "已绑定" : "未绑定"}</View></View>{messages.length ? messages.map((item) => <View className="card" key={item.id}><View className="row"><Text className="grow" style={{ fontWeight: 600 }}>{item.title}</Text>{!item.is_read ? <Text className="status">新</Text> : null}</View><View className="subtitle">{item.content}</View><View className="muted">{new Date(item.created_at).toLocaleString()}</View></View>) : <View className="card"><Text className="muted">暂时没有新消息。</Text></View>}</View>; }
