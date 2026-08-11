export type CareBindingStatus = "pending" | "active" | "revoked" | "unbound";

export type CareAccess = {
  level: "registered" | "verified" | "unbound" | "revoked";
  bindingStatus: CareBindingStatus;
  canSubmitService: boolean;
  canStoreHealthData: boolean;
  message: string;
};

export function getCareAccess(status?: string | null): CareAccess {
  if (status === "active") {
    return {
      level: "verified",
      bindingStatus: "active",
      canSubmitService: true,
      canStoreHealthData: true,
      message: "家医签约关系已由服务团队核验。",
    };
  }
  if (status === "pending") {
    return {
      level: "registered",
      bindingStatus: "pending",
      canSubmitService: false,
      canStoreHealthData: false,
      message: "社区登记已提交，工作人员核验后开放预约协助和健康记录。",
    };
  }
  if (status === "revoked") {
    return {
      level: "revoked",
      bindingStatus: "revoked",
      canSubmitService: false,
      canStoreHealthData: false,
      message: "当前家医签约关系已停止，请联系所属社区重新核验。",
    };
  }
  return {
    level: "unbound",
    bindingStatus: "unbound",
    canSubmitService: false,
    canStoreHealthData: false,
    message: "尚未登记家医服务社区，请先完成服务建档。",
  };
}

export function requireVerifiedCareAccess(status?: string | null) {
  const access = getCareAccess(status);
  if (!access.canSubmitService) throw new Error("CARE_BINDING_VERIFICATION_REQUIRED");
  return access;
}
