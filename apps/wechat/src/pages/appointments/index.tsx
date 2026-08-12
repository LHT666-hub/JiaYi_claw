import { Button, Checkbox, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useMemo, useRef, useState } from "react";
import { apiRequest, getCareSubjectId, withCareSubject } from "../../lib/api";

type ServiceType =
  | "clinic_registration"
  | "family_doctor_booking"
  | "refill_request"
  | "followup_reminder"
  | "referral_assistance"
  | "other";

type HomeContext = {
  profile: { displayName: string; role: string };
  careSubject: { id: string; displayName: string; relationLabel: string };
  network: null | { name: string; community?: { name?: string } };
  serviceCatalog: Array<{
    service_type: string;
    name: string;
    description: string | null;
    owner_role: "doctor" | "nurse" | "pharmacist" | "community";
    access_mode: "team_assisted" | "official_link" | "hybrid" | "information_only";
  }>;
};

type MeContext = { profile: { phone?: string | null } };

const serviceOptions: Array<{
  type: ServiceType;
  name: string;
  short: string;
  note: string;
  ownerRole: "doctor" | "nurse" | "pharmacist" | "community";
  tone: string;
}> = [
  { type: "clinic_registration", name: "门诊挂号协助", short: "挂号", note: "团队核验就诊需求，并提供官方入口或人工协助。", ownerRole: "community", tone: "blue" },
  { type: "family_doctor_booking", name: "家庭医生预约", short: "家医", note: "预约所属社区家庭医生团队的服务时段。", ownerRole: "doctor", tone: "green" },
  { type: "referral_assistance", name: "分级转诊协助", short: "转诊", note: "先由社区评估，再协助对接合作医院和科室。", ownerRole: "community", tone: "berry" },
  { type: "refill_request", name: "续方配药协助", short: "续方", note: "整理既往用药和复诊需求，由医药人员审核。", ownerRole: "pharmacist", tone: "amber" },
  { type: "followup_reminder", name: "随访安排", short: "随访", note: "申请慢病、术后或其他家医随访服务。", ownerRole: "nurse", tone: "coral" },
  { type: "other", name: "社区活动协助", short: "活动", note: "依据已审核通知，由团队核对参加条件和报名方式。", ownerRole: "community", tone: "green" },
];

const timeOptions = ["上午", "下午", "均可"];

