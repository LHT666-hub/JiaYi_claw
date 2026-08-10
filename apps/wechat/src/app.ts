import "./app.scss";
import { useLaunch } from "@tarojs/taro";
import { installPrivacyAuthorizationHandler } from "./lib/privacy";

export default function App({ children }: { children: React.ReactNode }) {
  useLaunch(() => {
    installPrivacyAuthorizationHandler();
  });
  return children;
}
