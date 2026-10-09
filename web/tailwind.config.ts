import type { Config } from "tailwindcss";

// Sexualsync v1 brand palette — see docs/DESIGN_BRIEF.md.
// The shipped app is dark by default: wine-dark surfaces, warm cream text,
// and rose as the primary accent.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surface tokens (read from CSS variables so Tailwind alpha works).
        bg: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2-rgb) / <alpha-value>)",
        ink: "rgb(var(--cream-rgb) / <alpha-value>)",
        "ink-2": "rgb(var(--cream-muted-rgb) / <alpha-value>)",
        "ink-3": "rgb(var(--cream-faint-rgb) / <alpha-value>)",
        line: "rgb(var(--hairline-rgb) / <alpha-value>)",

        // Brand accents.
        primary: "rgb(var(--accent-rgb) / <alpha-value>)",
        "primary-ink": "rgb(var(--ink-rgb) / <alpha-value>)",
        gold: "rgb(var(--gold-rgb) / <alpha-value>)",
        rose: "rgb(var(--accent-rgb) / <alpha-value>)",

        // Semantic.
        no: "rgb(var(--no-rgb) / <alpha-value>)",
      },
      fontFamily: {
        // Editorial serif for headings, humanist sans for UI.
        // Bound by next/font in layout.tsx via CSS variables.
        display: ["var(--font-display)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // The v2 type ramp (DESIGN.md "Hierarchy"), read from the --fs-*
        // tokens in globals.css. Legacy keys are pinned onto the ramp so
        // existing utilities can't introduce off-scale sizes.
        caption: ["var(--fs-12)", { lineHeight: "1.35" }],
        label: ["var(--fs-13)", { lineHeight: "1.35" }],
        body: ["var(--fs-15)", { lineHeight: "1.5" }],
        "body-lg": ["var(--fs-17)", { lineHeight: "1.45" }],
        title: ["var(--fs-20)", { lineHeight: "1.25" }],
        "headline-sm": ["var(--fs-24)", { lineHeight: "1.15" }],
        headline: ["var(--fs-30)", { lineHeight: "1.1" }],
        display: ["var(--fs-38)", { lineHeight: "1" }],
        xs: ["var(--fs-13)", { lineHeight: "1.4" }],
        sm: ["var(--fs-15)", { lineHeight: "1.45" }],
        base: ["var(--fs-17)", { lineHeight: "1.5" }],
        lg: ["var(--fs-17)", { lineHeight: "1.45" }],
        xl: ["var(--fs-20)", { lineHeight: "1.3" }],
        "2xl": ["var(--fs-24)", { lineHeight: "1.2" }],
        // Editorial display sizes (serif only, never below 20px).
        "display-xs": "var(--fs-20)",
        "display-sm": "var(--fs-24)",
        "display-md": "var(--fs-24)",
        "display-lg": "var(--fs-30)",
        "display-xl": "var(--fs-38)",
      },
      borderRadius: {
        card: "var(--r-lg)",
        pill: "var(--r-pill)",
      },
      zIndex: {
        "skip-link": "var(--z-skip-link)",
      },
      maxWidth: {
        // Mobile-first: design at 390px, max out around tablet width.
        app: "440px",
      },
      boxShadow: {
        card: "0 1px 0 rgb(243 220 217 / 0.04), 0 10px 28px -18px rgb(0 0 0 / 0.42)",
      },
    },
  },
  plugins: [],
};
export default config;
