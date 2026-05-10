import { ElMessage } from 'element-plus'
import * as api from '@/api/tauri'
import { useRegistryStore } from '@/stores/registry'
import { useI18n } from '@/composables/useI18n'
import { formatInvokeErrorMessage } from '@/utils/invoke-error-i18n'

export function useConfigIO() {
  const { t } = useI18n()
  const store = useRegistryStore()

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

  return { handleExport, handleImport }
}
