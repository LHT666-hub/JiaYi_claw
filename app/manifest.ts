import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "家医 Claw",
    short_name: "家医 Claw",
    description: "基层家庭医生服务导航、预约协同与进度追踪。",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF4E2",
    theme_color: "#102A43",
    lang: "zh-CN",
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
