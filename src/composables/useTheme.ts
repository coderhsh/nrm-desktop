import { computed, watch } from "vue";
import { useLocalStorage, usePreferredDark } from "@vueuse/core";

type Theme = "light" | "dark" | "auto";

const theme = useLocalStorage<Theme>("nrm-desktop-theme", "auto");

export function useTheme() {
  const isDarkPreferred = usePreferredDark();

  const isDark = computed(() => {
    if (theme.value === "auto") return isDarkPreferred.value;
    return theme.value === "dark";
  });

  watch(
    isDark,
    (val) => {
      document.documentElement.classList.toggle("dark", val);
    },
    { immediate: true }
  );

  function toggle() {
    if (theme.value === "auto") theme.value = "dark";
    else if (theme.value === "dark") theme.value = "light";
    else theme.value = "auto";
  }

  const nextLabel = computed(() => {
    if (theme.value === "auto") return "深色";
    if (theme.value === "dark") return "浅色";
    return "自动";
  });

  const icon = computed(() => {
    if (theme.value === "auto") return "🌓";
    if (theme.value === "dark") return "🌙";
    return "☀️";
  });

  return { theme, isDark, toggle, nextLabel, icon };
}
