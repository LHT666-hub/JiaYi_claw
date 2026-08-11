import { Button, Picker, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { InlineRetry, PageFeedback, PageSkeleton } from "../../components/PageState";
import { apiRequest, getCareSubjectId, withCareSubject } from "../../lib/api";

declare const OPERATOR_NAME: string;
declare const PRIVACY_CONTACT: string;

const categories = [
  { value: "service", label: "服务办理" },
  { value: "content", label: "排班或内容" },
  { value: "accessibility", label: "老人使用体验" },
  { value: "privacy", label: "隐私与授权" },
  { value: "bug", label: "功能异常" },
  { value: "other", label: "其他建议" },
] as const;

type MeData = {
  profile: { display_name: string; role: string; phone?: string | null };
  residentId: string | null;
  network: null | {
    name: string;
    community?: {
      name?: string | null;
      service_phone?: string | null;
      address?: string | null;
    } | null;
  };
};

export default function SupportPage() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [content, setContent] = useState("");
  const [contactAllowed, setContactAllowed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<MeData>(withCareSubject("/api/v1/me")));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "帮助信息暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  const servicePhone = data?.network?.community?.service_phone?.trim() ?? "";
  const canSubmit = content.trim().length >= 8 && !submitting;
  const selectedCategory = categories[categoryIndex] ?? categories[0];
  const helpRows = useMemo(
    () => [
      { title: "查看服务进度", note: "预约、转诊和补资料状态", url: "/pages/progress/index" },
      { title: "管理隐私授权", note: "健康信息、AI 与通知范围", url: "/pages/privacy/index" },
      { title: "账号与注销", note: "账号安全和注销冷静期", url: "/pages/account-security/index" },
    ],
    [],
  );

  async function callCommunity() {
    if (!servicePhone) {
      Taro.showToast({ title: "机构尚未登记服务电话", icon: "none" });
      return;
    }
    try {
      await Taro.makePhoneCall({ phoneNumber: servicePhone });
    } catch {
      // The system call sheet can be cancelled without showing an error toast.
    }
  }

  async function submit() {
    if (!canSubmit) {
      Taro.showToast({ title: "请至少描述 8 个字", icon: "none" });
      return;
    }
    setSubmitting(true);
    const idempotencyKey = `feedback:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    try {
      const result = await apiRequest<{ feedback: { id: string } }>("/api/v1/feedback", {
        method: "POST",
        idempotencyKey,
        data: {
          category: selectedCategory.value,
          content: content.trim(),
          contactAllowed,
          residentId: getCareSubjectId() || undefined,
          pagePath: "/pages/support/index",
        },
      });
      setSubmittedId(result.feedback.id);
      setContent("");
      setContactAllowed(false);
      Taro.showToast({ title: "反馈已提交", icon: "success" });
    } catch (reason) {
      Taro.showToast({
        title: reason instanceof Error ? reason.message : "反馈提交失败",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="page support-page">
      <View className="support-heading">
        <Text className="eyebrow">服务支持</Text>
        <Text className="title">遇到问题，我们接着处理</Text>
        <Text className="subtitle">公开问题可问 Claw；账号、预约或服务异常由工作人员人工处理。</Text>
      </View>

      {loading && !data ? <PageSkeleton rows={2} /> : null}
      {!loading && error && !data ? (
        <PageFeedback title="帮助信息暂时没连上" message={error} onRetry={() => void load()} />
      ) : null}
      {error && data ? <InlineRetry message={error} onRetry={() => void load()} /> : null}

      {data ? <>
        <View className="support-contact-card">
          <View className="support-contact-head">
            <View className="support-contact-mark">家医</View>
            <View className="grow">
              <Text className="support-contact-kicker">当前服务机构</Text>
              <Text className="support-contact-name">
                {data.network?.community?.name ?? data.network?.name ?? "尚未绑定服务机构"}
              </Text>
            </View>
            <View className={`support-contact-state ${data.network ? "active" : ""}`}>
              {data.network ? "已绑定" : "待绑定"}
            </View>
          </View>
          {data.network?.community?.address ? (
            <Text className="support-contact-address">{data.network.community.address}</Text>
          ) : null}
          <View className="support-contact-actions">
            <Button className="support-call pressable" disabled={!servicePhone} onClick={() => void callCommunity()}>
              {servicePhone ? `拨打 ${servicePhone}` : "服务电话待登记"}
            </Button>
            <Button
              className="support-wechat pressable"
              openType="contact"
              showMessageCard
              sendMessageTitle="家医 Claw 服务帮助"
              sendMessagePath="/pages/support/index"
            >
              微信客服
            </Button>
          </View>
          <Text className="support-hours">服务时间以机构最新公示为准；紧急情况请拨打 120。</Text>
        </View>

        <View className="support-section-head">
          <Text className="support-section-title">常用帮助</Text>
        </View>
        <View className="support-help-surface">
          {helpRows.map((item) => (
            <View key={item.url} className="support-help-row pressable" onClick={() => Taro.navigateTo({ url: item.url })}>
              <View className="grow">
                <Text className="support-help-title">{item.title}</Text>
                <Text className="support-help-note">{item.note}</Text>
              </View>
              <Text className="support-help-arrow">›</Text>
            </View>
          ))}
        </View>

        <View className="support-section-head">
          <View>
            <Text className="support-section-title">提交问题反馈</Text>
            <Text className="support-section-note">进入所属机构后台，不公开展示</Text>
          </View>
        </View>
        <View className="support-feedback-surface">
          {submittedId ? (
            <View className="support-submitted">
              <View className="support-submitted-mark">✓</View>
              <View className="grow">
                <Text className="support-submitted-title">反馈已经收到</Text>
                <Text className="support-submitted-note">工作人员可在后台跟进，处理进展会通过消息通知。</Text>
              </View>
              <Text className="support-submit-again" onClick={() => setSubmittedId("")}>再提一条</Text>
            </View>
          ) : <>
            <Text className="support-field-label">问题类型</Text>
            <Picker
              mode="selector"
              range={categories.map((item) => item.label)}
              value={categoryIndex}
              onChange={(event) => setCategoryIndex(Number(event.detail.value))}
            >
              <View className="support-category pressable">
                <Text>{selectedCategory.label}</Text>
                <Text>更换 ›</Text>
              </View>
            </Picker>
            <Text className="support-field-label feedback-label">具体情况</Text>
            <Textarea
              className="support-textarea"
              value={content}
              maxlength={1000}
              placeholder="请描述在哪个页面、做了什么、希望得到什么结果。不要填写身份证号或完整病历。"
              onInput={(event) => setContent(event.detail.value)}
            />
            <View className="support-counter">{content.trim().length}/1000</View>
            <View className="support-contact-permission">
              <View className="grow">
                <Text className="support-permission-title">允许工作人员联系我</Text>
                <Text className="support-permission-note">仅使用账号中已经验证的联系方式处理本条反馈</Text>
              </View>
              <Switch checked={contactAllowed} color="#2f6c56" onChange={(event) => setContactAllowed(event.detail.value)} />
            </View>
            <Button className="support-submit pressable" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
              提交给服务团队
            </Button>
          </>}
        </View>

        <View className="support-operator">
          <Text>运营主体：{OPERATOR_NAME}</Text>
          <Text>隐私联系：{PRIVACY_CONTACT}</Text>
        </View>
      </> : null}
    </View>
  );
}
