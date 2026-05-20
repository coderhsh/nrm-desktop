import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Unocss from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

const elementPlusResolver = ElementPlusResolver({
  importStyle: "css",
});

export default defineConfig(async () => ({
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue", "pinia"],
      resolvers: [elementPlusResolver],
      dts: "src/auto-imports.d.ts",
      eslintrc: {
        enabled: true,
        filepath: "./.eslintrc-auto-import.json",
      },
    }),
    Components({
      resolvers: [elementPlusResolver],
      dts: "src/components.d.ts",
    }),
    Unocss(),
  ],

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
