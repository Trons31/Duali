import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effef9",
          100: "#d8fbef",
          200: "#b4f4de",
          300: "#7ae8c1",
          400: "#39d49d",
          500: "#14b87e",
          600: "#0e9667",
          700: "#0d7755",
          800: "#105f46",
          900: "#0d4f3b",
          950: "#042d22"
        },
        ink: {
          50: "#f8fafc",
          100: "#eff3f7",
          200: "#d9e2ec",
          300: "#b8c5d4",
          400: "#8ea1b5",
          500: "#6d8297",
          600: "#55697f",
          700: "#455466",
          800: "#2f3b4d",
          900: "#1c2433",
          950: "#0f1724"
        },
        sand: "#f7f4ee",
        cream: "#fcfaf6"
      },
      boxShadow: {
        soft: "0 20px 45px -28px rgba(15, 23, 36, 0.34)",
        card: "0 18px 50px -24px rgba(17, 24, 39, 0.18)"
      },
      borderRadius: {
        "4xl": "2rem"
      },
      backgroundImage: {
        "mesh-brand":
          "radial-gradient(circle at top left, rgba(57, 212, 157, 0.26), transparent 36%), radial-gradient(circle at top right, rgba(20, 184, 126, 0.22), transparent 28%), linear-gradient(180deg, rgba(252,250,246,1) 0%, rgba(248,250,252,1) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
