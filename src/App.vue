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
import { useShellIntro } from '@/composables/useShellIntro'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY, coerceAppLanguage } from '@/composables/useI18n'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'

const store = useRegistryStore()
const theme = useTheme()
const { introPhase, scheduleIntro } = useShellIntro()
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
const showCloseConfirmDialog = ref(false)
/** 关于软件信息弹窗 */
const showAboutDialog = ref(false)
const aboutLoading = ref(false)
const aboutInfo = ref<{ name: string; version: string; tauriVersion: string } | null>(null)
/** 当前系统中「登录时启动」是否已启用（与 OS 同步；仅在保存设置后或未改草稿时与草稿一致） */
const autostartEnabled = ref(false)
/** 设置弹窗内的自启动开关草稿，需点击保存才写入系统 */
const draftAutostartEnabled = ref(false)
/** 当前环境是否支持在应用内开关自启动（桌面 Tauri 为 true，浏览器调试等为 false） */
const autostartSupported = ref(true)
const closeBehavior = useLocalStorage<'ask' | 'minimize' | 'exit'>('nrm-desktop-close-behavior', 'ask')
const closeActionDraft = ref<'minimize' | 'exit'>('minimize')
const pendingCloseAction = ref<'minimize' | 'exit' | null>(null)
const rememberCloseChoice = ref(false)
const isClosingByChoice = ref(false)
const isProxyFeatureVisible = false
const draftLanguage = ref<'zh-CN' | 'en'>('zh-CN')
const categoryByRegistry = useLocalStorage<Record<string, string>>(
  CATEGORY_BY_REGISTRY_STORAGE_KEY,
  {}
)
const draftTheme = ref<'light' | 'dark' | 'auto'>('auto')
const languageOptions = computed(() => [
  { label: t('app.settings.languageZhCn'), value: 'zh-CN' as const },
  { label: t('app.settings.languageEn'), value: 'en' as const },
])
const themeOptions = computed(() => [
  { label: t('app.settings.themeFollowSystem'), value: 'auto' as const },
  { label: t('app.settings.themeLight'), value: 'light' as const },
  { label: t('app.settings.themeDark'), value: 'dark' as const },
])
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
    theme.theme.value = theme.isDark.value ? 'light' : 'dark'
    return
  }
  if (theme.theme.value === 'dark') {
    theme.theme.value = 'light'
  } else {
    theme.theme.value = 'dark'
  }
}
let unlistenCloseRequested: null | (() => void) = null
let unlistenRegistryChanged: null | (() => void) = null
let unlistenTrayRestored: null | (() => void) = null
let suppressCloseConfirmUntilUserInteraction = false
let lastTrayRestoreAt = 0

function clearTrayRestoreGuard() {
  if (!suppressCloseConfirmUntilUserInteraction) return
  suppressCloseConfirmUntilUserInteraction = false
}

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

watch(showSettingsDialog, visible => {
  if (!visible) return
  draftLanguage.value = language.value
  draftTheme.value = theme.theme.value
  void refreshAutostartState().then(() => {
    draftAutostartEnabled.value = autostartEnabled.value
  })
})

/**
 * 将语言、主题与自启动（草稿）一并提交；自启动仅在保存时调用系统 API。
 */
