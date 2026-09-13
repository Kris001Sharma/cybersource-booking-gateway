/** Theme tokens — source of truth for design tokens, injected into page CSS */
export const theme = {
  sand: "#f5f0e8",
  cream: "#faf7f2",
  "warm-white": "#fefdfb",
  "warm-gray": "#e8e2d9",
  "text-primary": "#2c241f",
  "text-secondary": "#6b5e53",
  "text-muted": "#9a8e82",
  accent: "#b85c38",
  "accent-hover": "#a04e2e",
  "accent-light": "#f3e7de",
  error: "#c0392b",
  "error-bg": "#fdecea",
  warning: "#d4a017",
  "warning-bg": "#fff3cd",
  success: "#3d7a5f",
  "success-bg": "#e8f5ee",
  "radius-sm": "6px",
  "radius-md": "12px",
  "radius-lg": "20px",
  "shadow-card": "0 2px 12px rgba(44,36,31,0.06)",
  "shadow-elevated": "0 8px 30px rgba(44,36,31,0.10)",
};

export function injectThemeCSS() {
  const cssVars = Object.entries(theme)
    .map(([k, v]) => `--${k}: ${v};`)
    .join("\n  ");
  return `:root {\n  ${cssVars}\n}`;
}
