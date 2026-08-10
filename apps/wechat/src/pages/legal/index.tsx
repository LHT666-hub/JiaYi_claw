import { Text, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";

const privacy = [
  ["我们处理的信息", "手机号、微信账号标识、所属社区、服务申请，以及您主动提交的健康资料。不会静默读取通讯录、精确位置或手机健康数据。"],
  ["处理目的", "用于身份验证、家医团队绑定、公开信息查询、预约与转诊协同、资料整理和必要通知。AI 不用于自动诊断、处方或调药。"],
  ["授权与共享", "微信手机号仅在点击授权后用于身份验证；订阅消息按模板逐次授权。敏感健康信息、AI 处理、家属代办和其他通知分别取得同意，仅向必要机构和受托方提供最少信息。"],
  ["保存与安全", "正式环境采用境内部署、加密、最小权限和审计。账号注销后删除或匿名化直接识别身份的资料。"],
  ["您的权利", "可访问、更正、撤回同意、管理家属授权、删除信息和申请注销账号。"],
];
const agreement = [
  ["服务范围", "家医 Claw 提供服务导航、预约协同和资料整理，不是互联网医院。"], ["医疗安全", "不提供诊断、处方、停换药或剂量调整。紧急情况请立即拨打 120。"], ["预约说明", "首版采用人工协同，不承诺实时号源；以机构或家医团队正式回执为准。"], ["账号责任", "请使用真实身份。家属仅可在居民明确授权范围内代办。"], ["账号注销", "居民与家属可在账号与安全中申请注销，并在 7 天冷静期内撤销。"],
];
export default function LegalPage() { const [kind, setKind] = useState<"privacy" | "agreement">("privacy"); useLoad((options) => { const next = options.doc === "agreement" ? "agreement" : "privacy"; setKind(next); Taro.setNavigationBarTitle({ title: next === "privacy" ? "隐私政策" : "用户协议" }); }); const sections = kind === "privacy" ? privacy : agreement; return <View className="page"><View className="page-heading"><Text className="title">{kind === "privacy" ? "隐私政策" : "用户协议"}</Text><Text className="subtitle">版本 2026-07-18 · 2026年7月18日生效</Text></View><View className="card legal-card"><Text className="muted">运营主体和隐私联系人将在正式试点机构确认后，由发布配置注入。</Text></View>{sections.map(([title, content]) => <View key={title} className="card legal-card"><Text className="label">{title}</Text><Text className="legal-copy">{content}</Text></View>)}</View>; }
