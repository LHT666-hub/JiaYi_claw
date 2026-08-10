import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, withCareSubject } from "../../lib/api";

const labels: Record<string, string> = {
  draft: "待确认",
  submitted: "已提交",
  needs_info: "待补充",
  accepted: "已受理",
  checking_availability: "确认号源中",
  awaiting_user_confirmation: "等待您确认",
  booked: "预约成功",
  waitlisted: "候补中",
  failed: "暂未约成",
  completed: "已完成",
  cancelled: "已取消",
};
export default function ProgressPage() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      title: string;
      summary: string;
      status: string;
      created_at: string;
      appointment_details?: Array<{
        scheduled_at?: string | null;
        institution_name?: string | null;
        department_name?: string | null;
        clinician_name?: string | null;
        booking_reference?: string | null;
      }>;
    }>
  >([]);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleNote, setRescheduleNote] = useState("");
  async function load() {
    try {
      const data = await apiRequest<{ requests: typeof items }>(
        withCareSubject("/api/v1/service-requests"),
      );
      setItems(data.requests);
    } catch {
      setItems([]);
    } finally {
      Taro.stopPullDownRefresh();
    }
  }
  useDidShow(() => {
    void load();
  });
  usePullDownRefresh(() => {
    void load();
  });
  async function action(id: string, name: string, note?: string) {
    try {
      await apiRequest(`/api/v1/service-requests/${id}/actions/${name}`, {
        method: "POST",
        data: {
          note:
            note ??
            (name === "cancel" ? "居民申请取消。" : "居民确认预约时间。"),
        },
      });
      await load();
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "操作失败",
        icon: "none",
      });
    }
  }
  async function requestReschedule(id: string) {
    if (!rescheduleNote.trim())
      return Taro.showToast({ title: "请填写希望调整的时间", icon: "none" });
    await action(
      id,
      "request_reschedule",
      `居民申请改期：${rescheduleNote.trim()}`,
    );
    setRescheduleId(null);
    setRescheduleNote("");
  }
  return (
    <View className="page">
      {items.length ? (
        items.map((item) => {
          const details = item.appointment_details?.[0];
          return (
            <View className="card" key={item.id}>
              <View className="row">
                <Text className="grow" style={{ fontWeight: 600 }}>
                  {item.title}
                </Text>
                <Text className="status">
                  {labels[item.status] || item.status}
                </Text>
              </View>
              <View className="subtitle">{item.summary}</View>
              {details?.scheduled_at ? (
                <View className="notice">
                  <Text>{new Date(details.scheduled_at).toLocaleString()}</Text>
                  <View className="muted">
                    {[
                      details.institution_name,
                      details.department_name,
                      details.clinician_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </View>
                  {details.booking_reference ? (
                    <View className="muted">
                      预约编号：{details.booking_reference}
                    </View>
                  ) : null}
                </View>
              ) : null}
              {item.status === "awaiting_user_confirmation" ? (
                <>
                  <Button
                    className="primary"
                    onClick={() => action(item.id, "confirm_booking")}
                  >
                    确认预约时间
                  </Button>
                  <Button
                    className="secondary"
                    onClick={() =>
                      setRescheduleId(rescheduleId === item.id ? null : item.id)
                    }
                  >
                    申请改期
                  </Button>
                  {rescheduleId === item.id ? (
                    <View className="notice">
                      <Input
                        className="input"
                        value={rescheduleNote}
                        onInput={(event) =>
                          setRescheduleNote(event.detail.value)
                        }
                        placeholder="例如：下周二下午"
                      />
                      <Button
                        className="primary"
                        onClick={() => requestReschedule(item.id)}
                      >
                        提交改期需求
                      </Button>
                    </View>
                  ) : null}
                </>
              ) : null}
              {!["failed", "completed", "cancelled"].includes(item.status) ? (
                <Button
                  className="secondary"
                  onClick={() => action(item.id, "cancel")}
                >
                  取消申请
                </Button>
              ) : null}
            </View>
          );
        })
      ) : (
        <View className="card">
          <Text className="muted">暂无服务申请，下拉可刷新。</Text>
        </View>
      )}
    </View>
  );
}
