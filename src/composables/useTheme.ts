import { computed, watch } from "vue";
import { useLocalStorage, usePreferredDark } from "@vueuse/core";
import { useI18n } from "./useI18n";

type Theme = "light" | "dark" | "auto";

const theme = useLocalStorage<Theme>("nrm-desktop-theme", "auto");

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyDarkClass(val: boolean) {
  document.documentElement.classList.toggle("dark", val);
}

/** 首次同步主题不打动画，避免首屏闪一下 */
let isInitialThemeApply = true;

function transitionToDarkClass(val: boolean) {
  const apply = () => applyDarkClass(val);
  if (isInitialThemeApply) {
    apply();
    isInitialThemeApply = false;
    return;
  }
  if (prefersReducedMotion()) {
    apply();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(apply);
    return;
  }
  apply();
}

export function useTheme() {
  const { t } = useI18n();
  const isDarkPreferred = usePreferredDark();

  const isDark = computed(() => {
    if (theme.value === "auto") return isDarkPreferred.value;
    return theme.value === "dark";
  });

  watch(
    isDark,
    (val) => {
      transitionToDarkClass(val);
    },
    { immediate: true }
  );

  function toggle() {
    if (theme.value === "auto") theme.value = "dark";
    else if (theme.value === "dark") theme.value = "light";
    else theme.value = "auto";
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

  return { theme, isDark, toggle, nextLabel, icon };
}
