<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { useLocalStorage } from '@vueuse/core'
import { useTheme } from '@/composables/useTheme'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY } from '@/composables/useI18n'
import { useAutostart } from '@/composables/useAutostart'
import { useRegistryStore } from '@/stores/registry'
import * as api from '@/api/tauri'
import { useConfigIO } from '@/composables/useConfigIO'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'reset'): void
}>()

const store = useRegistryStore()
const theme = useTheme()
const { t, language } = useI18n()
const {
  autostartEnabled,
  draftAutostartEnabled,
  autostartSupported,
  refreshAutostartState,
  applyAutostartDraft,
} = useAutostart()

const { handleExport, handleImport } = useConfigIO()

const categoryByRegistry = useLocalStorage<Record<string, string>>(
  CATEGORY_BY_REGISTRY_STORAGE_KEY,
  {}
)

const draftLanguage = ref<'zh-CN' | 'en'>('zh-CN')
const draftTheme = ref<'light' | 'dark' | 'auto'>('auto')
const showAboutDialog = ref(false)
const aboutLoading = ref(false)
const aboutInfo = ref<{ name: string; version: string; tauriVersion: string } | null>(null)

const languageOptions = computed(() => [
  { label: t('app.settings.languageZhCn'), value: 'zh-CN' as const },
  { label: t('app.settings.languageEn'), value: 'en' as const },
])

const themeOptions = computed(() => [
  { label: t('app.settings.themeFollowSystem'), value: 'auto' as const },
  { label: t('app.settings.themeLight'), value: 'light' as const },
  { label: t('app.settings.themeDark'), value: 'dark' as const },
])

watch(
  () => props.visible,
  visible => {
    if (!visible) return
    draftLanguage.value = language.value
    draftTheme.value = theme.theme.value
    void refreshAutostartState().then(() => {
      draftAutostartEnabled.value = autostartEnabled.value
    })
  }
)

async function handleSaveSettings() {
  const success = await applyAutostartDraft()
  if (!success) return

  language.value = draftLanguage.value
  theme.setTheme(draftTheme.value)
  void invoke('set_app_language', { lang: draftLanguage.value }).catch(() => {
    ElMessage.error(t('app.settings.trayLanguageUpdateFailed'))
  })
  emit('update:visible', false)
  ElMessage.success(t('app.settings.saveSuccess'))
}

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
    emit('update:visible', false)
    emit('reset')
  } catch {
    // cancelled
  }
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    :title="t('app.settingsDialogTitle')"
    size="360px"
    direction="rtl"
    :destroy-on-close="false"
    class="settings-drawer"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
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
</template>
