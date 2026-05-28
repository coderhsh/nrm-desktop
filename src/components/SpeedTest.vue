<script setup lang="ts">
import { ref, computed, onMounted, watch, inject } from 'vue'
import { RefreshRight } from '@element-plus/icons-vue'
import { useRegistryStore } from '@/stores/registry'
import AppSurfaceCard from '@/components/AppSurfaceCard.vue'
import { useI18n } from '@/composables/useI18n'
import { useTheme } from '@/composables/useTheme'
import type { LatencyResult } from '@/api/speedtest'
import { testAllSpeed, testSingleSpeed } from '@/api/speedtest'
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from '@/utils/latency-error-i18n'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'
import { latencyBarColor } from '@/utils/latency-bar-color'
import { appEntranceSettledKey } from '@/composables/useAppBlocksEntrance'
import { getSpeedResultBarStaggerMs, getSpeedResultRowStaggerMs, sortLatencyResults } from '@/components/SpeedTest/utils'

const store = useRegistryStore()
const entranceSettled = inject(appEntranceSettledKey, Promise.resolve())
const { t } = useI18n()
const { isDark } = useTheme()

const results = ref<LatencyResult[]>([])
/** 首屏为 true，避免挂载前出现「请点击测速」空态；与重新测速时的 loading 一致 */
const testing = ref(true)
const singleTesting = ref<Record<string, boolean>>({})

const hasResults = computed(() => results.value.length > 0)
const hasRegistries = computed(() => store.registries.length > 0)

const fastestResult = computed(() => {
  let best: LatencyResult | null = null
  let bestMs = Infinity
  for (const r of results.value) {
    if (r.latency_ms === null) continue
    if (r.latency_ms < bestMs) {
      bestMs = r.latency_ms
      best = r
    }
  }
  return best
})

/**
 * Sync full latency results to the registry store for sidebar display.
 */
function syncAllLatencyResults(items: LatencyResult[]) {
  store.setLatencyResults(items)
}

/**
 * Sync one latency result to the registry store after re-test.
 */
function syncSingleLatencyResult(item: LatencyResult) {
  store.setSingleLatencyResult(item)
}

async function runAllTests() {
  if (!hasRegistries.value) {
    results.value = []
    store.setLatencyResults([])
    testing.value = false
    store.setLatencyLoading(false)
    return
  }

  testing.value = true
  store.setLatencyLoading(true)
  results.value = []
  try {
    const items = await testAllSpeed()
    const sortedItems = sortLatencyResults(items)
    syncAllLatencyResults(sortedItems)
    results.value = sortedItems
  } catch (e) {
    ElMessage.error(
      t('speedTest.runError', {
        detail: truncateSpeedTestRunError(formatInvokeErrorMessage(t, e)),
      })
    )
  } finally {
    testing.value = false
    store.setLatencyLoading(false)
  }
}

async function runSingleTest(name: string) {
  singleTesting.value = { ...singleTesting.value, [name]: true }
  try {
    const result = await testSingleSpeed(name)
    syncSingleLatencyResult(result)
    const idx = results.value.findIndex(r => r.name === name)
    if (idx !== -1) {
      results.value[idx] = result
      results.value = sortLatencyResults(results.value)
    } else {
      results.value = sortLatencyResults([...results.value, result])
    }
  } catch (e) {
    ElMessage.error(
      t('speedTest.runError', {
        detail: truncateSpeedTestRunError(formatInvokeErrorMessage(t, e)),
      })
    )
  } finally {
    const { [name]: _, ...rest } = singleTesting.value
    singleTesting.value = rest
  }
}

function switchToFastest() {
  if (fastestResult.value) {
    store.switchRegistry(fastestResult.value.name)
  }
}

/** 结果行上展示的短失败原因（随语言切换） */
function latencyRowFailText(error: string | null | undefined): string {
  return formatLatencyErrorMessage(t, error, 20)
}

function getBarColor(ms: number | null): string {
  if (!isDark.value) return latencyBarColor(ms)
  if (ms === null) return '#8e8e93'
  if (ms < 200) return '#30d158'
  if (ms < 500) return '#32d74b'
  if (ms < 1000) return '#ffd60a'
  if (ms < 3000) return '#ff9f0a'
  return '#ff453a'
}

function getBarWidth(ms: number | null, maxMs: number): string {
  if (ms === null) return '0%'
  const pct = Math.max(2, (1 - ms / maxMs) * 100)
  return `${pct}%`
}

