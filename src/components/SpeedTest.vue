<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { RefreshRight } from "@element-plus/icons-vue";
import { useRegistryStore } from "@/stores/registry";
import { useI18n } from "@/composables/useI18n";
import type { LatencyResult } from "@/api/speedtest";
import { testAllSpeed, testSingleSpeed } from "@/api/speedtest";
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from "@/utils/latency-error-i18n";

const store = useRegistryStore();
const { t } = useI18n();

const results = ref<LatencyResult[]>([]);
const testing = ref(false);
const singleTesting = ref<Set<string>>(new Set());

const hasResults = computed(() => results.value.length > 0);

const fastestResult = computed(() => {
  const success = results.value.filter((r) => r.latency_ms !== null);
  return success.length > 0 ? success[0] : null;
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

async function runAllTests() {
  testing.value = true;
  results.value = [];
  try {
    results.value = await testAllSpeed();
    syncAllLatencyResults(results.value);
  } catch (e) {
    ElMessage.error(
      t("speedTest.runError", { detail: truncateSpeedTestRunError(String(e)) }),
    );
  } finally {
    testing.value = false;
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
    } else {
      results.value.push(result);
      results.value.sort((a, b) => {
        if (a.latency_ms !== null && b.latency_ms !== null)
          return a.latency_ms - b.latency_ms;
        if (a.latency_ms !== null) return -1;
        if (b.latency_ms !== null) return 1;
        return 0;
      });
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
  if (ms === null) return "#94a3b8";
  if (ms < 200) return "#22c55e";
  if (ms < 500) return "#84cc16";
  if (ms < 1000) return "#eab308";
  if (ms < 3000) return "#f97316";
  return "#ef4444";
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
</script>

<template>
  <div class="speed-test-card bg-white rounded-xl border border-gray-200 p-5 flex flex-col min-h-0 flex-1 overflow-hidden">
    <div class="flex items-center justify-between mb-4 shrink-0">
      <div class="flex items-center gap-2">
        <h3 class="text-base font-bold">{{ t("speedTest.title") }}</h3>
        <span
          v-if="results.length > 0"
          class="text-xs text-gray-400"
        >
          {{ t("speedTest.lastTested", { count: results.length }) }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <el-button
          v-if="hasResults && fastestResult"
          type="success"
          size="small"
          :disabled="testing"
          @click="switchToFastest"
        >
          {{ t("speedTest.switchFastest", { latency: fastestResult.latency_ms ?? "-" }) }}
        </el-button>
        <el-button
          type="primary"
          size="small"
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
            v-for="result in results"
            :key="result.name"
            class="flex items-center gap-3 py-1.5"
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
              <div class="absolute inset-0 bg-gray-100 rounded-full overflow-hidden">
                <div
                  v-if="result.latency_ms !== null"
                  class="h-full rounded-full transition-all duration-500 ease-out"
                  :style="{
                    width: getBarWidth(result.latency_ms, maxLatency),
                    background: getBarColor(result.latency_ms),
                    opacity: store.currentRegistry?.name === result.name ? 0.9 : 0.6,
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
.speed-retest-btn.el-button.is-link {
  background-color: transparent !important;
}
.speed-retest-btn.el-button.is-link:hover,
.speed-retest-btn.el-button.is-link:focus {
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
