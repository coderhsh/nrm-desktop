import { describe, expect, it, beforeEach, vi } from 'vitest'

const mockGetName = vi.fn()
const mockGetVersion = vi.fn()

vi.mock('@tauri-apps/api/app', () => ({
  getName: mockGetName,
  getVersion: mockGetVersion,
}))

describe('useAppVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module-level cached refs by re-importing
    vi.resetModules()
  })

  async function load() {
    return import('./useAppVersion')
  }

  it('loads app name and version on first call', async () => {
    mockGetName.mockResolvedValue('nrm-desktop')
    mockGetVersion.mockResolvedValue('1.1.0')

    const { useAppVersion: use } = await load()
    const { appName, appVersion, loadAppVersion } = use()

    expect(appName.value).toBeNull()
    expect(appVersion.value).toBeNull()

    await loadAppVersion()

    expect(appName.value).toBe('nrm-desktop')
    expect(appVersion.value).toBe('1.1.0')
  })

  it('sets refs to null on failure', async () => {
    mockGetName.mockRejectedValue(new Error('not in tauri'))
    mockGetVersion.mockRejectedValue(new Error('not in tauri'))

    const { useAppVersion: use } = await load()
    const { appName, appVersion, loadAppVersion } = use()

    await loadAppVersion()

    expect(appName.value).toBeNull()
    expect(appVersion.value).toBeNull()
  })

  it('skips reload when already loaded and force is false', async () => {
    mockGetName.mockResolvedValue('nrm-desktop')
    mockGetVersion.mockResolvedValue('1.1.0')

    const { useAppVersion: use } = await load()
    const { loadAppVersion } = use()

    await loadAppVersion()
    await loadAppVersion()

    expect(mockGetName).toHaveBeenCalledTimes(1)
    expect(mockGetVersion).toHaveBeenCalledTimes(1)
  })

  it('reloads when force is true', async () => {
    mockGetName.mockResolvedValue('nrm-desktop')
    mockGetVersion.mockResolvedValue('1.1.0')

    const { useAppVersion: use } = await load()
    const { loadAppVersion } = use()

    await loadAppVersion()
    mockGetName.mockResolvedValue('nrm-desktop-v2')
    mockGetVersion.mockResolvedValue('2.0.0')
    await loadAppVersion(true)

    expect(mockGetName).toHaveBeenCalledTimes(2)
  })
})
