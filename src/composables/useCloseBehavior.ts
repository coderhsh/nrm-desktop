import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from '@/composables/useI18n'

export function useCloseBehavior() {
  const { t } = useI18n()
  const closeBehavior = useLocalStorage<'ask' | 'minimize' | 'exit'>('nrm-desktop-close-behavior', 'ask')
  const showCloseConfirmDialog = ref(false)
  const closeActionDraft = ref<'minimize' | 'exit'>('minimize')
  const pendingCloseAction = ref<'minimize' | 'exit' | null>(null)
  const rememberCloseChoice = ref(false)
  const isClosingByChoice = ref(false)

  let unlistenCloseRequested: null | (() => void) = null
  let unlistenTrayRestored: null | (() => void) = null
  let suppressCloseConfirmUntilUserInteraction = false
  let lastTrayRestoreAt = 0

  function clearTrayRestoreGuard() {
    if (!suppressCloseConfirmUntilUserInteraction) return
    suppressCloseConfirmUntilUserInteraction = false
  }

  async function applyCloseAction(action: 'minimize' | 'exit') {
    pendingCloseAction.value = action
    showCloseConfirmDialog.value = false
    if (rememberCloseChoice.value) {
      closeBehavior.value = action
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

  async function initCloseHandler() {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenTrayRestored = await listen('window-restored-from-tray', () => {
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
  }

  function cleanup() {
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
  }

  return {
    closeBehavior,
    showCloseConfirmDialog,
    closeActionDraft,
    pendingCloseAction,
    rememberCloseChoice,
    isClosingByChoice,
    applyCloseAction,
    handleCloseDialogClosed,
    initCloseHandler,
    cleanup,
  }
}
