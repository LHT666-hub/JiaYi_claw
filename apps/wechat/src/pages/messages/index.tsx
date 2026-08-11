import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest } from "../../lib/api";

type Message = {
  id: string;
  type: string;
  title: string;
  content: string;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
};

const messageGlyphs: Record<string, string> = {
  service_request: "办",
  todo_status_changed: "办",
  ask_todo_created: "问",
  family_binding_created: "家",
  group_notice: "讯",
  course_recommended: "课",
  system: "知",
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [bound, setBound] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<{
        messages: Message[];
        channelBindings: unknown[];
      }>("/api/v1/messages");
      setMessages(data.messages);
      setBound(data.channelBindings.length > 0);
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : "消息加载失败",
        icon: "none",
      });
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  async function markRead(message: Message) {
    if (!message.is_read) {
      await apiRequest("/api/v1/messages", {
        method: "PATCH",
        data: { id: message.id },
      });
      setMessages((items) =>
        items.map((item) =>
          item.id === message.id ? { ...item, is_read: true } : item,
        ),
      );
    }
    if (!message.link_url) return;
    if (message.link_url.startsWith("/appointments"))
      void Taro.navigateTo({ url: "/pages/progress/index" });
    else if (message.link_url.startsWith("/services"))
      void Taro.switchTab({ url: "/pages/services/index" });
  }

  async function markAllRead() {
    await apiRequest("/api/v1/messages", {
      method: "PATCH",
      data: { markAllRead: true },
    });
    setMessages((items) => items.map((item) => ({ ...item, is_read: true })));
  }

  const unreadCount = messages.filter((item) => !item.is_read).length;

  function timeLabel(value: string) {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString())
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return (
    <View className="page messages-page">
      <View className="messages-heading">
        <View>
          <Text className="eyebrow">家医团队通知</Text>
          <Text className="brand-title left">消息</Text>
        </View>
        {unreadCount ? (
          <Button className="mark-read-button pressable" size="mini" onClick={() => void markAllRead()}>
            全部已读
          </Button>
        ) : null}
      </View>

      <View className={`channel-status ${bound ? "connected" : ""}`}>
        <View className="channel-status-dot" />
        <View className="grow">
          <Text className="channel-status-title">
            企业微信渠道{bound ? "已绑定" : "未绑定"}
          </Text>
          <Text className="channel-status-copy">
            {bound
              ? "服务进度会通过已授权渠道同步"
              : "App 消息仍可正常接收，绑定后可多渠道触达"}
          </Text>
        </View>
        <Text className="channel-status-label">{bound ? "正常" : "可选"}</Text>
      </View>

      <View className="messages-section-head">
        <Text className="service-section-title">收件箱</Text>
        <Text className="service-section-note">
          {unreadCount ? `${unreadCount} 条未读` : "暂无未读"}
        </Text>
      </View>

      {loading ? <View className="message-loading">正在同步消息...</View> : null}
      {!loading && messages.length ? (
        <View className="message-list-surface">
          {messages.map((item) => (
            <View
              className={`message-list-row pressable ${item.is_read ? "read" : ""}`}
              key={item.id}
              onClick={() => void markRead(item)}
            >
              <View className={`message-glyph message-${item.type}`}>
                {messageGlyphs[item.type] ?? "知"}
              </View>
              <View className="grow">
                <View className="message-title-line">
                  <Text className="message-row-title">{item.title}</Text>
                  <Text className="message-time">{timeLabel(item.created_at)}</Text>
                </View>
                <Text className="message-row-copy">{item.content}</Text>
              </View>
              {!item.is_read ? <View className="message-unread-dot" /> : null}
            </View>
          ))}
        </View>
      ) : null}
      {!loading && !messages.length ? (
        <View className="messages-empty">
          <View className="messages-empty-mark">✓</View>
          <Text className="messages-empty-title">消息都处理好了</Text>
          <Text className="messages-empty-copy">
            预约进度、团队补充资料和活动通知会出现在这里。
          </Text>
        </View>
      ) : null}
    </View>
  );
}
