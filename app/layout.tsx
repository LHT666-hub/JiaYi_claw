import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ToastProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { MotionFeedbackProvider } from "@/components/MotionFeedbackProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "家医 Claw",
  description: "面向居民、家属和家医团队的基层健康服务协同应用。",
  icons: { icon: "/app-icon.svg", apple: "/app-icon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "家医 Claw", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#EEE5DB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <MotionFeedbackProvider />
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
