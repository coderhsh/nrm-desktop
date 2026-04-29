import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Unocss from "unocss/vite";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [vue(), Unocss()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
