/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", ...defaultTheme.fontFamily.sans],
      },
      // https://github.com/tailwindlabs/tailwindcss-typography/blob/master/src/styles.js
      // https://github.com/tailwindlabs/tailwindcss/blob/master/stubs/defaultConfig.stub.js
      typography: (theme) => ({
        DEFAULT: {
          css: {
            p: {
              lineHeight: theme("lineHeight.relaxed"),
              marginTop: theme("spacing.3"),
              marginBottom: theme("spacing.3"),
            },
            ul: {
              marginTop: theme("spacing.3"),
              marginBottom: theme("spacing.3"),
            },
            ol: {
              marginTop: theme("spacing.3"),
              marginBottom: theme("spacing.3"),
            },
            "blockquote p:first-of-type::before": {
              content: "normal",
            },
            "blockquote p:last-of-type::after": {
              content: "normal",
            },
          },
        },
      }),
      keyframes: {
        "slide-down": {
          "0%": { opacity: 0, transform: "translateY(-10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-down": "slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
