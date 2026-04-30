<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'
import { useLocalStorage } from '@vueuse/core'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { save, open } from '@tauri-apps/plugin-dialog'
import { useRegistryStore } from '@/stores/registry'
import RegistryList from '@/components/RegistryList.vue'
import CurrentSource from '@/components/CurrentSource.vue'
import SpeedTest from '@/components/SpeedTest.vue'
import ProxySettings from '@/components/ProxySettings.vue'
import * as api from '@/api/tauri'
import type { NodeNpmVersions } from '@/api/tauri'
import { useTheme } from '@/composables/useTheme'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY } from '@/composables/useI18n'

const store = useRegistryStore()
const theme = useTheme()
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
const showCloseConfirmDialog = ref(false)
/** 关于软件信息弹窗 */
const showAboutDialog = ref(false)
const aboutLoading = ref(false)
const aboutInfo = ref<{ name: string; version: string; tauriVersion: string } | null>(null)
const closeBehavior = useLocalStorage<'ask' | 'minimize' | 'exit'>('nrm-desktop-close-behavior', 'ask')
const closeActionDraft = ref<'minimize' | 'exit'>('minimize')
const rememberCloseChoice = ref(false)
const isClosingByChoice = ref(false)
const isProxyFeatureVisible = false
const draftLanguage = ref<'zh-CN' | 'en'>('zh-CN')
const categoryByRegistry = useLocalStorage<Record<string, string>>(
  CATEGORY_BY_REGISTRY_STORAGE_KEY,
  {}
)
const draftTheme = ref<'light' | 'dark' | 'auto'>('auto')
const languageOptions = [
  { label: '简体中文', value: 'zh-CN' as const },
  { label: 'English', value: 'en' as const },
]
const themeOptions = computed(() => [
  { label: t('app.settings.themeAuto'), value: 'auto' as const },
  { label: t('app.settings.themeLight'), value: 'light' as const },
  { label: t('app.settings.themeDark'), value: 'dark' as const },
])
const elementLocale = computed(() => (language.value === 'en' ? en : zhCn))
const nextThemeLabel = computed(() => {
  if (theme.theme.value === 'auto') return t('app.settings.themeDark')
  if (theme.theme.value === 'dark') return t('app.settings.themeLight')
  return t('app.settings.themeAuto')
})
let unlistenCloseRequested: null | (() => void) = null
let unlistenRegistryChanged: null | (() => void) = null

watch(
  language,
  value => {
    document.documentElement.lang = value
  },
  { immediate: true }
)

watch(showSettingsDialog, visible => {
  if (!visible) return
  draftLanguage.value = language.value
  draftTheme.value = theme.theme.value
})

function handleSaveSettings() {
  const nextLanguage = draftLanguage.value
  language.value = draftLanguage.value
  theme.theme.value = draftTheme.value
  void invoke('set_app_language', { lang: nextLanguage }).catch(() => {
    ElMessage.error('托盘菜单语言更新失败，请重试')
  })
  showSettingsDialog.value = false
  ElMessage.success(nextLanguage === 'en' ? 'Settings saved' : '设置已保存')
}

/**
 * 打开关于对话框并异步拉取 Tauri 应用名称、版本与 Tauri 运行时版本。
 */
async function openAboutInfo() {
  showAboutDialog.value = true
  aboutLoading.value = true
  aboutInfo.value = null
  try {
    const { getName, getVersion, getTauriVersion } = await import('@tauri-apps/api/app')
    const [name, version, tauriVersion] = await Promise.all([
      getName(),
      getVersion(),
      getTauriVersion(),
    ])
    aboutInfo.value = { name, version, tauriVersion }
  } catch {
    aboutInfo.value = {
      name: 'nrm-desktop',
      version: '—',
      tauriVersion: '—',
    }
  } finally {
    aboutLoading.value = false
  }
}

onMounted(async () => {
  await store.fetchRegistries()
  void api.getNodeNpmVersions().then(v => {
    nodeNpmVersions.value = v
  })
  // 初始化时静默测速，在左侧源列表展示延迟
  store.fetchLatency()

  const { listen } = await import('@tauri-apps/api/event')
  unlistenRegistryChanged = await listen<string>('registry-changed', event => {
    store.syncCurrentRegistryByName(event.payload)
  })

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const appWindow = getCurrentWindow()
  unlistenCloseRequested = await appWindow.onCloseRequested(async event => {
    if (isClosingByChoice.value) return
    event.preventDefault()

    if (closeBehavior.value === 'minimize') {
      try {
        await invoke('hide_main_window')
      } catch {
        ElMessage.error(t('app.closeDialog.minimizeFailed'))
      }
      return
    }

    if (closeBehavior.value === 'exit') {
      isClosingByChoice.value = true
      await invoke('exit_app')
      return
    }

    closeActionDraft.value = 'minimize'
    rememberCloseChoice.value = false
    showCloseConfirmDialog.value = true
  })
})

