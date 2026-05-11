<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted, provide } from 'vue'
import { useAppBlocksEntrance, appEntranceSettledKey } from '@/composables/useAppBlocksEntrance'
import { Setting } from '@element-plus/icons-vue'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { useRegistryStore } from '@/stores/registry'
import RegistryList from '@/components/RegistryList/index.vue'
import CurrentSource from '@/components/CurrentSource.vue'
import SpeedTest from '@/components/SpeedTest.vue'
import ProxySettings from '@/components/ProxySettings.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import CloseConfirmDialog from '@/components/CloseConfirmDialog.vue'
import * as api from '@/api/tauri'
import type { NodeNpmVersions } from '@/api/tauri'
import { useTheme } from '@/composables/useTheme'
import { useShellIntro } from '@/composables/useShellIntro'
import { useI18n, coerceAppLanguage } from '@/composables/useI18n'
import { useCloseBehavior } from '@/composables/useCloseBehavior'
import { useConfigIO } from '@/composables/useConfigIO'

const store = useRegistryStore()
const theme = useTheme()
const { introPhase, scheduleIntro, introFinished } = useShellIntro()
const introWasFinishedAtBoot = introFinished.value
const entranceSidebarEl = ref<HTMLElement | null>(null)
const entranceCurrentSourceEl = ref<HTMLElement | null>(null)
const entranceSpeedTestEl = ref<HTMLElement | null>(null)
const { entranceSettled } = useAppBlocksEntrance(
  entranceSidebarEl,
  entranceCurrentSourceEl,
  entranceSpeedTestEl,
  introWasFinishedAtBoot,
)
provide(appEntranceSettledKey, entranceSettled)
const shellIntroClass = computed(() => ({
  'app-shell-intro-prep': introPhase.value === 'prep',
  'app-shell-intro-run': introPhase.value === 'run',
}))
const { t, language } = useI18n()
const showProxySettings = ref(false)
const showSettingsDialog = ref(false)
const nodeNpmVersions = ref<NodeNpmVersions | null>(null)
const nodeNpmVersionsLabel = computed(() => {
  const v = nodeNpmVersions.value
  if (!v) return ''
  return t('app.envVersions', {
    nodeVersion: v.node ?? '—',
    npmVersion: v.npm ?? '—',
  })
})
const isProxyFeatureVisible = false

const {
  showCloseConfirmDialog,
  closeActionDraft,
  rememberCloseChoice,
  applyCloseAction,
  handleCloseDialogClosed,
  initCloseHandler,
  cleanup: cleanupCloseHandler,
} = useCloseBehavior()

const { handleExport, handleImport, handleResetDefaults } = useConfigIO()

const elementLocale = computed(() => (coerceAppLanguage(language.value) === 'en' ? en : zhCn))
/** 底部状态栏：只在浅色 / 深色间切换，不出现「跟随系统」作为下一状态 */
const dockThemeIcon = computed(() => {
  const effectiveDark =
    theme.theme.value === 'auto' ? theme.isDark.value : theme.theme.value === 'dark'
  return effectiveDark ? '🌙' : '☀️'
})

const dockNextThemeLabel = computed(() => {
  const effectiveDark =
    theme.theme.value === 'auto' ? theme.isDark.value : theme.theme.value === 'dark'
  return effectiveDark ? t('app.settings.themeLight') : t('app.settings.themeDark')
})

function toggleDockTheme() {
  if (theme.theme.value === 'auto') {
    theme.setTheme(theme.isDark.value ? 'light' : 'dark')
  } else if (theme.theme.value === 'dark') {
    theme.setTheme('light')
  } else {
    theme.setTheme('dark')
  }
}

let unlistenRegistryChanged: null | (() => void) = null

watch(
  language,
  value => {
    const normalized = coerceAppLanguage(value)
    if (normalized !== value) {
      language.value = normalized
      return
    }
    document.documentElement.lang = normalized
  },
  { immediate: true },
)

onMounted(async () => {
  scheduleIntro()
  await store.fetchRegistries()
  void api.getNodeNpmVersions().then(v => {
    nodeNpmVersions.value = v
  })
  const { listen } = await import('@tauri-apps/api/event')
  unlistenRegistryChanged = await listen<string>('registry-changed', event => {
    store.syncCurrentRegistryByName(event.payload)
  })

  await initCloseHandler()
})

