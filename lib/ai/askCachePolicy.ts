export function getShareableAskCacheKey(
  baseKey: string,
  memoryText: string,
) {
  return memoryText ? null : baseKey;
}
