import { ref, computed } from "vue";
import { useI18n } from "./useI18n";

type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "nrm-desktop-theme";

function readThemeFromStorage(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === '"dark"') return "dark";
    if (raw === '"light"') return "light";
    if (raw === '"auto"') return "auto";
  } catch {}
  return "auto";
}

export function writeThemeToStorage(val: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
  } catch {}
}

function resolveIsDark(t: Theme): boolean {
  if (t === "dark") return true;
  if (t === "light") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

function setDarkClass(val: boolean) {
  document.documentElement.classList.toggle("dark", val);
}

function applyTheme(val: Theme) {
  setDarkClass(resolveIsDark(val));
}

/** 用户切换时使用 startViewTransition 实现平滑过渡 */
function transitionTheme(val: Theme) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => setDarkClass(resolveIsDark(val)));
  } else {
    setDarkClass(resolveIsDark(val));
  }
}

const theme = ref<Theme>(readThemeFromStorage());

// 模块加载时同步设置，不使用 startViewTransition
applyTheme(theme.value);

// 监控 dark 类是否被移除并自动修复
if (typeof MutationObserver !== "undefined") {
  new MutationObserver(() => {
    if (!document.documentElement.classList.contains("dark") && resolveIsDark(theme.value)) {
      applyTheme(theme.value);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

export function useTheme() {
  const { t } = useI18n();

  const isDark = computed(() => resolveIsDark(theme.value));

  function setTheme(val: Theme) {
    theme.value = val;
    writeThemeToStorage(val);
    transitionTheme(val);
  }

  function toggle() {
    if (theme.value === "auto") setTheme("dark");
    else if (theme.value === "dark") setTheme("light");
    else setTheme("auto");
  }

  const nextLabel = computed(() => {
    if (theme.value === "auto") return t("app.settings.themeDark");
    if (theme.value === "dark") return t("app.settings.themeLight");
    return t("app.settings.themeFollowSystem");
  });

  const icon = computed(() => {
    if (theme.value === "auto") return "🌓";
    if (theme.value === "dark") return "🌙";
    return "☀️";
  });

  return { theme, isDark, toggle, setTheme, nextLabel, icon };
}