const maxLatency = computed(() => {
  const vals = results.value.map(r => r.latency_ms).filter((v): v is number => v !== null)
  return vals.length > 0 ? Math.max(...vals, 100) : 100
})

onMounted(async () => {
  await entranceSettled
  void runAllTests()
})

/**
 * 增量同步到右侧测速列表：
 * - 不触发全量测速
 * - 新增源只新增一行，并使用该源单次测速结果
 */
watch(
  () => ({
    registries: store.registries.map(r => ({ name: r.name, url: r.url })),
    latency: store.latencyResults,
  }),
  ({ registries, latency }, prev) => {
    if (prev === undefined || testing.value) return

    const regNameSet = new Set(registries.map(r => r.name))
    const byName = new Map(results.value.map(item => [item.name, item]))

    // 删除已不存在的源
    for (const name of Array.from(byName.keys())) {
      if (!regNameSet.has(name)) byName.delete(name)
    }

    // 按当前源列表维护行，并仅更新已有或新增的单条结果
    for (const reg of registries) {
      const hit = latency[reg.name]
      if (hit) {
        byName.set(reg.name, { ...hit })
        continue
      }
      if (!byName.has(reg.name)) {
        byName.set(reg.name, {
          name: reg.name,
          url: reg.url,
          latency_ms: null,
          error: null,
        })
      }
    }

    results.value = sortLatencyResults(Array.from(byName.values()))
  },
  { deep: true }
)
</script>

<template>
  <AppSurfaceCard class="speed-test-card p-5 flex flex-col min-h-0 flex-1 overflow-hidden rounded-2xl">
    <div class="flex items-center justify-between mb-4 shrink-0">
      <h3 class="speed-test-title text-base font-semibold">{{ t('speedTest.title') }}</h3>
      <div class="flex items-center gap-2 shrink-0">
        <el-button
          v-if="hasResults && fastestResult"
          text
          size="small"
          class="speed-test-header-action speed-fastest-btn shrink-0 !px-2.5 !py-1.5 !rounded-full !border-0 !transition-all !duration-250 !ease-out active:!scale-[0.97]"
          :disabled="testing"
          @click="switchToFastest"
        >
          {{ t('speedTest.switchFastest') }}
        </el-button>
        <el-button
          text
          size="small"
          class="speed-test-header-action speed-test-retest-btn speed-test-main-btn shrink-0 !px-2.5 !py-1.5 !rounded-full !border-0 !transition-all !duration-250 !ease-out active:!scale-[0.97]"
          :loading="testing"
          :disabled="!hasRegistries"
          @click="runAllTests"
        >
          {{ testing ? t('speedTest.testing') : t('speedTest.testAll') }}
        </el-button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!hasResults && !testing" class="py-8 text-center text-sm text-gray-400 shrink-0">
      {{ t('speedTest.empty') }}
    </div>

    <!-- Testing loading -->
    <div v-if="testing && !hasResults" class="py-10 flex items-center justify-center shrink-0">
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <el-icon class="is-loading"><RefreshRight /></el-icon>
        <span>{{ t('speedTest.loading') }}</span>
      </div>
    </div>

    <!-- Results：仅在卡片内滚动，避免主区域出现滚动条 -->
    <div v-if="hasResults" class="flex-1 min-h-0 min-w-0 overflow-hidden">
      <el-scrollbar class="app-scrollbar h-full">
        <div class="flex flex-col gap-2 pe-1">
          <div
            v-for="(result, index) in results"
            :key="result.name"
            class="speed-result-row flex items-center gap-3 py-1.5 px-2"
            :style="{
              '--speed-stagger': String(getSpeedResultRowStaggerMs(index)),
              /* 全部测速逐条入场时，行已错开时间轴，柱条仅用短阶梯即可 */
              '--bar-stagger-ms': String(getSpeedResultBarStaggerMs(index)),
            }"
          >
            <!-- Name -->
            <div class="w-20 flex-shrink-0">
              <div class="flex items-center gap-1">
                <span
                  class="speed-result-name text-sm font-medium truncate"
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
              <div class="speed-result-track absolute inset-0 rounded-full overflow-hidden">
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
              <span v-if="result.latency_ms !== null" class="speed-result-value text-sm font-mono font-medium" :style="{ color: getBarColor(result.latency_ms) }"> {{ result.latency_ms }}ms </span>
              <span v-else class="speed-result-error text-xs text-gray-400">
                {{ latencyRowFailText(result.error) }}
              </span>
            </div>

            <!-- Re-test button：固定占位，避免 loading 与图标切换时抖动 -->
            <div class="w-8 h-8 flex-shrink-0 flex items-center justify-center">
              <el-button link size="small" class="speed-retest-btn speed-retest-btn-fixed speed-retest-pill" :loading="singleTesting[result.name]" :disabled="testing || singleTesting[result.name]" @click="runSingleTest(result.name)">
                <el-icon v-if="!singleTesting[result.name]" class="text-base leading-none">
                  <RefreshRight />
                </el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </AppSurfaceCard>
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

