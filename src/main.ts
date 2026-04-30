import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "uno.css";
import App from "./App.vue";
import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { ensureLanguageSeededFromNavigator, LANGUAGE_STORAGE_KEY } from "./composables/useI18n";

async function bootstrap() {
  try {
    const lang = await invoke<string>("get_app_language");
    if (lang === "en" || lang === "zh-CN") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  } catch {
    ensureLanguageSeededFromNavigator();
  }

  const app = createApp(App);
  app.use(createPinia());
  app.use(ElementPlus, { locale: undefined });
  app.mount("#app");
}

bootstrap();
