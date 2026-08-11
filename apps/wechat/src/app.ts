import "./app.scss";
import * as React from "react";
import { useLaunch } from "@tarojs/taro";
import { installPrivacyAuthorizationHandler } from "./lib/privacy";
import { GlobalPrivacyGate } from "./components/GlobalPrivacyGate";

export default function App({ children }: { children: React.ReactNode }) {
  useLaunch(() => {
    installPrivacyAuthorizationHandler();
  });
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(GlobalPrivacyGate),
    children,
  );
}
