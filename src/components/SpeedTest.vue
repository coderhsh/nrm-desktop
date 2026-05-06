<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "element-plus";
import { RefreshRight } from "@element-plus/icons-vue";
import { useRegistryStore } from "@/stores/registry";
import { useI18n } from "@/composables/useI18n";
import type { LatencyResult } from "@/api/speedtest";
import { testAllSpeed, testSingleSpeed } from "@/api/speedtest";
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from "@/utils/latency-error-i18n";
import { latencyBarColor } from "@/utils/latency-bar-color";

const store = useRegistryStore();
const { t } = useI18n();

const results = ref<LatencyResult[]>([]);
/** 首屏为 true，避免挂载前出现「请点击测速」空态；与重新测速时的 loading 一致 */
const testing = ref(true);
const singleTesting = ref<Set<string>>(new Set());

const hasResults = computed(() => results.value.length > 0);

/** 与后端 `test_all`、单次重测一致：成功项按延迟升序，失败置底 */
function sortLatencyResults(items: LatencyResult[]): LatencyResult[] {
  return [...items].sort((a, b) => {
    if (a.latency_ms !== null && b.latency_ms !== null) {
      return a.latency_ms - b.latency_ms;
    }
    if (a.latency_ms !== null) return -1;
    if (b.latency_ms !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

const fastestResult = computed(() => {
  let best: LatencyResult | null = null;
  let bestMs = Infinity;
  for (const r of results.value) {
    if (r.latency_ms === null) continue;
    if (r.latency_ms < bestMs) {
      bestMs = r.latency_ms;
      best = r;
    }
  }
  return best;
});

/**
 * Sync full latency results to the registry store for sidebar display.
 */
function syncAllLatencyResults(items: LatencyResult[]) {
  const map: Record<string, LatencyResult> = {};
  for (const item of items) {
    map[item.name] = item;
  }
  store.latencyResults = map;
}

/**
 * Sync one latency result to the registry store after re-test.
 */
function syncSingleLatencyResult(item: LatencyResult) {
  store.latencyResults = {
    ...store.latencyResults,
    [item.name]: item,
  };
}

const speedRevealStepMs = 76;

async function runAllTests() {
  testing.value = true;
  store.setLatencyLoading(true);
  results.value = [];
  try {
    const items = await testAllSpeed();
    syncAllLatencyResults(items);

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (reduceMotion || items.length === 0) {
      results.value = sortLatencyResults(items);
    } else {
      for (let i = 0; i < items.length; i++) {
        results.value.push(items[i]);
        if (i < items.length - 1) {
          await new Promise((r) => setTimeout(r, speedRevealStepMs));
        }
      }
    }
  } catch (e) {
    ElMessage.error(
      t("speedTest.runError", { detail: truncateSpeedTestRunError(String(e)) }),
    );
  } finally {
    testing.value = false;
    store.setLatencyLoading(false);
  }
}

async function runSingleTest(name: string) {
  singleTesting.value.add(name);
  try {
    const result = await testSingleSpeed(name);
    syncSingleLatencyResult(result);
    const idx = results.value.findIndex((r) => r.name === name);
    if (idx !== -1) {
      results.value[idx] = result;
      results.value = sortLatencyResults(results.value);
    } else {
      results.value = sortLatencyResults([...results.value, result]);
    }
  } catch (e) {
    ElMessage.error(
      t("speedTest.runError", { detail: truncateSpeedTestRunError(String(e)) }),
    );
  } finally {
    singleTesting.value.delete(name);
  }
}

function switchToFastest() {
  if (fastestResult.value) {
    store.switchRegistry(fastestResult.value.name);
  }
}

/** 结果行上展示的短失败原因（随语言切换） */
function latencyRowFailText(error: string | null | undefined): string {
  return formatLatencyErrorMessage(t, error, 20);
}

function getBarColor(ms: number | null): string {
  return latencyBarColor(ms);
}

function getBarWidth(ms: number | null, maxMs: number): string {
  if (ms === null) return "0%";
  const pct = Math.max(2, (1 - ms / maxMs) * 100);
  return `${pct}%`;
}

const maxLatency = computed(() => {
  const vals = results.value
    .map((r) => r.latency_ms)
    .filter((v): v is number => v !== null);
  return vals.length > 0 ? Math.max(...vals, 100) : 100;
});

onMounted(() => {
  void runAllTests();
});

/** 源重命名后 store 已迁移 latency 键，本地 results 仍带旧 name，需与 registries 对齐 */
watch(
  () => store.registries.map((r) => r.name).join("\n"),
  (nextKey, prevKey) => {
    if (prevKey === undefined || nextKey === prevKey || testing.value) return;
    if (results.value.length === 0) return;
    const map = store.latencyResults;
    const rebuilt = store.registries.map((reg) => {
      const hit = map[reg.name];
      if (hit) return { ...hit };
      return {
        name: reg.name,
        url: reg.url,
        latency_ms: null,
        error: null,
        is_custom: !!reg.is_custom,
      };
    });
    results.value = sortLatencyResults(rebuilt);
  },
);
</script>

<template>
  <div class="speed-test-card app-card p-5 flex flex-col min-h-0 flex-1 overflow-hidden">
    <div class="flex items-center justify-between mb-4 shrink-0">
      <h3 class="text-base font-bold">{{ t("speedTest.title") }}</h3>
      <div class="flex items-center gap-2 shrink-0">
        <el-button
          v-if="hasResults && fastestResult"
          type="success"
          size="small"
          class="shrink-0"
          :disabled="testing"
          @click="switchToFastest"
        >
          {{ t("speedTest.switchFastest") }}
        </el-button>
        <el-button
          type="primary"
          size="small"
          class="speed-test-retest-btn shrink-0"
          :loading="testing"
          @click="runAllTests"
        >
          {{ testing ? t("speedTest.testing") : t("speedTest.testAll") }}
        </el-button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!hasResults && !testing"
      class="py-8 text-center text-sm text-gray-400 shrink-0"
    >
      {{ t("speedTest.empty") }}
    </div>

    <!-- Testing loading -->
    <div v-if="testing && !hasResults" class="py-10 flex items-center justify-center shrink-0">
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <el-icon class="is-loading"><RefreshRight /></el-icon>
        <span>{{ t("speedTest.loading") }}</span>
      </div>
    </div>

    <!-- Results：仅在卡片内滚动，避免主区域出现滚动条 -->
    <div v-if="hasResults" class="flex-1 min-h-0 min-w-0 overflow-hidden">
      <el-scrollbar class="app-scrollbar h-full">
        <div class="flex flex-col gap-2 pe-1">
          <div
            v-for="(result, index) in results"
            :key="result.name"
            class="speed-result-row flex items-center gap-3 py-1.5"
            :style="{
              '--speed-stagger': String(index * 18),
              /* 全部测速逐条入场时，行已错开时间轴，柱条仅用短阶梯即可 */
              '--bar-stagger-ms': String(32 + index * 14),
            }"
          >
            <!-- Name -->
            <div class="w-20 flex-shrink-0">
              <div class="flex items-center gap-1">
                <span
                  class="text-sm font-medium truncate"
                  :class="{
                    'text-primary': store.currentRegistry?.name === result.name,
                  }"
                >
                  {{ result.name }}
                </span>
              </div>
            </div>

            <!-- Bar -->
            <div class="flex-1 h-5 relative">
              <div class="absolute inset-0 bg-app-track rounded-full overflow-hidden">
                <div
                  v-if="result.latency_ms !== null"
                  class="latency-bar-fill h-full rounded-full"
                  :style="{
                    width: getBarWidth(result.latency_ms, maxLatency),
                    background: getBarColor(result.latency_ms),
                    opacity: store.currentRegistry?.name === result.name ? 0.92 : 0.62,
                  }"
                ></div>
              </div>
            </div>

            <!-- Value -->
            <div class="w-20 text-right flex-shrink-0">
              <span
                v-if="result.latency_ms !== null"
                class="text-sm font-mono font-medium"
                :style="{ color: getBarColor(result.latency_ms) }"
              >
                {{ result.latency_ms }}ms
              </span>
              <span
                v-else
                class="text-xs text-gray-400"
              >
                {{ latencyRowFailText(result.error) }}
              </span>
            </div>

            <!-- Re-test button：固定占位，避免 loading 与图标切换时抖动 -->
            <div class="w-8 h-8 flex-shrink-0 flex items-center justify-center">
              <el-button
                link
                size="small"
                class="speed-retest-btn speed-retest-btn-fixed"
                :loading="singleTesting.has(result.name)"
                :disabled="testing || singleTesting.has(result.name)"
                @click="runSingleTest(result.name)"
              >
                <el-icon v-if="!singleTesting.has(result.name)" class="text-base leading-none">
                  <RefreshRight />
                </el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
/* 固定宽度，loading 时避免左侧「切换到最快」被挤动 */
/* 固定宽度：loading 与文案切换时不挤动「切换到最快」 */
.speed-test-retest-btn.el-button--small {
  width: 7rem;
  min-width: 7rem;
  max-width: 7rem;
  justify-content: center;
  padding-left: 0.35rem;
  padding-right: 0.35rem;
}

.speed-retest-btn.el-button.is-link {
  background-color: transparent !important;
}
.speed-retest-btn.el-button.is-link:hover,
.speed-retest-btn.el-button.is-link:focus {
  background-color: transparent !important;
}
/* Element Plus loading 态会绘制 ::before 蒙层，这里强制透明避免深色模式出现黑底 */
.speed-retest-btn.el-button.is-link.is-loading::before {
  background-color: transparent !important;
}
.speed-retest-btn-fixed.el-button.is-link {
  width: 2rem;
  height: 2rem;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0 !important;
  box-sizing: border-box;
}
.speed-retest-btn-fixed :deep(.el-icon) {
  font-size: 1rem;
}
.speed-retest-btn-fixed.is-loading :deep(.el-icon) {
  font-size: 1rem;
}
</style>