onBeforeUnmount(() => {
  if (unlistenRegistryChanged) {
    unlistenRegistryChanged()
    unlistenRegistryChanged = null
  }
  cleanupCloseHandler()
})

async function openGithubHome() {
  try {
    await openExternal('https://github.com/coderhsh/nrm-desktop')
  } catch (e) {
    // error handled silently
  }
}

</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="app-shell" :class="shellIntroClass">
      <div class="app-shell-body">
        <!-- Sidebar -->
        <aside class="app-sidebar">
          <div
            ref="entranceSidebarEl"
            class="app-surface-card registry-sidebar-card app-entrance-pane rounded-[14px]"
            data-entrance="left"
          >
            <RegistryList />
          </div>
        </aside>

        <!-- Main Content -->
        <main class="app-main-area">
          <div class="app-main-stage flex flex-1 flex-col min-h-0">
            <div class="flex-1 flex flex-col min-h-0 pt-6 pb-6 pr-6 pl-3 gap-4">
              <div
                ref="entranceCurrentSourceEl"
                class="app-entrance-pane shrink-0 min-w-0"
                data-entrance="top"
              >
                <CurrentSource />
              </div>
              <div
                ref="entranceSpeedTestEl"
                class="app-entrance-pane min-h-0 flex-1 flex flex-col min-w-0"
                data-entrance="bottom"
              >
                <SpeedTest />
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- Status bar: full window width (below sidebar + main) -->
      <div class="app-statusbar">
          <span
            v-if="nodeNpmVersionsLabel"
            class="app-statusbar-meta text-xs shrink-0 truncate max-w-[280px] mr-2"
            :title="nodeNpmVersionsLabel"
          >
            {{ nodeNpmVersionsLabel }}
          </span>

          <span class="flex-1"></span>

          <el-button
            text
            size="small"
            @click="toggleDockTheme"
            :title="t('app.themeTooltip', { mode: dockNextThemeLabel })"
          >
            {{ dockThemeIcon }}
          </el-button>

          <el-button text size="small" :title="t('common.settings')" @click="showSettingsDialog = true">
            <el-icon class="mr-1"><Setting /></el-icon>
            {{ t('common.settings') }}
          </el-button>

          <el-button
            v-if="isProxyFeatureVisible"
            text
            size="small"
            @click="showProxySettings = true"
            :title="t('app.proxySettings')"
          >
            {{ t('app.proxy') }}
          </el-button>

          <el-button text size="small" @click="handleExport" :title="t('app.exportConfig')">
            {{ t('common.export') }}
          </el-button>

          <el-button text size="small" @click="handleImport" :title="t('app.importConfig')">
            {{ t('common.import') }}
          </el-button>

          <el-button text size="small" title="GitHub" @click="openGithubHome">
            <svg aria-hidden="true" viewBox="0 0 24 24" class="w-4 h-4 shrink-0 text-current opacity-90" fill="currentColor">
              <path
                d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.01-2-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.78 2.7 1.27 3.36.97.1-.76.4-1.27.73-1.56-2.55-.29-5.24-1.29-5.24-5.73 0-1.26.45-2.3 1.18-3.11-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.2 3.16-1.2.63 1.59.24 2.76.12 3.05.74.81 1.18 1.85 1.18 3.11 0 4.45-2.69 5.44-5.25 5.73.41.35.78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.12 0 .31.2.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z"
              />
            </svg>
          </el-button>

        <el-button text size="small" type="danger" @click="handleResetDefaults" :title="t('app.resetDefaults')">
          {{ t('common.reset') }}
        </el-button>
      </div>

      <!-- Proxy Settings Dialog -->
      <ProxySettings v-if="isProxyFeatureVisible" v-model:visible="showProxySettings" @close="showProxySettings = false" />

      <!-- Settings Drawer -->
      <SettingsDrawer
        v-model:visible="showSettingsDialog"
      />

      <!-- Close Confirm Dialog -->
      <CloseConfirmDialog
        v-model:visible="showCloseConfirmDialog"
        v-model:close-action-draft="closeActionDraft"
        v-model:remember-close-choice="rememberCloseChoice"
        @apply="applyCloseAction"
        @closed="handleCloseDialogClosed"
      />
    </div>
  </el-config-provider>
</template>
