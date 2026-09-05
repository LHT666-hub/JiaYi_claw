import Taro from "@tarojs/taro";

export type HapticKind = "selection" | "light" | "medium" | "success" | "warning";

export function haptic(kind: HapticKind = "light") {
  const type = kind === "medium" || kind === "warning" ? "medium" : "light";
  void Taro.vibrateShort({ type }).catch(() => undefined);
  if (kind === "success") {
    setTimeout(() => void Taro.vibrateShort({ type: "light" }).catch(() => undefined), 55);
  }
}
