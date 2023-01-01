/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

const textPadding = "3px 0px";
const headingLineHeight = "1.3";
const paragraphLineHeight = "1.5";

module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        serif: ["Newsreader", ...defaultTheme.fontFamily.serif],
      },
      // https://github.com/tailwindlabs/tailwindcss-typography/blob/master/src/styles.js
      // https://github.com/tailwindlabs/tailwindcss/blob/master/stubs/defaultConfig.stub.js
      typography: (theme) => ({
        DEFAULT: {
          css: {
            p: {
              lineHeight: paragraphLineHeight,
              // marginTop: theme("spacing.3"),
              // marginBottom: theme("spacing.3"),
              margin: "0",
              padding: textPadding,
            },
            ul: {
              margin: "0 !important",
            },
            ol: {
              margin: "0 !important",
            },
            li: {
              margin: "0 !important",
              paddingTop: textPadding,
              paddingBottom: textPadding,
            },
            hr: {
              // height: 13px
              margin: "6.5px 0px",
            },
            h1: {
              fontFamily: theme("fontFamily.serif").join(","),
              fontSize: "1.875em",
              fontWeight: theme("fontWeight.medium"),
              lineHeight: headingLineHeight,
              marginTop: "2rem !important", // 2em
              marginBottom: "4px", // 4px
              padding: textPadding,
            },
            h2: {
              fontFamily: theme("fontFamily.serif").join(","),
              fontSize: "1.5em",
              fontWeight: theme("fontWeight.medium"),
              lineHeight: headingLineHeight,
              marginTop: "1.4rem !important", // 1.4em
              marginBottom: "1px", // 1px
              padding: textPadding,
            },
            h3: {
              fontFamily: theme("fontFamily.serif").join(","),
              fontSize: "1.25em",
              fontWeight: theme("fontWeight.medium"),
              lineHeight: headingLineHeight,
              marginTop: "1rem !important", // 1em
              marginBottom: "1px", // 1px
              padding: textPadding,
            },
            "blockquote p:first-of-type::before": {
              content: "normal",
            },
            "blockquote p:last-of-type::after": {
              content: "normal",
            },
            code: {
              backgroundColor: theme("colors.slate.100"),
              padding: "1px 3px",
              borderRadius: theme("borderRadius.sm"),
            },
            "code::before": {
              content: "normal",
            },
            "code::after": {
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