async function handleSaveSettings() {
  const nextLanguage = draftLanguage.value

  if (autostartSupported.value) {
    try {
      const { enable, disable, isEnabled } = await import('@tauri-apps/plugin-autostart')
      if (draftAutostartEnabled.value !== autostartEnabled.value) {
        if (draftAutostartEnabled.value) {
          await enable()
        } else {
          await disable()
        }
      }
      autostartEnabled.value = await isEnabled()
    } catch (e) {
      ElMessage.error(t('app.settings.autostartError', { error: String(e) }))
      await refreshAutostartState()
      draftAutostartEnabled.value = autostartEnabled.value
      return
    }
  }

  language.value = draftLanguage.value
  theme.theme.value = draftTheme.value
  void invoke('set_app_language', { lang: nextLanguage }).catch(() => {
    ElMessage.error(t('app.settings.trayLanguageUpdateFailed'))
  })
  showSettingsDialog.value = false
  ElMessage.success(t('app.settings.saveSuccess'))
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

/**
 * 从系统读取当前自启动注册状态；不支持或非 Tauri 时关闭开关并禁用 UI。
 */
async function refreshAutostartState() {
  try {
    const supported = await invoke<boolean>('is_autostart_platform_supported')
    autostartSupported.value = supported
    if (!supported) {
      autostartEnabled.value = false
      return
    }
    const { isEnabled } = await import('@tauri-apps/plugin-autostart')
    autostartEnabled.value = await isEnabled()
  } catch {
    autostartSupported.value = false
    autostartEnabled.value = false
  }
}

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
  unlistenTrayRestored = await listen('window-restored-from-tray', () => {
    // Tray restore can trigger an immediate close-request callback on macOS.
    // Suppress close confirm until first real user interaction.
    suppressCloseConfirmUntilUserInteraction = true
    lastTrayRestoreAt = Date.now()
    showCloseConfirmDialog.value = false
  })

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const appWindow = getCurrentWindow()
  unlistenCloseRequested = await appWindow.onCloseRequested(async event => {
    const sinceRestoreMs = lastTrayRestoreAt > 0 ? Date.now() - lastTrayRestoreAt : null
    if (isClosingByChoice.value) return
    event.preventDefault()
    if (suppressCloseConfirmUntilUserInteraction && sinceRestoreMs !== null && sinceRestoreMs > 800) {
      suppressCloseConfirmUntilUserInteraction = false
    }
    if (suppressCloseConfirmUntilUserInteraction) {
      return
    }

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

  window.addEventListener('pointerdown', clearTrayRestoreGuard, true)
  window.addEventListener('keydown', clearTrayRestoreGuard, true)
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
  if (unlistenTrayRestored) {
    unlistenTrayRestored()
    unlistenTrayRestored = null
  }
  window.removeEventListener('pointerdown', clearTrayRestoreGuard, true)
  window.removeEventListener('keydown', clearTrayRestoreGuard, true)
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
    ElMessage.success(t('app.export.success'))
  } catch (e) {
    ElMessage.error(t('app.export.failed', { error: formatInvokeErrorMessage(t, e) }))
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
    ElMessage.success(t('app.import.success'))
    store.fetchRegistries()
  } catch (e) {
    ElMessage.error(t('app.import.failed', { error: formatInvokeErrorMessage(t, e) }))
  }
}

async function openGithubHome() {
  try {
    await openExternal('https://github.com/coderhsh/nrm-desktop')
  } catch (e) {
    ElMessage.error(
      t('app.closeDialog.githubOpenFailed', { error: formatInvokeErrorMessage(t, e) }),
    )
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
        customClass: 'app-reset-defaults-messagebox',
        confirmButtonClass: 'app-reset-defaults-messagebox__btn-confirm',
        cancelButtonClass: 'app-reset-defaults-messagebox__btn-cancel',
        showClose: false,
        closeOnClickModal: false,
        distinguishCancelAndClose: true,
      },
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
  pendingCloseAction.value = closeActionDraft.value
  showCloseConfirmDialog.value = false
  if (rememberCloseChoice.value) {
    closeBehavior.value = closeActionDraft.value
  }
}

async function handleCloseDialogClosed() {
  const action = pendingCloseAction.value
  pendingCloseAction.value = null
  if (!action) return

  if (action === 'minimize') {
    try {
      await invoke('hide_main_window')
    } catch {
      ElMessage.error(t('app.closeDialog.minimizeFailed'))
    }
    return
  }
  isClosingByChoice.value = true
  await invoke('exit_app')
}
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <div class="app-shell" :class="shellIntroClass">
      <div class="app-shell-body">
        <!-- Sidebar -->
        <aside class="app-sidebar">
          <div class="registry-sidebar-card">
            <RegistryList />
          </div>
        </aside>

        <!-- Main Content -->
        <main class="app-main-area">
          <div class="app-main-stage flex flex-1 flex-col min-h-0">
            <div class="flex-1 flex flex-col min-h-0 overflow-hidden pt-6 pb-6 pr-6 pl-3 gap-4">
              <CurrentSource class="shrink-0" />
              <SpeedTest class="min-h-0 flex-1 flex flex-col overflow-hidden" />
            </div>
          </div>
        </main>
      </div>

      <!-- Status bar: full window width (below sidebar + main) -->
      <div class="app-statusbar">
          <span
            v-if="nodeNpmVersionsLabel"
            class="text-xs text-gray-600 dark:text-zinc-300 shrink-0 truncate max-w-[280px] mr-2"
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

        <el-button text size="small" type="danger" @click="handleReset" :title="t('app.resetDefaults')">
          {{ t('common.reset') }}
        </el-button>
      </div>

      <!-- Proxy Settings Dialog -->
      <ProxySettings v-if="isProxyFeatureVisible" v-model:visible="showProxySettings" @close="showProxySettings = false" />

      <el-drawer
        v-model="showSettingsDialog"
        :title="t('app.settingsDialogTitle')"
        size="360px"
        direction="rtl"
        :destroy-on-close="false"
        class="settings-drawer"
      >
        <div class="settings-panel flex flex-col gap-3">
          <div class="settings-section-title text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {{ t('app.settings.general') }}
          </div>
          <div class="settings-drawer-inline-row flex items-center gap-2">
            <span class="settings-item-label settings-drawer-inline-label text-sm text-gray-500 shrink-0">{{
              t('app.settings.language')
            }}</span>
            <el-select v-model="draftLanguage" class="min-w-0 flex-1" :placeholder="t('app.settings.language')">
              <el-option v-for="item in languageOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
          <div class="settings-drawer-inline-row flex items-center gap-2">
            <span class="settings-item-label settings-drawer-inline-label text-sm text-gray-500 shrink-0">{{
              t('app.settings.theme')
            }}</span>
            <el-select v-model="draftTheme" class="min-w-0 flex-1" :placeholder="t('app.settings.theme')">
              <el-option v-for="item in themeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
          <div
            class="flex items-start justify-between gap-3"
            :class="{ 'opacity-60': !autostartSupported }"
          >
            <div class="flex flex-col gap-0.5 min-w-0 pr-2">
              <span class="settings-item-label text-sm text-gray-500">{{ t('app.settings.autostart') }}</span>
              <span class="settings-note text-xs text-gray-400 leading-snug">{{ t('app.settings.autostartHint') }}</span>
              <span
                v-if="!autostartSupported"
                class="settings-note text-xs text-app-muted leading-snug"
              >
                {{ t('app.settings.autostartUnsupported') }}
              </span>
            </div>
            <el-switch
              v-model="draftAutostartEnabled"
              class="shrink-0"
              :disabled="!autostartSupported"
            />
          </div>
          <div class="settings-section-title text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {{ t('app.settings.data') }}
          </div>
          <div class="settings-actions-grid flex items-center gap-2">
            <el-button class="settings-action-btn flex-1" @click="handleExport">{{ t('common.export') }}</el-button>
            <el-button class="settings-action-btn flex-1" @click="handleImport">{{ t('common.import') }}</el-button>
          </div>
          <el-button class="settings-danger-btn" type="danger" plain @click="handleReset">
            {{ t('app.resetDefaults') }}
          </el-button>
          <div class="settings-section-title text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
            {{ t('app.settings.about') }}
          </div>
          <el-button class="settings-about-btn w-full" plain @click="openAboutInfo">
            {{ t('app.about.openButton') }}
          </el-button>
        </div>
        <template #footer>
          <div class="flex justify-end">
            <el-button type="primary" @click="handleSaveSettings">{{ t('common.save') }}</el-button>
          </div>
        </template>
      </el-drawer>

      <el-dialog
        v-model="showAboutDialog"
        :title="t('app.about.dialogTitle')"
        width="420px"
        class="app-about-dialog category-manage-dialog app-dialog"
        modal-class="category-manage-modal"
        align-center
        append-to-body
        :close-on-click-modal="true"
      >
        <div class="category-manage-content app-about-dialog-inner">
          <div v-if="aboutLoading" class="app-about-loading">
            {{ t('app.about.loading') }}
          </div>
          <dl v-else-if="aboutInfo" class="app-about-dl">
            <div class="app-about-dl__row">
              <dt>{{ t('app.about.productName') }}</dt>
              <dd>{{ aboutInfo.name }}</dd>
            </div>
            <div class="app-about-dl__row">
              <dt>{{ t('app.about.version') }}</dt>
              <dd class="app-about-dl__dd--mono">{{ aboutInfo.version }}</dd>
            </div>
            <div class="app-about-dl__row">
              <dt>{{ t('app.about.tauriVersion') }}</dt>
              <dd class="app-about-dl__dd--mono">{{ aboutInfo.tauriVersion }}</dd>
            </div>
          </dl>
        </div>
        <template #footer>
          <div class="category-manage-dialog-footer">
            <el-button type="primary" @click="showAboutDialog = false">{{ t('common.close') }}</el-button>
          </div>
        </template>
      </el-dialog>

      <el-dialog
        v-model="showCloseConfirmDialog"
        :title="t('app.closeDialog.title')"
        class="close-confirm-dialog"
        width="420px"
        :close-on-click-modal="false"
        :show-close="false"
        :destroy-on-close="true"
        @closed="handleCloseDialogClosed"
      >
        <div class="close-confirm-content flex flex-col gap-3">
          <p class="close-confirm-desc text-sm leading-relaxed text-app-muted m-0">
            {{ t('app.closeDialog.desc') }}
          </p>
          <el-radio-group v-model="closeActionDraft" class="close-action-group flex flex-col gap-2.5">
            <el-radio value="minimize" class="close-action-item">{{ t('app.closeDialog.minimize') }}</el-radio>
            <el-radio value="exit" class="close-action-item">{{ t('app.closeDialog.exit') }}</el-radio>
          </el-radio-group>
          <div class="close-remember-wrap">
            <el-checkbox v-model="rememberCloseChoice">{{ t('app.closeDialog.remember') }}</el-checkbox>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <el-button class="close-confirm-cancel-btn" @click="closeCloseConfirmDialog">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="applyCloseAction">{{ t('common.confirm') }}</el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </el-config-provider>
</template>

<style scoped>
.close-confirm-content {
  align-items: stretch;
  width: 100%;
  text-align: start;
}

.close-confirm-desc {
  text-align: start;
  max-width: 100%;
}

.close-action-group {
  width: 100%;
  align-items: stretch;
}

.close-action-group :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  align-items: flex-start;
  white-space: normal;
}

