import defaultTheme from "tailwindcss/defaultTheme";

function screenToNumber(screen: string): number {
  return parseInt(screen.slice(0, -2));
}

export const sm = screenToNumber(defaultTheme.screens.sm);
export const md = screenToNumber(defaultTheme.screens.md);
export const lg = screenToNumber(defaultTheme.screens.lg);
export const xl = screenToNumber(defaultTheme.screens.xl);
export const xxl = screenToNumber(defaultTheme.screens["2xl"]);
