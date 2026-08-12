import "./app.scss";
import * as React from "react";
import { useLaunch } from "@tarojs/taro";
import { installPrivacyAuthorizationHandler } from "./lib/privacy";
import { GlobalPrivacyGate } from "./components/GlobalPrivacyGate";
import { NetworkStatusBanner } from "./components/NetworkStatus";
import { installMiniProgramUpdateHandler } from "./lib/updates";

export default function App({ children }: { children: React.ReactNode }) {
  useLaunch(() => {
    installPrivacyAuthorizationHandler();
    installMiniProgramUpdateHandler();
  });
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(GlobalPrivacyGate),
    React.createElement(NetworkStatusBanner),
    children,
  );
}
