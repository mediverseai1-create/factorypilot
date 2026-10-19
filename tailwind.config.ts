import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0B1B2B", 700: "#1E3248", 500: "#4A5B6E", 400: "#6B7A8C", 300: "#9AA6B4" },
        canvas: { DEFAULT: "#FFFFFF", soft: "#F5F6F8", warm: "#FBF7F0", line: "#E3E6EA" },
        amber: { DEFAULT: "#F59E0B", 600: "#D97706", 700: "#B45309", 50: "#FFF7E6", 100: "#FDEBC8" },
        signal: { red: "#C62828", redbg: "#FDECEA", green: "#1B7F4B", greenbg: "#E6F4EC", blue: "#1F5FBF", bluebg: "#E8F0FB" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: { card: "0 1px 2px rgba(11,27,43,.06), 0 8px 24px rgba(11,27,43,.06)" },
    },
  },
  plugins: [],
};
export default config;
