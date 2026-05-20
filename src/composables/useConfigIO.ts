import { getVersion } from '@tauri-apps/api/app'
import * as api from '@/api/tauri'
import { useRegistryStore } from '@/stores/registry'
import {
  useI18n,
  CATEGORY_BY_REGISTRY_STORAGE_KEY,
  REGISTRY_ORDER_BY_CATEGORY_STORAGE_KEY,
} from '@/composables/useI18n'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'
import { buildConfigExport, parseConfigImport } from '@/utils/config-export'
import { useLocalStorage } from '@vueuse/core'

const CATEGORY_LABELS_STORAGE_KEY = 'nrm-desktop-category-labels'

export function useConfigIO() {
  const { t, language } = useI18n()
  const store = useRegistryStore()
  const categoryByRegistry = useLocalStorage<Record<string, string>>(CATEGORY_BY_REGISTRY_STORAGE_KEY, {})
  const categoryLabels = useLocalStorage<string[]>(CATEGORY_LABELS_STORAGE_KEY, [])
  const registryOrderByCategory = useLocalStorage<Record<string, string[]>>(
    REGISTRY_ORDER_BY_CATEGORY_STORAGE_KEY,
    {},
  )

  async function handleExport() {
    try {
      await store.fetchRegistries()
      const appVersion = await getVersion()
      const payload = buildConfigExport({
        appVersion,
        language: language.value,
        registries: store.registries,
        categoryLabels: categoryLabels.value,
        categoryByRegistry: categoryByRegistry.value,
        registryOrderByCategory: registryOrderByCategory.value,
        uncategorizedLabel: t('registryList.uncategorized'),
      })
      const json = JSON.stringify(payload, null, 2)
      const { save } = await import('@tauri-apps/plugin-dialog')
      const path = await save({
        defaultPath: 'nrm-config.json',
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
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      })
      if (!path) return
      const json = await api.readTextFile(path as string)
      const parsed = parseConfigImport(json, t('registryList.uncategorized'))
      await api.importRegistries(parsed.registries)
      categoryLabels.value = [...parsed.categories.categoryLabels]
      categoryByRegistry.value = { ...parsed.categories.categoryByRegistry }
      registryOrderByCategory.value = { ...parsed.categories.registryOrderByCategory }
      await store.fetchRegistries()
      ElMessage.success(t('app.import.success'))
    } catch (e) {
      ElMessage.error(t('app.import.failed', { error: formatInvokeErrorMessage(t, e) }))
    }
  }

  async function handleResetDefaults(): Promise<boolean> {
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
      }
      categoryLabels.value = []
      categoryByRegistry.value = {}
      registryOrderByCategory.value = {}
      await store.fetchRegistries()
      ElMessage.success(t('app.resetConfirm.success'))
      return true
    } catch {
      return false
    }
  }

  return { handleExport, handleImport, handleResetDefaults }
}
