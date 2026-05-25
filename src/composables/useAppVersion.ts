import { ref } from 'vue'

const appName = ref<string | null>(null)
const appVersion = ref<string | null>(null)
let loadPromise: Promise<void> | null = null

export function useAppVersion() {
  async function loadAppVersion(force = false) {
    if (appName.value && appVersion.value && !force) return
    if (loadPromise && !force) {
      await loadPromise
      return
    }

    loadPromise = (async () => {
      try {
        const { getName, getVersion } = await import('@tauri-apps/api/app')
        const [name, version] = await Promise.all([getName(), getVersion()])
        appName.value = name
        appVersion.value = version
      } catch {
        appName.value = null
        appVersion.value = null
      }
    })()

    await loadPromise
  }

  return { appName, appVersion, loadAppVersion }
}
