import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo } from "react";
import homeActive from "../assets/tabbar/home-active.png";
import homeDefault from "../assets/tabbar/home-default.png";
import meActive from "../assets/tabbar/me-active.png";
import meDefault from "../assets/tabbar/me-default.png";
import messagesActive from "../assets/tabbar/messages-active.png";
import messagesDefault from "../assets/tabbar/messages-default.png";
import servicesActive from "../assets/tabbar/services-active.png";
import servicesDefault from "../assets/tabbar/services-default.png";
import "./index.scss";

const tabs = [
  { pagePath: "/pages/home/index", label: "首页", icon: homeDefault, activeIcon: homeActive },
  { pagePath: "/pages/services/index", label: "服务", icon: servicesDefault, activeIcon: servicesActive },
  { pagePath: "/pages/messages/index", label: "消息", icon: messagesDefault, activeIcon: messagesActive },
  { pagePath: "/pages/me/index", label: "我的", icon: meDefault, activeIcon: meActive },
] as const;

function currentRoute() {
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route ?? "pages/home/index";
  return route.startsWith("/") ? route : `/${route}`;
}

export default function CustomTabBar() {
  const activeRoute = useMemo(currentRoute, []);

  function switchTo(pagePath: string) {
    if (pagePath === activeRoute) return;
    void Taro.switchTab({ url: pagePath });
  }

  return (
    <View className="resident-tab-safe-area">
      <View className="resident-tab-shell">
        {tabs.map((tab) => {
          const active = activeRoute === tab.pagePath;
          return (
            <View
              key={tab.pagePath}
              className={`resident-tab-item ${active ? "active" : ""}`}
              onClick={() => switchTo(tab.pagePath)}
            >
              <View className="resident-tab-icon-wrap">
                <Image
                  alt=""
                  className="resident-tab-icon"
                  mode="aspectFit"
                  src={active ? tab.activeIcon : tab.icon}
                />
              </View>
              <Text className="resident-tab-label">{tab.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
