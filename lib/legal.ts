import { CURRENT_POLICY_VERSION } from "@/lib/policies";

export const LEGAL_POLICY_VERSION = CURRENT_POLICY_VERSION;

export function getLegalOperator() {
  return {
    name: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || "家医 Claw 试点项目组",
    contact: process.env.NEXT_PUBLIC_PRIVACY_CONTACT?.trim() || "请通过所属社区卫生服务机构联系隐私负责人",
    effectiveDate: "2026年7月18日",
  };
}
