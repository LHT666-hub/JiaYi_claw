import { LegalPage, LegalSection } from "@/components/LegalPage";

export default function UserAgreementPage() {
  return <LegalPage title="用户协议" summary="家医 Claw 是基层家庭医生服务导航、预约协同和资料整理工具，不是互联网医院，也不提供自动诊疗。使用服务前请理解以下边界。">
    <LegalSection title="一、服务内容"><p>居民和家属可查询经审核的公开信息、提交预约或转诊协助、查看办理进度、整理健康资料和接收家医团队通知。工作人员负责人工受理、核验排班和回写办理结果。</p></LegalSection>
    <LegalSection title="二、医疗安全边界"><p>平台不提供诊断、处方、停药、换药、剂量调整或急救替代。胸痛、呼吸困难、意识不清、大出血等紧急情况应立即拨打 120 或前往急诊。</p><p>AI 输出仅供服务导航和资料整理，最终医疗判断由具备资质的专业人员作出。</p></LegalSection>
    <LegalSection title="三、账号与身份"><p>您应使用本人手机号或经合法授权的微信账号注册，并保证资料真实。居民与家属可自行注册；医生、护士、药师和管理员仅能通过机构邀请及审核获得权限。</p><p>家属仅可在居民明确授权范围内代办，不得冒用身份或查看未授权信息。</p></LegalSection>
    <LegalSection title="四、预约与转诊"><p>首版采用人工协同，不承诺实时号源。显示“已预约”仅以家医团队回写的正式编号或机构确认结果为准。跳转官方平台后的交易和诊疗由对应机构负责。</p></LegalSection>
    <LegalSection title="五、用户行为"><p>不得提交虚假身份、恶意抢号、攻击系统、绕过权限、传播违法信息或利用服务侵犯他人隐私。发现风险时平台可限制操作并保留必要审计记录。</p></LegalSection>
    <LegalSection title="六、服务变更与中断"><p>排班、活动和政策信息可能由机构更新。过期或无法核验的信息不会作为确定事实展示。维护或外部接口故障时，平台会提供明确状态和人工联系路径。</p></LegalSection>
    <LegalSection title="七、账号注销"><p>居民与家属可在“我的 - 账号与安全”申请注销，并在 7 天冷静期内撤销。工作人员账号由所属机构办理停用和交接。</p></LegalSection>
    <LegalSection title="八、法律适用"><p>本协议适用中华人民共和国法律。涉及互联网诊疗的能力仅在取得相应资质并由合规医疗机构承担后开放。</p></LegalSection>
  </LegalPage>;
}
