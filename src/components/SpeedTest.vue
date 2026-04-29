<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { RefreshRight } from "@element-plus/icons-vue";
import { useRegistryStore } from "@/stores/registry";
import type { LatencyResult } from "@/api/speedtest";
import { testAllSpeed, testSingleSpeed } from "@/api/speedtest";

const store = useRegistryStore();

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
    ElMessage.error(`测速失败: ${e}`);
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
    ElMessage.error(`测速失败: ${e}`);
  } finally {
    singleTesting.value.delete(name);
  }
}

function switchToFastest() {
  if (fastestResult.value) {
    store.switchRegistry(fastestResult.value.name);
  }
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
  <div class="bg-white rounded-xl border border-gray-200 p-5 mt-4">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <h3 class="text-base font-bold">速度测试</h3>
        <span
          v-if="results.length > 0"
          class="text-xs text-gray-400"
        >
          上次测试：{{ results.length }} 个源
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
          切换到最快 ({{ fastestResult.latency_ms }}ms)
        </el-button>
        <el-button
          type="primary"
          size="small"
          :loading="testing"
          @click="runAllTests"
        >
          {{ testing ? "测试中..." : "全部测试" }}
        </el-button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!hasResults && !testing"
      class="py-8 text-center text-sm text-gray-400"
    >
      点击"全部测试"开始测速
    </div>

    <!-- Testing loading -->
    <div v-if="testing && !hasResults" class="py-10 flex items-center justify-center">
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <el-icon class="is-loading"><RefreshRight /></el-icon>
        <span>正在测速，请稍候...</span>
      </div>
    </div>

    <!-- Results -->
    <div v-if="hasResults" class="flex flex-col gap-2">
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
            {{ result.error || "失败" }}
          </span>
        </div>

        <!-- Re-test button -->
        <div class="w-8 flex-shrink-0 text-center">
          <el-button
            v-if="singleTesting.has(result.name)"
            text
            size="small"
            class="!p-1.5 !min-h-0"
            :loading="true"
            :disabled="true"
          />
          <el-button
            v-else
            text
            size="small"
            class="!p-1.5 !min-h-0"
            :disabled="testing"
            @click="runSingleTest(result.name)"
          >
            <el-icon class="text-base"><RefreshRight /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>
