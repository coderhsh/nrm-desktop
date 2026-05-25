import { computed, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export type AutoUpdateMode = 'off' | 'notify' | 'download'

export const UPDATE_AUTO_MODE_STORAGE_KEY = 'nrm-desktop-update-auto-mode'

const AUTO_UPDATE_MODES: AutoUpdateMode[] = ['off', 'notify', 'download']

function coerceAutoUpdateMode(value: unknown): AutoUpdateMode {
  if (typeof value === 'string' && AUTO_UPDATE_MODES.includes(value as AutoUpdateMode)) {
    return value as AutoUpdateMode
  }
  return 'notify'
}

export const autoUpdateMode = useLocalStorage<AutoUpdateMode>(
  UPDATE_AUTO_MODE_STORAGE_KEY,
  'notify',
  {
    serializer: {
      read: raw => coerceAutoUpdateMode(raw ? JSON.parse(raw) : null),
      write: value => JSON.stringify(coerceAutoUpdateMode(value)),
    },
  },
)

const draftAutoUpdateMode = ref<AutoUpdateMode>('notify')

export function useAppUpdatePreferences() {
  const isAutoCheckEnabled = computed(() => autoUpdateMode.value !== 'off')

  function syncDraftFromSaved() {
    draftAutoUpdateMode.value = autoUpdateMode.value
  }

  function applyDraft() {
    autoUpdateMode.value = draftAutoUpdateMode.value
  }

  return {
    autoUpdateMode,
    draftAutoUpdateMode,
    isAutoCheckEnabled,
    syncDraftFromSaved,
    applyDraft,
  }
}
