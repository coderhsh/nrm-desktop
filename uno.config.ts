import { defineConfig, presetUno, presetAttributify } from "unocss";
import transformerDirectives from "@unocss/transformer-directives";

export default defineConfig({
  /* `dark:` utilities follow `html.dark` from useTheme (not only system prefers-color-scheme) */
  presets: [presetUno({ dark: "class" }), presetAttributify()],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      app: {
        bg: "var(--app-bg)",
        surface: "var(--app-surface)",
        elevated: "var(--app-surface-elevated)",
        separator: "var(--app-separator)",
        text: "var(--app-text)",
        muted: "var(--app-text-muted)",
        track: "var(--app-bar-track)",
      },
    },
  },
  shortcuts: {
    "flex-center": "flex items-center justify-center",
    "flex-between": "flex items-center justify-between",
    "text-muted": "text-app-muted",
    "text-secondary": "text-app-muted",
    "app-shell": "h-full flex flex-col min-h-0 bg-app-bg",
    "app-shell-body": "flex flex-1 min-h-0 min-w-0 flex-row",
    "app-sidebar":
      "w-[35%] shrink-0 flex flex-col min-h-0 border-r border-app-separator pt-6 pb-4 pl-3 pr-2",
    "app-main-area": "flex-1 flex flex-col min-w-0 min-h-0",
    "app-statusbar":
      "h-10 shrink-0 px-3 flex items-center gap-0.5 border-t border-app-separator",
    "app-card":
      "bg-app-surface border border-app-separator rounded-xl",
    /* Grouped panel (forms, sections) */
    "app-panel":
      "rounded-xl border border-app-separator bg-app-surface p-4",
  },
  rules: [],
});
