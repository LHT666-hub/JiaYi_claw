import { Button, Text, View, WebView } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, withCareSubject } from "../../lib/api";

export default function VerifiedBrowserPage() {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useLoad((params) => {
    const candidate = decodeURIComponent(params.url ?? "");
    const publicInfoId = params.publicInfoId?.trim() ?? "";
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
      const resolvePath = `/api/v1/links/resolve?url=${encodeURIComponent(parsed.toString())}${
        publicInfoId ? `&publicInfoId=${encodeURIComponent(publicInfoId)}` : ""
      }`;
      void apiRequest<{ url: string }>(
        publicInfoId ? resolvePath : withCareSubject(resolvePath),
      )
        .then((result) => setUrl(result.url))
        .catch((reason) => {
          setErrorMessage(
            reason instanceof Error ? reason.message : "官方链接核验失败",
          );
          setInvalid(true);
        });
    } catch {
      setInvalid(true);
    }
  });

  if (invalid) {
    return (
      <View className="page browser-fallback">
        <View className="card">
          <Text className="title">链接无法打开</Text>
          <Text className="subtitle">
            {errorMessage || "为了安全，仅支持经过核验的 HTTPS 官方页面。"}
          </Text>
          <Button className="primary" onClick={() => Taro.navigateBack()}>
            返回服务页
          </Button>
        </View>
      </View>
    );
  }

  return url ? <WebView src={url} /> : <View className="browser-loading">正在打开官方页面...</View>;
}