.close-action-group :deep(.el-radio__label) {
  line-height: 1.45;
  white-space: normal;
  padding-left: 0.5rem;
}

.close-action-item {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.close-remember-wrap {
  width: 100%;
  display: flex;
  justify-content: flex-start;
}

.close-remember-wrap :deep(.el-checkbox) {
  height: auto;
  align-items: flex-start;
  white-space: normal;
}

.close-remember-wrap :deep(.el-checkbox__label) {
  line-height: 1.45;
  white-space: normal;
}

.settings-panel {
  padding: 0.25rem 0.15rem 0.1rem;
}

/* 固定标签列宽，避免「Language / Theme」等长度不一导致右侧下拉左缘不齐 */
.settings-drawer-inline-label {
  width: 7.5rem;
}

.settings-section-title {
  letter-spacing: 0.08em;
}

.settings-item {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0.75rem;
  background: var(--el-fill-color-blank);
}

.settings-item-label {
  font-weight: 500;
}

.settings-note {
  opacity: 0.92;
}

.settings-danger-btn,
.settings-about-btn {
  border-radius: 0.7rem;
}

:global(html.dark) .settings-item {
  border-color: var(--el-border-color);
  background: var(--el-fill-color-blank);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
}

:global(html.dark) .close-confirm-desc {
  color: var(--el-text-color-regular);
}

:global(html.dark) .close-action-item {
  color: var(--el-text-color-regular);
}

:global(html.dark) .close-remember-wrap :deep(.el-checkbox__label) {
  color: var(--app-text-muted);
}

:global(html.dark) .settings-section-title {
  color: var(--app-text-muted) !important;
}

:global(html.dark) .settings-item-label {
  color: var(--el-text-color-primary) !important;
}

:global(html.dark) .settings-note {
  color: var(--app-text-muted) !important;
}

</style>
