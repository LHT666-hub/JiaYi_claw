export type MessageDestination =
  | { kind: "progress"; requestId?: string }
  | { kind: "services" }
  | { kind: "me" }
  | { kind: "publicInfo" }
  | { kind: "content"; contentId: string }
  | { kind: "none" };

function safeUrl(value: string) {
  try {
    return new URL(value, "https://jiayi.local");
  } catch {
    return null;
  }
}

export function resolveMessageDestination(linkUrl?: string | null): MessageDestination {
  if (!linkUrl) return { kind: "none" };
  const url = safeUrl(linkUrl);
  if (!url || url.origin !== "https://jiayi.local") return { kind: "none" };

  if (["/appointments", "/progress"].includes(url.pathname)) {
    const requestId = url.searchParams.get("id")?.trim();
    return requestId ? { kind: "progress", requestId } : { kind: "progress" };
  }
  if (url.pathname === "/services") return { kind: "services" };
  if (url.pathname === "/me") return { kind: "me" };
  if (url.pathname === "/public-info") return { kind: "publicInfo" };
  if (url.pathname === "/content") {
    const contentId = url.searchParams.get("id")?.trim();
    if (contentId) return { kind: "content", contentId };
  }
  return { kind: "none" };
}
