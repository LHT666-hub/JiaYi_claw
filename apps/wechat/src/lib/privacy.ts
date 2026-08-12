import Taro from "@tarojs/taro";

type PrivacyDecision = {
  event: "exposureAuthorization" | "agree" | "disagree";
  buttonId?: string;
};

type PrivacyResolve = (decision: PrivacyDecision) => void;

export type PendingPrivacyAuthorization = {
  referrer: string;
};

export const PRIVACY_AGREE_BUTTON_ID = "jiayi-global-privacy-agree";

let installed = false;
let pendingResolve: PrivacyResolve | null = null;
let pendingRequest: PendingPrivacyAuthorization | null = null;
const listeners = new Set<
  (request: PendingPrivacyAuthorization | null) => void
>();

function notify() {
  for (const listener of listeners) listener(pendingRequest);
}

export function installPrivacyAuthorizationHandler() {
  if (process.env.TARO_ENV !== "weapp") return;
  if (installed) return;
  installed = true;
  Taro.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    pendingResolve = resolve as PrivacyResolve;
    pendingRequest = { referrer: eventInfo?.referrer ?? "privacy_api" };
    pendingResolve({ event: "exposureAuthorization" });
    notify();
  });
}

export function subscribePrivacyAuthorization(
  listener: (request: PendingPrivacyAuthorization | null) => void,
) {
  listeners.add(listener);
  listener(pendingRequest);
  return () => {
    listeners.delete(listener);
  };
}

export function resolvePrivacyAuthorization(
  agreed: boolean,
  buttonId?: string,
) {
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingRequest = null;
  notify();
  if (!resolve) return;
  if (agreed && buttonId) {
    resolve({ event: "agree", buttonId });
    return;
  }
  resolve({ event: "disagree" });
}
