import {
  Button,
  Checkbox,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, getCareSubjectId } from "../../lib/api";

export default function AppointmentPage() {
  const [serviceType, setServiceType] = useState("clinic_registration");
  const [fromClaw, setFromClaw] = useState(false);
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("上午");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  useLoad((params) => {
    if (params.type) setServiceType(params.type);
    if (params.target) setTarget(params.target);
    if (params.note) setNote(params.note);
    if (params.department) {
      setNote((current) =>
        [current, `Claw 识别科室：${params.department}`]
          .filter(Boolean)
          .join("；"),
      );
    }
    if (params.doctor) {
      setNote((current) =>
        [current, `居民期望医生：${params.doctor}`].filter(Boolean).join("；"),
      );
    }
    setFromClaw(params.from === "claw");
  });

  const serviceName =
    serviceType === "refill_request"
      ? "续方配药协助"
      : serviceType === "family_doctor_booking"
        ? "家庭医生预约"
        : serviceType === "followup_reminder"
          ? "随访安排"
          : serviceType === "referral_assistance"
            ? "分级转诊协助"
            : "门诊挂号协助";

  async function submit() {
    if (!target || !date || !phone || !confirmed)
      return Taro.showToast({ title: "请补齐信息并确认提交", icon: "none" });
    setLoading(true);
    try {
      await apiRequest("/api/v1/service-requests", {
        method: "POST",
        idempotencyKey: `${Date.now()}-${Math.random()}`,
        data: {
          residentId: getCareSubjectId() || undefined,
          serviceType,
          title: serviceName,
          summary: `${target}${note ? `。${note}` : ""}`,
          priority: "low",
          requestedRole: "community",
          confirmed: true,
          appointment: {
            target,
            department: null,
            preferredDoctor: null,
            preferredDates: [date],
            preferredTime: time,
            contactPhone: phone,
            acceptWaitlist: true,
            note: note || null,
          },
        },
      });
      Taro.showToast({ title: "已提交", icon: "success" });
      setTarget("");
      setDate("");
      setPhone("");
      setNote("");
      setConfirmed(false);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "提交失败",
        icon: "none",
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <View className="page">
      <View className="card">
        <Text className="title">{serviceName}</Text>
        <View className="subtitle">
          家医团队人工核验办理条件并回写结果，不展示推测号源。
        </View>
        {fromClaw ? (
          <View className="claw-draft-notice">
            <Text className="claw-draft-title">Claw 已整理办理草稿</Text>
            <Text className="claw-draft-copy">
              请核对服务对象、诉求和时间。勾选确认前，系统不会提交任何申请。
            </Text>
          </View>
        ) : null}
        <Text className="label">主要想解决什么问题</Text>
        <Textarea
          className="textarea"
          value={target}
          onInput={(event) => setTarget(event.detail.value)}
          placeholder="例如：高血压复诊，希望看心内科"
        />
        <Text className="label">希望日期</Text>
        <Picker
          mode="date"
          value={date}
          onChange={(event) => setDate(event.detail.value)}
        >
          <View className="input row">{date || "请选择日期"}</View>
        </Picker>
        <Text className="label">希望时段</Text>
        <Picker
          mode="selector"
          range={["上午", "下午", "均可"]}
          onChange={(event) =>
            setTime(["上午", "下午", "均可"][Number(event.detail.value)])
          }
        >
          <View className="input row">{time}</View>
        </Picker>
        <Text className="label">联系电话</Text>
        <Input
          className="input"
          type="number"
          value={phone}
          onInput={(event) => setPhone(event.detail.value)}
          placeholder="用于接收确认"
        />
        <Text className="label">补充说明</Text>
        <Textarea
          className="textarea"
          value={note}
          onInput={(event) => setNote(event.detail.value)}
        />
        <View className="row" onClick={() => setConfirmed(!confirmed)}>
          <Checkbox value="confirmed" checked={confirmed} />
          <Text className="muted">我已核对以上信息，确认发送给家医团队</Text>
        </View>
        <Button className="primary" loading={loading} onClick={submit}>
          确认提交预约
        </Button>
      </View>
    </View>
  );
}
