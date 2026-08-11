import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";

declare const OPERATOR_NAME: string;
declare const PRIVACY_CONTACT: string;
declare const POLICY_VERSION: string;

const privacy = [
  ["我们处理的信息", "手机号、微信账号标识、所属社区、服务申请，以及您主动提交的健康资料。不会静默读取通讯录、精确位置或手机健康数据。"],
  ["处理目的", "用于身份验证、家医团队绑定、公开信息查询、预约与转诊协同、资料整理和必要通知。主动提交的报告或药盒图片仅在本次识别期间临时处理，默认不保存原图。AI 不用于自动诊断、处方或调药。"],
  ["授权与共享", "微信手机号仅在点击授权后用于身份验证；订阅消息按模板逐次授权。敏感健康信息、AI 处理、家属代办和其他通知分别取得同意。图片识别当前由月之暗面 Kimi API 受托处理，仅提供完成本次识别所需的图片。"],
  ["保存与安全", "正式环境采用境内部署、加密、最小权限和审计。账号注销后删除或匿名化直接识别身份的资料。"],
  ["您的权利", "可访问、更正、撤回同意、管理家属授权、删除信息和申请注销账号。"],
] as const;

const agreement = [
  ["服务范围", "家医 Claw 提供服务导航、预约协同和资料整理，不是互联网医院。"],
  ["医疗安全", "不提供诊断、处方、停换药或剂量调整。紧急情况请立即拨打 120。"],
  ["预约说明", "首版采用人工协同，不承诺实时号源；以机构或家医团队正式回执为准。"],
  ["账号责任", "请使用真实身份。家属仅可在居民明确授权范围内代办。"],
  ["账号注销", "居民与家属可在账号与安全中申请注销，并在 7 天冷静期内撤销。"],
] as const;

export default function LegalPage() {
  const [kind, setKind] = useState<"privacy" | "agreement">("privacy");

  useLoad((options) => {
    const next = options.doc === "agreement" ? "agreement" : "privacy";
    setKind(next);
    Taro.setNavigationBarTitle({ title: next === "privacy" ? "隐私政策" : "用户协议" });
  });

  const sections = kind === "privacy" ? privacy : agreement;
  return (
    <View className="page legal-page">
      <View className="page-heading">
        <Text className="title">{kind === "privacy" ? "隐私政策" : "用户协议"}</Text>
        <Text className="subtitle">版本 {POLICY_VERSION} · 2026年8月11日生效</Text>
      </View>
      <View className="legal-operator">
        <View><Text className="legal-operator-label">运营主体</Text><Text className="legal-operator-value">{OPERATOR_NAME}</Text></View>
        <View><Text className="legal-operator-label">隐私联系</Text><Text className="legal-operator-value">{PRIVACY_CONTACT}</Text></View>
      </View>
      <View className="legal-sections">
        {sections.map(([title, content]) => (
          <View key={title} className="legal-section">
            <Text className="legal-section-title">{title}</Text>
            <Text className="legal-copy">{content}</Text>
          </View>
        ))}
      </View>
      <Text className="legal-footer">本政策适用于家医 Claw 微信小程序及其服务协同功能。</Text>
    </View>
  );
}
