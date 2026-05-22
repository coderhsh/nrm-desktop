import { computed, ref, shallowRef } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { isTauri } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { restartApp } from '@/api/tauri'

export const UPDATE_LAST_CHECK_STORAGE_KEY = 'nrm-desktop-update-last-check-at'
export const UPDATE_DISMISSED_VERSION_STORAGE_KEY = 'nrm-desktop-update-dismissed-version'

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

const updateInfo = shallowRef<Update | null>(null)
const checking = ref(false)
const downloading = ref(false)
const installing = ref(false)
const downloaded = ref(false)
const dialogVisible = ref(false)
const downloadProgress = ref<number | null>(null)
const downloadedBytes = ref(0)
const downloadTotalBytes = ref<number | null>(null)
const lastCheckAt = useLocalStorage<number>(UPDATE_LAST_CHECK_STORAGE_KEY, 0)
const dismissedVersion = useLocalStorage<string>(UPDATE_DISMISSED_VERSION_STORAGE_KEY, '')

export class AppUpdateUnavailableError extends Error {
  constructor() {
    super('Updater is only available in packaged Tauri builds')
    this.name = 'AppUpdateUnavailableError'
  }
}

interface CheckForUpdateOptions {
  silent?: boolean
  force?: boolean
  openDialog?: boolean
}

function isPackagedTauriRuntime(): boolean {
  if (!isTauri()) return false
  return !import.meta.env.DEV || import.meta.env.MODE === 'test'
}

function shouldSkipAutoCheck(force: boolean): boolean {
  if (force) return false
  return Date.now() - lastCheckAt.value < AUTO_CHECK_INTERVAL_MS
}

function resetDownloadState() {
  downloading.value = false
  installing.value = false
  downloaded.value = false
  downloadProgress.value = null
  downloadedBytes.value = 0
  downloadTotalBytes.value = null
}

function updateDownloadProgress(event: DownloadEvent) {
  if (event.event === 'Started') {
    downloadedBytes.value = 0
    downloadTotalBytes.value = event.data.contentLength ?? null
    downloadProgress.value = downloadTotalBytes.value ? 0 : null
    return
  }

  if (event.event === 'Progress') {
    downloadedBytes.value += event.data.chunkLength
    if (downloadTotalBytes.value && downloadTotalBytes.value > 0) {
      downloadProgress.value = Math.min(
        100,
        Math.floor((downloadedBytes.value / downloadTotalBytes.value) * 100),
      )
    }
    return
  }

  downloadProgress.value = 100
}

async function checkForUpdate(options: CheckForUpdateOptions = {}): Promise<Update | null> {
  const { silent = false, force = false, openDialog = true } = options

  if (!isPackagedTauriRuntime()) {
    if (silent) return null
    throw new AppUpdateUnavailableError()
  }

  if (shouldSkipAutoCheck(force)) {
    return updateInfo.value
  }

  if (checking.value) {
    return updateInfo.value
  }

  checking.value = true
  try {
    const previousVersion = updateInfo.value?.version
    const wasDownloaded = downloaded.value
    const update = await check()
    lastCheckAt.value = Date.now()
    updateInfo.value = update
    if (!(update && wasDownloaded && update.version === previousVersion)) {
      resetDownloadState()
    }

    if (update && openDialog && (!silent || dismissedVersion.value !== update.version)) {
      dialogVisible.value = true
    }

    return update
  } finally {
    checking.value = false
  }
}

async function downloadUpdate(): Promise<void> {
  if (!updateInfo.value || downloading.value) return

  downloading.value = true
  downloaded.value = false
  downloadProgress.value = 0
  downloadedBytes.value = 0
  downloadTotalBytes.value = null

  try {
    await updateInfo.value.download(updateDownloadProgress)
    downloaded.value = true
    downloadProgress.value = 100
    dialogVisible.value = true
  } finally {
    downloading.value = false
  }
}

async function installAndRestart(): Promise<void> {
  if (!updateInfo.value || installing.value) return

  installing.value = true
  try {
    await updateInfo.value.install()
    await restartApp()
  } finally {
    installing.value = false
  }
}

function dismissCurrentUpdate() {
  if (updateInfo.value?.version) {
    dismissedVersion.value = updateInfo.value.version
  }
  dialogVisible.value = false
}

function closeUpdateDialog() {
  dialogVisible.value = false
}

function openUpdateDialog() {
  if (updateInfo.value) {
    dialogVisible.value = true
  }
}

export function isUpdateUnavailableError(error: unknown): error is AppUpdateUnavailableError {
  return error instanceof AppUpdateUnavailableError
}

export function formatUpdateError(error: unknown): string {
  const message = error instanceof Error && error.message
    ? error.message
    : String(error)

  if (/could not fetch a valid release json/i.test(message)) {
    return '无法获取更新清单（latest.json）。请先完成一次非 Draft 的 Release Installers 发布，并确认 GitHub 上存在 updater Release。'
  }

  return message
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function useAppUpdate() {
  const hasUpdate = computed(() => updateInfo.value !== null)
  const isDismissedUpdate = computed(
    () => !!updateInfo.value?.version && dismissedVersion.value === updateInfo.value.version,
  )
  const showIndicator = computed(() => hasUpdate.value && !isDismissedUpdate.value)
  const downloadStatusText = computed(() => {
    const total = downloadTotalBytes.value
    if (!total) return formatBytes(downloadedBytes.value)
    return `${formatBytes(downloadedBytes.value)} / ${formatBytes(total)}`
  })

  return {
    updateInfo,
    checking,
    downloading,
    installing,
    downloaded,
    dialogVisible,
    downloadProgress,
    downloadedBytes,
    downloadTotalBytes,
    downloadStatusText,
    hasUpdate,
    showIndicator,
    checkForUpdate,
    downloadUpdate,
    installAndRestart,
    dismissCurrentUpdate,
    closeUpdateDialog,
    openUpdateDialog,
  }
}
