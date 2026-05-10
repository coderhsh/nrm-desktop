import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/composables/useI18n'

export function useAutostart() {
  const { t } = useI18n()
  const autostartEnabled = ref(false)
  const draftAutostartEnabled = ref(false)
  const autostartSupported = ref(true)

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

  async function applyAutostartDraft(): Promise<boolean> {
    if (!autostartSupported.value) return true

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
      return true
    } catch (e) {
      ElMessage.error(t('app.settings.autostartError', { error: String(e) }))
      await refreshAutostartState()
      draftAutostartEnabled.value = autostartEnabled.value
      return false
    }
  }

  return {
    autostartEnabled,
    draftAutostartEnabled,
    autostartSupported,
    refreshAutostartState,
    applyAutostartDraft,
  }
}
