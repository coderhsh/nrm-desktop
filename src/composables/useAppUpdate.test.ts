import { beforeEach, describe, expect, it, vi } from 'vitest'

const UPDATE_DISMISSED_VERSION_STORAGE_KEY = 'nrm-desktop-update-dismissed-version'

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

function createFakeUpdate(version = '1.2.3') {
  return {
    currentVersion: '1.0.1',
    version,
    date: '2026-05-22T00:00:00.000Z',
    body: 'Release notes',
    download: vi.fn(async onEvent => {
      onEvent?.({ event: 'Started', data: { contentLength: 10 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 4 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 6 } })
      onEvent?.({ event: 'Finished' })
    }),
    install: vi.fn(async () => undefined),
  }
}

async function loadComposable() {
  return import('./useAppUpdate')
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  mocks.check.mockReset()
  mocks.invoke.mockReset()
  mocks.isTauri.mockReset()
  mocks.isTauri.mockReturnValue(true)
})

describe('useAppUpdate', () => {
  it('opens the update dialog when a manual check finds a release', async () => {
    const update = createFakeUpdate()
    mocks.check.mockResolvedValue(update)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })

    expect(appUpdate.updateInfo.value).toBe(update)
    expect(appUpdate.dialogVisible.value).toBe(true)
    expect(appUpdate.showIndicator.value).toBe(true)
  })

  it('keeps a dismissed version quiet during silent startup checks', async () => {
    const update = createFakeUpdate('2.0.0')
    localStorage.setItem(UPDATE_DISMISSED_VERSION_STORAGE_KEY, '2.0.0')
    mocks.check.mockResolvedValue(update)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: true, openDialog: true })

    expect(appUpdate.dialogVisible.value).toBe(false)
    expect(appUpdate.showIndicator.value).toBe(false)

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })

    expect(appUpdate.dialogVisible.value).toBe(true)
  })

  it('downloads, installs, and restarts through the Tauri command', async () => {
    const update = createFakeUpdate()
    mocks.check.mockResolvedValue(update)
    mocks.invoke.mockResolvedValue(undefined)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })
    await appUpdate.downloadUpdate()
    await appUpdate.installAndRestart()

    expect(appUpdate.downloaded.value).toBe(true)
    expect(appUpdate.downloadProgress.value).toBe(100)
    expect(update.install).toHaveBeenCalledOnce()
    expect(mocks.invoke).toHaveBeenCalledWith('restart_app')
  })

  it('reports updater unavailability outside packaged Tauri runtime', async () => {
    mocks.isTauri.mockReturnValue(false)
    const { isUpdateUnavailableError, useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await expect(appUpdate.checkForUpdate({ force: true, silent: false })).rejects.toSatisfy(
      isUpdateUnavailableError,
    )
    await expect(appUpdate.checkForUpdate({ force: true, silent: true })).resolves.toBeNull()
  })

  it('clears update state when no release is available', async () => {
    mocks.check.mockResolvedValue(null)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    const result = await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })

    expect(result).toBeNull()
    expect(appUpdate.updateInfo.value).toBeNull()
    expect(appUpdate.hasUpdate.value).toBe(false)
    expect(appUpdate.dialogVisible.value).toBe(false)
    expect(appUpdate.showIndicator.value).toBe(false)
  })

  it('propagates install failures from the updater plugin', async () => {
    const update = createFakeUpdate()
    update.install.mockRejectedValue(new Error('install failed'))
    mocks.check.mockResolvedValue(update)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })
    await appUpdate.downloadUpdate()

    await expect(appUpdate.installAndRestart()).rejects.toThrow('install failed')
    expect(mocks.invoke).not.toHaveBeenCalledWith('restart_app')
  })

  it('propagates manual check failures from the updater plugin', async () => {
    mocks.check.mockRejectedValue(new Error('network unavailable'))
    const { formatUpdateError, useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await expect(
      appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true }),
    ).rejects.toThrow('network unavailable')
    expect(formatUpdateError(new Error('network unavailable'))).toBe('network unavailable')
    expect(appUpdate.updateInfo.value).toBeNull()
  })

  it('preserves downloaded state when rechecking the same version', async () => {
    const update = createFakeUpdate('2.0.0')
    mocks.check.mockResolvedValue(update)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })
    await appUpdate.downloadUpdate()
    await appUpdate.closeUpdateDialog()

    expect(appUpdate.downloaded.value).toBe(true)

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: false })

    expect(appUpdate.downloaded.value).toBe(true)
    expect(appUpdate.showIndicator.value).toBe(true)
  })

  it('clears downloaded state when a different version is available', async () => {
    const firstUpdate = createFakeUpdate('2.0.0')
    const secondUpdate = createFakeUpdate('2.1.0')
    mocks.check.mockResolvedValueOnce(firstUpdate).mockResolvedValueOnce(secondUpdate)
    const { useAppUpdate } = await loadComposable()
    const appUpdate = useAppUpdate()

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: true })
    await appUpdate.downloadUpdate()
    expect(appUpdate.downloaded.value).toBe(true)

    await appUpdate.checkForUpdate({ force: true, silent: false, openDialog: false })

    expect(appUpdate.downloaded.value).toBe(false)
    expect(appUpdate.updateInfo.value).toBe(secondUpdate)
  })

  it('maps missing updater manifest errors to a clearer message', async () => {
    const { formatUpdateError } = await loadComposable()

    expect(formatUpdateError(new Error('Could not fetch a valid release JSON from the remote')))
      .toContain('latest.json')
  })
})
