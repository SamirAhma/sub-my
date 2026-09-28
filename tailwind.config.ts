import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#07090d",
        panel: "#10141c",
        kelana: "#E5007D",
        ampang: "#F7941D",
        kajang: "#00A651",
        putrajaya: "#F5C400",
        monorail: "#8BC34A",
      },
    },
  },
  plugins: [],
};

export default config;
