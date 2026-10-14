/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        saarthi: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc7fb",
          400: "#36a8f7",
          500: "#0c8aeb",
          600: "#006dc8",
          700: "#02569e",
          800: "#064880",
          900: "#0a3c6b",
        },
        ink: "#0f172a",
        ok: "#15803d",
        warn: "#b45309",
        err: "#b91c1c",
      },
      fontFamily: {
        sans: ['"Noto Sans Oriya"', '"Noto Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
