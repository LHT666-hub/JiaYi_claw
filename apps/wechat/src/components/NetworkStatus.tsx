import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { WifiOff } from "lucide-react-taro";
import { useEffect, useRef, useState } from "react";

const restoredEvent = "jiayi:network-restored";

export function NetworkStatusBanner() {
  const [offline, setOffline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    void Taro.getNetworkType().then(({ networkType }) => {
      const nextOffline = networkType === "none";
      wasOffline.current = nextOffline;
      setOffline(nextOffline);
    }).catch(() => undefined);

    const listener = ({ isConnected }: { isConnected: boolean }) => {
      const recovered = wasOffline.current && isConnected;
      wasOffline.current = !isConnected;
      setOffline(!isConnected);
      if (recovered) {
        Taro.eventCenter.trigger(restoredEvent);
        void Taro.showToast({ title: "网络已恢复，正在同步", icon: "none" });
      }
    };
    Taro.onNetworkStatusChange(listener);
    const syncBrowserStatus = () => listener({ isConnected: navigator.onLine });
    if (process.env.TARO_ENV === "h5") {
      window.addEventListener("online", syncBrowserStatus);
      window.addEventListener("offline", syncBrowserStatus);
    }
    return () => {
      Taro.offNetworkStatusChange(listener);
      if (process.env.TARO_ENV === "h5") {
        window.removeEventListener("online", syncBrowserStatus);
        window.removeEventListener("offline", syncBrowserStatus);
      }
    };
  }, []);

  if (!offline) return null;
  return (
    <View className="network-status-banner" role="status">
      <WifiOff size={17} color="#FFFFFF" strokeWidth={2.2} />
      <Text>网络已断开，已填写内容会保留</Text>
    </View>
  );
}

export function useReloadOnNetworkRestore(reload: () => void) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const listener = () => reloadRef.current();
    Taro.eventCenter.on(restoredEvent, listener);
    return () => { Taro.eventCenter.off(restoredEvent, listener); };
  }, []);
}
