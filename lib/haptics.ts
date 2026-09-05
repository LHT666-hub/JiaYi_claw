export type HapticKind = "selection" | "light" | "medium" | "success" | "warning";

const patterns: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 20,
  success: [12, 45, 18],
  warning: [24, 45, 24],
};

export function triggerHaptic(kind: HapticKind = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(patterns[kind]);
}