function createIdempotencyKey() {
  return `weapp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function decodeParam(value?: string) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AppointmentPage() {
  const [step, setStep] = useState(0);
  const [serviceType, setServiceType] = useState<ServiceType>("clinic_registration");
  const [fromClaw, setFromClaw] = useState(false);
  const [contentId, setContentId] = useState("");
  const [target, setTarget] = useState("");
  const [department, setDepartment] = useState("");
  const [preferredDoctor, setPreferredDoctor] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("上午");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [acceptWaitlist, setAcceptWaitlist] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [context, setContext] = useState<HomeContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [loading, setLoading] = useState(false);
  const idempotencyKey = useRef(createIdempotencyKey());

  const selectedService = useMemo(
    () => {
      const presentation = serviceOptions.find((item) => item.type === serviceType) ?? serviceOptions[0];
      const catalog = context?.serviceCatalog.find((item) => item.service_type === serviceType);
      return catalog ? { ...presentation, name: catalog.name, note: catalog.description ?? presentation.note, ownerRole: catalog.owner_role } : presentation;
    },
    [context?.serviceCatalog, serviceType],
  );
  const availableServiceOptions = useMemo(() => {
    const available = new Map((context?.serviceCatalog ?? [])
      .filter((item) => ["team_assisted", "hybrid"].includes(item.access_mode))
      .map((item) => [item.service_type, item]));
    return serviceOptions.flatMap((presentation) => {
      if (presentation.type === "other") return contentId ? [presentation] : [];
      const catalog = available.get(presentation.type);
      return catalog ? [{ ...presentation, name: catalog.name, note: catalog.description ?? presentation.note, ownerRole: catalog.owner_role }] : [];
    });
  }, [contentId, context?.serviceCatalog]);
  const isClinicalRouting = ["clinic_registration", "referral_assistance"].includes(serviceType);
  const isCommunityActivity = serviceType === "other";
  const supportsAlternatives = ["clinic_registration", "family_doctor_booking", "referral_assistance"].includes(serviceType);
  const timingLabel = isCommunityActivity ? "希望团队联系时间" : serviceType === "refill_request" ? "希望办理时间" : "希望就诊或联系时间";

  useLoad((params) => {
    if (serviceOptions.some((item) => item.type === params.type)) setServiceType(params.type as ServiceType);
    if (params.target) setTarget(decodeParam(params.target));
    if (params.note) setNote(decodeParam(params.note));
    if (params.department) setDepartment(decodeParam(params.department));
    if (params.doctor) setPreferredDoctor(decodeParam(params.doctor));
    if (params.contentId) setContentId(decodeParam(params.contentId));
    setFromClaw(params.from === "claw");

    void (async () => {
      try {
        const [home, me] = await Promise.all([
          apiRequest<HomeContext>(withCareSubject("/api/v1/home")),
          apiRequest<MeContext>(withCareSubject("/api/v1/me")),
        ]);
        setContext(home);
        const requestedType = params.type as ServiceType | undefined;
        const serviceEnabled = home.serviceCatalog.some((item) => item.service_type === requestedType && ["team_assisted", "hybrid"].includes(item.access_mode));
        if (requestedType && requestedType !== "other" && !serviceEnabled) {
          setContextError("所属社区暂未开放这项人工办理服务");
        }
        const savedPhone = me.profile.phone?.replace(/^\+86/, "") ?? "";
        if (savedPhone) setPhone(savedPhone);
      } catch (loadError) {
        setContextError(loadError instanceof Error ? loadError.message : "服务对象信息加载失败");
      } finally {
        setContextLoading(false);
      }
    })();
  });

  function goNext() {
    if (contextError || !availableServiceOptions.some((item) => item.type === serviceType)) {
      Taro.showToast({ title: contextError || "这项服务当前未开放", icon: "none" });
      return;
    }
    if (step === 0 && target.trim().length < 2) {
      Taro.showToast({ title: "请简单说明本次服务需求", icon: "none" });
      return;
    }
    if (step === 1 && (!date || !/^1\d{10}$/.test(phone))) {
      Taro.showToast({ title: "请选择日期并填写正确手机号", icon: "none" });
      return;
    }
    setStep((value) => Math.min(value + 1, 2));
  }

  async function submit() {
    if (contextError || !availableServiceOptions.some((item) => item.type === serviceType)) {
      Taro.showToast({ title: contextError || "这项服务当前未开放", icon: "none" });
      return;
    }
    if (!confirmed) {
      Taro.showToast({ title: "请确认信息后再提交", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/api/v1/service-requests", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        data: {
          residentId: getCareSubjectId() || undefined,
          serviceType,
          title: selectedService.name,
          summary: [target.trim(), note.trim()].filter(Boolean).join("。"),
          priority: "low",
          requestedRole: selectedService.ownerRole,
          confirmed: true,
          ...(contentId ? { sourceContext: { type: "content", id: contentId } } : {}),
          appointment: {
            target: target.trim(),
            department: department.trim() || null,
            preferredDoctor: preferredDoctor.trim() || null,
            preferredDates: [date],
            preferredTime: time,
            contactPhone: phone,
            acceptWaitlist,
            note: note.trim() || null,
          },
        },
      });
      Taro.showToast({ title: "申请已提交", icon: "success" });
      idempotencyKey.current = createIdempotencyKey();
      setTimeout(() => Taro.redirectTo({ url: "/pages/progress/index?submitted=1" }), 350);
    } catch (submitError) {
      Taro.showToast({ title: submitError instanceof Error ? submitError.message : "提交失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="page appointment-page">
      <View className="appointment-head">
        <Text className="eyebrow">服务办理 · {step + 1}/3</Text>
        <Text className="appointment-title">{step === 0 ? "说清需要办理什么" : step === 1 ? "选择方便联系的时间" : "最后核对一次"}</Text>
        <Text className="appointment-subtitle">{isCommunityActivity ? "团队会依据已审核原文核对参加条件和报名方式。" : "家医团队人工核验办理条件与可用资源，不展示推测信息。"}</Text>
      </View>

      {contextError ? <View className="appointment-warning">{contextError}。请返回首页重新选择服务对象。</View> : null}
      <View className="appointment-subject">
        <View className="subject-avatar">{contextLoading ? "…" : context?.careSubject.displayName.slice(0, 1) ?? "家"}</View>
        <View className="grow">
          <Text className="subject-label">本次服务对象</Text>
          <Text className="subject-name">{contextLoading ? "正在读取" : context?.careSubject.displayName ?? "当前居民"}</Text>
        </View>
        <Text className="appointment-network">{context?.network?.community?.name ?? "所属社区"}</Text>
      </View>

      <View className="appointment-stepper">
        {["事项", "偏好", "确认"].map((label, index) => <View key={label} className={`appointment-step ${index <= step ? "active" : ""}`}><View className="appointment-step-dot">{index < step ? "✓" : index + 1}</View><Text>{label}</Text></View>)}
      </View>

      {step === 0 ? (
        <View className="appointment-surface">
          {fromClaw ? <View className="claw-draft-notice"><Text className="claw-draft-title">Claw 已整理为待确认草稿</Text><Text className="claw-draft-copy">以下内容尚未提交，请检查识别结果。{contentId ? "关联的活动来源会由服务端再次核验并随申请发送。" : ""}</Text></View> : null}
          <Text className="surface-label">选择办理事项</Text>
          <View className="service-choice-grid">
            {availableServiceOptions.map((item) => (
              <View key={item.type} className={`service-choice pressable ${serviceType === item.type ? "selected" : ""}`} onClick={() => setServiceType(item.type)}>
                <View className={`service-choice-icon ${item.tone}`}>{item.short}</View>
                <Text>{item.name}</Text>
              </View>
            ))}
          </View>
          <View className="selected-service-note">{selectedService.note}</View>
          <Text className="label">这次主要想解决什么</Text>
          <Textarea className="textarea appointment-textarea" value={target} maxlength={120} onInput={(event) => setTarget(event.detail.value)} placeholder="例如：血压复诊，希望咨询是否需要转心内科" />
          <View className="field-count">{target.length}/120</View>
          {isClinicalRouting ? <View className="appointment-two-column">
            <View><Text className="label">期望科室（选填）</Text><Input className="input" value={department} maxlength={80} onInput={(event) => setDepartment(event.detail.value)} placeholder="例如：心内科" /></View>
            <View><Text className="label">期望医生（选填）</Text><Input className="input" value={preferredDoctor} maxlength={80} onInput={(event) => setPreferredDoctor(event.detail.value)} placeholder="不知道可不填" /></View>
          </View> : null}
        </View>
      ) : null}

      {step === 1 ? (
        <View className="appointment-surface">
          <Text className="surface-label">{timingLabel}</Text>
          <Picker mode="date" start={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.detail.value)}>
            <View className="appointment-picker pressable"><View><Text className="appointment-picker-label">希望日期</Text><Text className={date ? "appointment-picker-value" : "appointment-picker-placeholder"}>{date || "请选择日期"}</Text></View><Text>›</Text></View>
          </Picker>
          <View className="time-segments">
            {timeOptions.map((item) => <View key={item} className={`time-segment pressable ${time === item ? "selected" : ""}`} onClick={() => setTime(item)}>{item}</View>)}
          </View>
          <Text className="label">联系电话</Text>
          <View className="phone-input"><Text className="country-code">+86</Text><Input className="phone-field" type="number" maxlength={11} value={phone} onInput={(event) => setPhone(event.detail.value.replace(/\D/g, ""))} placeholder="用于服务确认" /></View>
          {supportsAlternatives ? <View className={`waitlist-row pressable ${acceptWaitlist ? "selected" : ""}`} onClick={() => setAcceptWaitlist((value) => !value)}>
            <Checkbox value="waitlist" checked={acceptWaitlist} color="#2f6c56" />
            <View className="grow"><Text className="choice-title">接受相近时段或候补</Text><Text className="choice-note">期望时段没有资源时，团队可先联系您确认其他方案。</Text></View>
          </View> : null}
          <Text className="label">补充说明（选填）</Text>
          <Textarea className="textarea appointment-note" value={note} maxlength={600} onInput={(event) => setNote(event.detail.value)} placeholder="既往就诊、行动不便或其他需要团队了解的情况" />
        </View>
      ) : null}

      {step === 2 ? (
        <View className="appointment-surface review-surface">
          <View className="review-heading"><View className={`service-choice-icon ${selectedService.tone}`}>{selectedService.short}</View><View><Text className="review-title">{selectedService.name}</Text><Text className="review-subject">为 {context?.careSubject.displayName ?? "当前居民"} 办理</Text></View></View>
          <View className="review-list">
            <View className="review-row"><Text>服务需求</Text><Text>{target.trim()}</Text></View>
            {department ? <View className="review-row"><Text>期望科室</Text><Text>{department}</Text></View> : null}
            {preferredDoctor ? <View className="review-row"><Text>期望医生</Text><Text>{preferredDoctor}</Text></View> : null}
            <View className="review-row"><Text>希望时间</Text><Text>{date} · {time}</Text></View>
            <View className="review-row"><Text>联系电话</Text><Text>{phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}</Text></View>
            {supportsAlternatives ? <View className="review-row"><Text>候补方案</Text><Text>{acceptWaitlist ? "接受，需再次确认" : "不接受"}</Text></View> : null}
            {contentId ? <View className="review-row"><Text>信息来源</Text><Text>已审核官方内容</Text></View> : null}
          </View>
          <View className="review-process"><Text className="review-process-title">提交后会发生什么</Text>{isCommunityActivity ? <><Text>1. 团队核对官方活动原文和适用对象</Text><Text>2. 需要时联系您补充报名信息</Text><Text>3. 回写报名方式、结果或官方入口</Text></> : <><Text>1. 家医团队核验资料和办理条件</Text><Text>2. 需要时联系您补充信息</Text><Text>3. 确认到时段后，由您再次确认</Text></>}</View>
          <View className={`submit-consent pressable ${confirmed ? "selected" : ""}`} onClick={() => setConfirmed((value) => !value)}><Checkbox value="confirmed" checked={confirmed} color="#2f6c56" /><Text>我已核对以上信息，同意发送给所属家医团队处理。</Text></View>
        </View>
      ) : null}

      <View className="appointment-actions">
        {step > 0 ? <Button className="onboarding-back pressable" onClick={() => setStep((value) => value - 1)}>上一步</Button> : null}
        {step < 2 ? <Button className="primary grow pressable" onClick={goNext}>继续</Button> : <Button className="primary grow pressable" loading={loading} disabled={!confirmed} onClick={submit}>确认提交申请</Button>}
      </View>
    </View>
  );
}
