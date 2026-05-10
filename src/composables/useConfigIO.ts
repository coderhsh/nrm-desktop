import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/tauri'
import { useRegistryStore } from '@/stores/registry'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY } from '@/composables/useI18n'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'
import { useLocalStorage } from '@vueuse/core'

export function useConfigIO() {
  const { t, language } = useI18n()
  const store = useRegistryStore()
  const categoryByRegistry = useLocalStorage<Record<string, string>>(CATEGORY_BY_REGISTRY_STORAGE_KEY, {})

  async function handleExport() {
    try {
      const data = await api.exportConfig()
      const json = JSON.stringify(data, null, 2)
      const { save } = await import('@tauri-apps/plugin-dialog')
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
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      })
      if (!path) return
      const json = await api.readTextFile(path as string)
      await api.importConfig(json)
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
      categoryByRegistry.value = {}
      await store.fetchRegistries()
      ElMessage.success(t('app.resetConfirm.success'))
      return true
    } catch {
      return false
    }
  }

  return { handleExport, handleImport, handleResetDefaults }
}
