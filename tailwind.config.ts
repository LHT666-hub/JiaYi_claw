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
        sand: "#E8EEEC",
        cream: "#F7FAF9",
        navy: "#102A43",
        navySoft: "#12365A",
        sage: "#4F8378",
        amber: "#D29A46",
        line: "#D7E1DF",
        danger: "#A44A3F",
        success: "#2F6C56",
        surface: {
          card: "#FFFFFF",
          input: "#F5F8F7",
          hover: "#EEF3F2",
          press: "#E5ECEA",
          nav: "#FFFFFF",
          navItem: "#F3F6F5",
          navItemHover: "#E9F0EE",
          tint: "#EDF3F2",
          tintSoft: "#F4F7F6",
          icon: "#E8F1EF",
          avatar: "#EEF3F2",
          chip: "#E3ECE9",
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
    },
  },
  plugins: [],
};

export default config;
