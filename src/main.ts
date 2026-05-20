import { createApp } from "vue";
import { createPinia } from "pinia";
/* Element Plus: per-component styles via unplugin; keep dark CSS variables global */
import "element-plus/theme-chalk/dark/css-vars.css";
import "uno.css";
import App from "./App.vue";
import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { ensureLanguageSeededFromNavigator, LANGUAGE_STORAGE_KEY } from "./composables/useI18n";

async function bootstrap() {
  try {
    const lang = await Promise.race([
      invoke<string>("get_app_language"),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("get_app_language timeout")), 8000);
      }),
    ]);
    if (lang === "en" || lang === "zh-CN") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  } catch {
    ensureLanguageSeededFromNavigator();
  }

  const app = createApp(App);
  app.use(createPinia());
  app.config.errorHandler = (err, instance, info) => {
    console.error("[vue]", err, info, instance);
  };
  app.mount("#app");
}

bootstrap();
