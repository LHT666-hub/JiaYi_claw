import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: "#F3DDC2",
        cream: "#FFF4E2",
        navy: "#102A43",
        navySoft: "#12365A",
        sage: "#6F9996",
        amber: "#C9823A",
        line: "#D8C2A3",
        danger: "#A44A3F",
        success: "#2F6C56",
        surface: {
          card: "#FFF8ED",
          input: "#FFF9F0",
          hover: "#FAF0DD",
          press: "#F7ECDA",
          nav: "#F7E8D4",
          navItem: "#F2E2CA",
          navItemHover: "#EDD9C0",
          tint: "#FAEEDB",
          tintSoft: "#F8F0E1",
          icon: "#F5E4D0",
          avatar: "#F6E9D7",
          chip: "#F3E4CD",
        },
        health: {
          soft: "#EEF5F3",
          muted: "#E8F0EE",
          success: "#DDEFE4",
        },
        risk: {
          soft: "#FBF0ED",
          strong: "#F8E4DF",
        },
      },
      boxShadow: {
        soft: "0 12px 30px rgba(16, 42, 67, 0.08)",
        float: "0 18px 40px rgba(16, 42, 67, 0.14)",
      },
      borderRadius: {
        "4xl": "28px",
      },
      backgroundImage: {
        paper:
          "radial-gradient(circle at top, rgba(255,255,255,0.32), transparent 36%), linear-gradient(180deg, rgba(255,244,226,0.92), rgba(243,221,194,0.92))",
      },
    },
  },
  plugins: [],
};

export default config;
