import { Button, Text, View, WebView } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { apiRequest, withCareSubject } from "../../lib/api";

export default function VerifiedBrowserPage() {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("官方服务页面");
  const [invalid, setInvalid] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useLoad((params) => {
    const candidate = decodeURIComponent(params.url ?? "");
    const publicInfoId = params.publicInfoId?.trim() ?? "";
    const contentId = params.contentId?.trim() ?? "";
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
      const resolvePath = `/api/v1/links/resolve?url=${encodeURIComponent(parsed.toString())}${
        publicInfoId ? `&publicInfoId=${encodeURIComponent(publicInfoId)}` : ""
      }${
        contentId ? `&contentId=${encodeURIComponent(contentId)}` : ""
      }`;
      void apiRequest<{ url: string; label?: string }>(
        publicInfoId || contentId ? resolvePath : withCareSubject(resolvePath),
        { auth: publicInfoId || contentId ? "optional" : "required" },
      )
        .then((result) => {
          setLabel(result.label ?? "官方服务页面");
          setUrl(result.url);
        })
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

  if (embedFailed && url) {
    let host = "官方网站";
    try { host = new URL(url).hostname; } catch { /* URL was verified by the server. */ }
    return (
      <View className="page browser-fallback">
        <View className="browser-source-mark">官</View>
        <Text className="title">请在浏览器打开官方页面</Text>
        <Text className="browser-source-label">{label}</Text>
        <Text className="browser-source-host">{host}</Text>
        <Text className="subtitle">该网站尚未加入小程序业务域名，微信暂时不能在应用内展示。复制链接后可在系统浏览器访问。</Text>
        <Button className="primary" onClick={() => void Taro.setClipboardData({ data: url })}>复制官方链接</Button>
        <Button className="text-button" onClick={() => Taro.navigateBack()}>返回服务页</Button>
      </View>
    );
  }

  return url
    ? <WebView src={url} onError={() => setEmbedFailed(true)} />
    : <View className="browser-loading">正在核验并打开官方页面...</View>;
}
