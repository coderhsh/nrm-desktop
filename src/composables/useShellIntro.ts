import { nextTick, shallowRef } from "vue";
import { useLocalStorage } from "@vueuse/core";

const INTRO_STORAGE_KEY = "nrm-desktop-shell-intro-v1";

const introFinished = useLocalStorage(INTRO_STORAGE_KEY, false);

/** 未完成首次入场时首帧即为 prep，避免子组件先闪再藏 */
const introPhase = shallowRef<"idle" | "prep" | "run">(introFinished.value ? "idle" : "prep");

/**
 * 首次启动：侧栏 + 主区 + 列表头部错层入场；完成后写入 localStorage，之后不再播放。
 */
export function useShellIntro() {
  function scheduleIntro() {
    if (introFinished.value) {
      introPhase.value = "idle";
      return;
    }
    if (introPhase.value !== "prep") return;

    void nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!introFinished.value && introPhase.value === "prep") {
            introPhase.value = "run";
          }
        });
      });
      window.setTimeout(() => {
        introFinished.value = true;
        introPhase.value = "idle";
      }, 720);
    });
  }

  return { introPhase, introFinished, scheduleIntro };
}