.speed-test-title {
  color: #1f232b;
  letter-spacing: -0.01em;
}

.speed-test-card {
  user-select: none;
  -webkit-user-select: none;
}

/* 顶栏按钮：与当前源「复制 URL」同款（见 styles/speed-test.css .speed-test-header-action）；此处仅布局 */
.speed-test-main-btn.el-button--small,
.speed-fastest-btn.el-button--small {
  justify-content: center;
}

.speed-test-main-btn.el-button--small :deep(.el-button__content) {
  width: 100%;
  justify-content: center;
}

.speed-test-main-btn.el-button--small.is-loading :deep(.el-icon.is-loading) {
  margin-right: 0.35rem;
  margin-left: 0;
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
  position: relative;
}
.speed-retest-btn-fixed.el-button.is-link :deep(.el-button__content) {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.speed-retest-btn-fixed :deep(.el-icon) {
  font-size: 1rem;
}
.speed-retest-btn-fixed.is-loading :deep(.el-icon) {
  font-size: 1rem;
}
.speed-retest-btn-fixed.is-loading :deep(.el-icon.is-loading) {
  margin-right: 0 !important;
  margin-left: 0 !important;
}
.speed-retest-btn-fixed.el-button.is-link.is-loading :deep(.el-button__content) {
  color: transparent;
}
.speed-retest-btn-fixed.el-button.is-link.is-loading :deep(.el-icon.is-loading) {
  position: absolute;
  inset: 0;
  width: 1rem;
  height: 1rem;
  margin: auto !important;
}

.speed-retest-pill.el-button.is-link {
  border-radius: 999px;
  color: #556073 !important;
  border: 1px solid rgba(170, 182, 201, 0.44);
  background: rgba(255, 255, 255, 0.64) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 1px 2px rgba(25, 38, 58, 0.06);
}

.speed-retest-pill.el-button.is-link:hover,
.speed-retest-pill.el-button.is-link:focus {
  color: #384357 !important;
  border-color: rgba(148, 164, 188, 0.58);
  background: rgba(255, 255, 255, 0.82) !important;
}

.speed-result-row {
  border-radius: 10px;
  transition: background-color 220ms var(--app-ease-out);
}

.speed-result-row:hover {
  background: color-mix(in srgb, #f5f7fb 88%, var(--el-color-primary) 12%);
}

.speed-result-track {
  background: linear-gradient(180deg, rgba(222, 228, 237, 0.78) 0%, rgba(214, 221, 232, 0.72) 100%);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.62);
}

.speed-result-name {
  color: #2a313d;
}

.speed-result-value {
  letter-spacing: -0.01em;
}

.speed-result-error {
  color: #7a8392 !important;
}

:global(html.dark) .speed-test-title {
  color: #f5f5f7;
}

:global(html.dark) .speed-result-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

:global(html.dark) .speed-result-track {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.06) 100%);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04);
}

:global(html.dark) .speed-result-name {
  color: rgba(235, 235, 245, 0.86);
}

:global(html.dark) .speed-result-error {
  color: rgba(235, 235, 245, 0.55) !important;
}

:global(html.dark) .speed-retest-pill.el-button.is-link {
  color: rgba(235, 240, 255, 0.86) !important;
  border-color: rgba(255, 255, 255, 0.13);
  background: rgba(255, 255, 255, 0.08) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 2px 6px rgba(0, 0, 0, 0.24);
}

:global(html.dark) .speed-retest-pill.el-button.is-link:hover,
:global(html.dark) .speed-retest-pill.el-button.is-link:focus {
  color: #f4f8ff !important;
  border-color: rgba(126, 197, 255, 0.42);
  background: rgba(126, 197, 255, 0.2) !important;
}
</style>
