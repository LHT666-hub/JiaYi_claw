import { mkdir } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HeartHandshake,
  House,
  MessageCircleMore,
  Sparkles,
  UserRound,
} from "lucide-react";
import sharp from "sharp";

const output = path.resolve("apps/wechat/src/assets/tabbar");
const icons = {
  home: House,
  services: Sparkles,
  messages: MessageCircleMore,
  me: UserRound,
};
const states = {
  default: "#66788A",
  active: "#102A43",
};

await mkdir(output, { recursive: true });
for (const [name, Icon] of Object.entries(icons)) {
  for (const [state, color] of Object.entries(states)) {
    const markup = renderToStaticMarkup(
      React.createElement(Icon, {
        xmlns: "http://www.w3.org/2000/svg",
        width: 64,
        height: 64,
        viewBox: "0 0 24 24",
        fill: "none",
        color,
        stroke: color,
        strokeWidth: 1.9,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
    await sharp(Buffer.from(markup))
      .resize(64, 64)
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(output, `${name}-${state}.png`));
  }
}

console.log(`Generated ${Object.keys(icons).length * 2} WeChat tab icons in ${output}.`);

const brandBase = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="116" fill="#102A43"/>
    <rect x="28" y="28" width="456" height="456" rx="94" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="4"/>
    <circle cx="404" cy="108" r="34" fill="#4F8378"/>
  </svg>
`);
const brandIcon = Buffer.from(
  renderToStaticMarkup(
    React.createElement(HeartHandshake, {
      xmlns: "http://www.w3.org/2000/svg",
      width: 272,
      height: 272,
      viewBox: "0 0 24 24",
      fill: "none",
      color: "#FFFFFF",
      stroke: "#FFFFFF",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  ),
);
const brand = await sharp(brandBase)
  .composite([{ input: brandIcon, left: 120, top: 124 }])
  .png({ compressionLevel: 9 })
  .toBuffer();
await mkdir(path.resolve("public"), { recursive: true });
await mkdir(path.resolve("apps/wechat/src/assets/brand"), { recursive: true });
await sharp(brand).toFile(path.resolve("public/app-icon.png"));
await sharp(brand).toFile(path.resolve("apps/wechat/src/assets/brand/app-icon.png"));
console.log("Generated shared 512px brand icon for Web and WeChat.");
