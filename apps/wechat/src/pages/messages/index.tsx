import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useState } from "react";
import {
  Bell,
  BookHeart,
  CircleCheckBig,
  ClipboardCheck,
  Megaphone,
  MessageSquareText,
  UsersRound,
} from "lucide-react-taro";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
import { useReloadOnNetworkRestore } from "../../components/NetworkStatus";
import { ClawAssistStrip } from "../../components/ClawAssistStrip";
import CustomTabBar from "../../custom-tab-bar";
import { apiRequest } from "../../lib/api";
import { resolveMessageDestination } from "../../lib/messageNavigation";

type Message = {
  id: string;
  type: string;
  title: string;
  content: string;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
};

function MessageGlyph({ type }: { type: string }) {
  const props = { size: 22, strokeWidth: 2.1 } as const;
  if (["service_request", "todo_status_changed"].includes(type))
    return <ClipboardCheck {...props} color="#2F6C56" />;
  if (type === "ask_todo_created")
    return <MessageSquareText {...props} color="#365F8A" />;
  if (type === "family_binding_created")
    return <UsersRound {...props} color="#8B5E83" />;
  if (type === "group_notice")
    return <Megaphone {...props} color="#A0642B" />;
  if (type === "course_recommended")
    return <BookHeart {...props} color="#2F6C56" />;
  return <Bell {...props} color="#365F8A" />;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [bound, setBound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{
        messages: Message[];
        channelBindings: unknown[];
      }>("/api/v1/messages");
      setMessages(data.messages);
      setBound(data.channelBindings.length > 0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "消息暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void load().finally(() => Taro.stopPullDownRefresh());
  });
  useReloadOnNetworkRestore(() => void load());

  async function markRead(message: Message) {
    try {
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
      const destination = resolveMessageDestination(message.link_url);
      if (destination.kind === "progress") {
        const query = destination.requestId ? `?id=${encodeURIComponent(destination.requestId)}` : "";
        void Taro.navigateTo({ url: `/pages/progress/index${query}` });
      } else if (destination.kind === "services") {
        void Taro.switchTab({ url: "/pages/services/index" });
      } else if (destination.kind === "me") {
        void Taro.switchTab({ url: "/pages/me/index" });
      } else if (destination.kind === "publicInfo") {
        void Taro.navigateTo({ url: "/pages/public-info/index" });
      } else if (destination.kind === "content") {
        void Taro.navigateTo({ url: `/pages/content-detail/index?id=${encodeURIComponent(destination.contentId)}` });
      }
    } catch (caught) {
      void Taro.showToast({ title: caught instanceof Error ? caught.message : "消息状态更新失败", icon: "none" });
    }
  }

  async function markAllRead() {
    try {
      await apiRequest("/api/v1/messages", {
        method: "PATCH",
        data: { markAllRead: true },
      });
      setMessages((items) => items.map((item) => ({ ...item, is_read: true })));
    } catch (caught) {
      void Taro.showToast({ title: caught instanceof Error ? caught.message : "消息状态更新失败", icon: "none" });
    }
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

      {loading && !messages.length ? <PageSkeleton rows={3} /> : null}
      {!loading && error && !messages.length ? (
        <PageFeedback title="消息暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && messages.length ? <InlineRetry message={error} onRetry={() => void load()} /> : null}

      {messages.length || !error ? <><View className="messages-section-head messages-first-section">
        <Text className="service-section-title">收件箱</Text>
        <Text className="service-section-note">
          {unreadCount ? `${unreadCount} 条未读` : "暂无未读"}
        </Text>
      </View>

      {!loading && messages.length ? (
        <View className="message-list-surface">
          {messages.map((item) => (
            <View
              className={`message-list-row pressable ${item.is_read ? "read" : ""}`}
              key={item.id}
              onClick={() => void markRead(item)}
            >
              <View className={`message-glyph message-${item.type}`}>
                <MessageGlyph type={item.type} />
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
          <View className="messages-empty-mark"><CircleCheckBig size={28} color="#2F6C56" strokeWidth={1.9} /></View>
          <Text className="messages-empty-title">消息都处理好了</Text>
          <Text className="messages-empty-copy">
            预约进度、团队补充资料和活动通知会出现在这里。
          </Text>
        </View>
      ) : null}

      <ClawAssistStrip
        eyebrow="看不明白通知？"
        title="让 Claw 整理下一步"
        description="说明通知内容，Claw 帮您判断需要确认或补充什么"
        prompt="我收到一条家医服务通知，想知道下一步应该怎么处理。"
      />

      <View className={`channel-status channel-status-secondary ${bound ? "connected" : ""}`}>
        <View className="channel-status-dot" />
        <View className="grow">
          <Text className="channel-status-title">
            {bound ? "企业微信通知已连接" : "当前通过小程序接收消息"}
          </Text>
          <Text className="channel-status-copy">
            {bound
              ? "服务进度会同步到已授权的企业微信渠道"
              : "机构开通后，可在这里增加企业微信通知"}
          </Text>
        </View>
        <Text className="channel-status-label">{bound ? "已连接" : "可选"}</Text>
      </View>
      </> : null}
      {process.env.TARO_ENV === "h5" ? <CustomTabBar /> : null}
    </View>
  );
}
