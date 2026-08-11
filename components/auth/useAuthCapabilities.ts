"use client";

import { useEffect, useState } from "react";

export type AuthCapabilities = {
  sms: { available: boolean; unavailableMessage: string | null };
  staffSms: { available: boolean; unavailableMessage: string | null };
  wechat: { available: boolean; unavailableMessage: string | null };
  preferredResidentChannel: "wechat" | "sms" | null;
};

export function useAuthCapabilities() {
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/auth/capabilities", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error("AUTH_CAPABILITIES_FAILED");
        setCapabilities(payload.data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  return { capabilities, failed, loading: !capabilities && !failed };
}