onBeforeUnmount(() => {
  if (unlistenRegistryChanged) {
    unlistenRegistryChanged()
    unlistenRegistryChanged = null
  }
  if (unlistenCloseRequested) {
    unlistenCloseRequested()
    unlistenCloseRequested = null
  }
})

async function handleExport() {
  try {
    const data = await api.exportConfig()
    const json = JSON.stringify(data, null, 2)
    const path = await save({
      defaultPath: 'nrm-registries.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!path) return
    await api.writeTextFile(path, json)
    ElMessage.success('配置已导出')
  } catch (e) {
    ElMessage.error(`导出失败: ${e}`)
  }
}

async function handleImport() {
  try {
    const path = await open({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    })
    if (!path) return
    const json = await api.readTextFile(path as string)
    await api.importConfig(json)
    ElMessage.success('配置已导入')
    store.fetchRegistries()
  } catch (e) {
    ElMessage.error(`导入失败: ${e}`)
  }
}

async function openGithubHome() {
  try {
    await openExternal('https://github.com/coderhsh/nrm-desktop')
  } catch (e) {
    ElMessage.error(t('app.closeDialog.githubOpenFailed', { error: String(e) }))
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      t('app.resetConfirm.message'),
      t('app.resetConfirm.title'),
      {
        confirmButtonText: t('app.resetConfirm.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    )
    const lang = await api.resetDefaults()
    if (lang === 'en' || lang === 'zh-CN') {
      language.value = lang
      draftLanguage.value = lang
    }
    ElMessage.success(t('app.resetConfirm.success'))
    categoryByRegistry.value = {}
    store.fetchRegistries()
    showSettingsDialog.value = false
  } catch {
    // cancelled
  }
}

function closeCloseConfirmDialog() {
  showCloseConfirmDialog.value = false
}

async function applyCloseAction() {
  showCloseConfirmDialog.value = false
  if (rememberCloseChoice.value) {
    closeBehavior.value = closeActionDraft.value
  }
  if (closeActionDraft.value === 'minimize') {
    try {
      await invoke('hide_main_window')
    } catch {
      ElMessage.error('缩小到托盘失败，请重试')
    }
    return
  }
  isClosingByChoice.value = true
  await invoke('exit_app')
}
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="h-full flex">
      <!-- Sidebar -->
      <aside class="w-80 min-w-80 bg-white border-r border-gray-200 flex flex-col">
        <RegistryList />
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col min-w-0 min-h-0">
        <div class="flex-1 flex flex-col min-h-0 overflow-hidden p-6 gap-4">
          <CurrentSource class="shrink-0" />
          <SpeedTest class="min-h-0 flex-1 flex flex-col overflow-hidden" />
        </div>

        <!-- Status Bar -->
        <div class="h-10 px-3 border-t border-gray-200 bg-white flex items-center gap-0.5">
          <span
            v-if="nodeNpmVersionsLabel"
            class="text-xs text-gray-400 shrink-0 truncate max-w-[280px] mr-2"
            :title="nodeNpmVersionsLabel"
          >
            {{ nodeNpmVersionsLabel }}
          </span>

          <span class="flex-1"></span>

          <el-button
            text
            size="small"
            @click="theme.toggle()"
            :title="t('app.themeTooltip', { mode: nextThemeLabel })"
          >
            {{ theme.icon.value }}
          </el-button>

          <el-button text size="small" :title="t('common.settings')" @click="showSettingsDialog = true">
            <el-icon class="mr-1"><Setting /></el-icon>
            {{ t('common.settings') }}
          </el-button>

          <el-button v-if="isProxyFeatureVisible" text size="small" @click="showProxySettings = true" title="代理设置">
            {{ t('app.proxy') }}
          </el-button>

          <el-button text size="small" @click="handleExport" :title="t('app.exportConfig')">
            {{ t('common.export') }}
          </el-button>

          <el-button text size="small" @click="handleImport" :title="t('app.importConfig')">
            {{ t('common.import') }}
          </el-button>

          <el-button text size="small" title="GitHub" @click="openGithubHome">
            <svg aria-hidden="true" viewBox="0 0 24 24" class="w-4 h-4 text-gray-700 dark:text-gray-200" fill="currentColor">
              <path
                d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56 0-.28-.01-1.02-.01-2-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.78 2.7 1.27 3.36.97.1-.76.4-1.27.73-1.56-2.55-.29-5.24-1.29-5.24-5.73 0-1.26.45-2.3 1.18-3.11-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.2 3.16-1.2.63 1.59.24 2.76.12 3.05.74.81 1.18 1.85 1.18 3.11 0 4.45-2.69 5.44-5.25 5.73.41.35.78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.12 0 .31.2.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z"
              />
            </svg>
          </el-button>

          <el-button text size="small" type="danger" @click="handleReset" :title="t('app.resetDefaults')">
            {{ t('common.reset') }}
          </el-button>
        </div>
      </main>

      <!-- Proxy Settings Dialog -->
      <ProxySettings v-if="isProxyFeatureVisible" v-model:visible="showProxySettings" @close="showProxySettings = false" />

      <el-dialog v-model="showSettingsDialog" :title="t('app.settingsDialogTitle')" width="420px" :close-on-click-modal="true">
        <div class="flex flex-col gap-3">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {{ t('app.settings.general') }}
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500 min-w-14">{{ t('app.settings.language') }}</span>
            <el-select v-model="draftLanguage" class="flex-1" :placeholder="t('app.settings.language')">
              <el-option v-for="item in languageOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500 min-w-14">{{ t('app.settings.theme') }}</span>
            <el-select v-model="draftTheme" class="flex-1" :placeholder="t('app.settings.theme')">
              <el-option v-for="item in themeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {{ t('app.settings.data') }}
          </div>
          <div class="flex items-center gap-2">
            <el-button class="flex-1" @click="handleExport">{{ t('common.export') }}</el-button>
            <el-button class="flex-1" @click="handleImport">{{ t('common.import') }}</el-button>
          </div>
          <el-button type="danger" plain @click="handleReset">
            {{ t('app.resetDefaults') }}
          </el-button>
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {{ t('app.settings.about') }}
          </div>
          <el-button class="w-full" plain @click="openAboutInfo">
            {{ t('app.about.openButton') }}
          </el-button>
        </div>
        <template #footer>
          <el-button type="primary" @click="handleSaveSettings">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="showAboutDialog"
        :title="t('app.about.dialogTitle')"
        width="400px"
        :close-on-click-modal="true"
        append-to-body
      >
        <div v-if="aboutLoading" class="py-6 text-center text-sm text-gray-400">
          {{ t('app.about.loading') }}
        </div>
        <dl v-else-if="aboutInfo" class="text-sm flex flex-col gap-3">
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-gray-500 shrink-0">{{ t('app.about.productName') }}</dt>
            <dd class="font-medium text-right break-all">{{ aboutInfo.name }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-gray-500 shrink-0">{{ t('app.about.version') }}</dt>
            <dd class="font-mono font-medium text-right">{{ aboutInfo.version }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-gray-500 shrink-0">{{ t('app.about.tauriVersion') }}</dt>
            <dd class="font-mono font-medium text-right break-all">{{ aboutInfo.tauriVersion }}</dd>
          </div>
        </dl>
        <template #footer>
          <el-button type="primary" @click="showAboutDialog = false">{{ t('common.close') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog
        v-model="showCloseConfirmDialog"
        :title="t('app.closeDialog.title')"
        width="420px"
        :close-on-click-modal="false"
        :show-close="false"
      >
        <div class="close-confirm-content flex flex-col gap-4">
          <div class="close-confirm-desc text-sm leading-6 text-gray-600 dark:text-gray-300">
            {{ t('app.closeDialog.desc') }}
          </div>
          <el-radio-group v-model="closeActionDraft" class="close-action-group flex flex-col gap-2">
            <el-radio value="minimize" class="close-action-item !mr-0">{{ t('app.closeDialog.minimize') }}</el-radio>
            <el-radio value="exit" class="close-action-item !mr-0">{{ t('app.closeDialog.exit') }}</el-radio>
          </el-radio-group>
          <div class="close-remember-wrap pt-1">
            <el-checkbox v-model="rememberCloseChoice">{{ t('app.closeDialog.remember') }}</el-checkbox>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <el-button @click="closeCloseConfirmDialog">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="applyCloseAction">{{ t('common.confirm') }}</el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </el-config-provider>
</template>

<style scoped>
.close-confirm-content {
  align-items: center;
}

.close-confirm-desc {
  text-align: center;
}

.close-action-group {
  width: min(100%, 260px);
  align-items: flex-start;
}

.close-action-item {
  margin-left: 0 !important;
}

.close-remember-wrap {
  width: min(100%, 260px);
  display: flex;
  justify-content: flex-start;
}
</style>
