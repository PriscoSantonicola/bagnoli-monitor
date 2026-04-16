import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          500: "#2b6cb0",
          600: "#1e4f88",
          700: "#163b68",
        },
      },
    },
  },
  plugins: [],
};

export default config;
