import { describe, expect, it, beforeEach, vi } from 'vitest'

const mockInvoke = vi.fn()
const mockIsEnabled = vi.fn()
const mockEnable = vi.fn()
const mockDisable = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: mockIsEnabled,
  enable: mockEnable,
  disable: mockDisable,
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

vi.stubGlobal('ElMessage', {
  error: vi.fn(),
})

describe('useAutostart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function load() {
    return import('./useAutostart')
  }

  it('refreshAutostartState sets supported and enabled on success', async () => {
    mockInvoke.mockResolvedValue(true)
    mockIsEnabled.mockResolvedValue(true)

    const { useAutostart: use } = await load()
    const { autostartSupported, autostartEnabled, refreshAutostartState } = use()

    await refreshAutostartState()

    expect(autostartSupported.value).toBe(true)
    expect(autostartEnabled.value).toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith('is_autostart_platform_supported')
  })

  it('refreshAutostartState sets unsupported when platform check returns false', async () => {
    mockInvoke.mockResolvedValue(false)

    const { useAutostart: use } = await load()
    const { autostartSupported, autostartEnabled, refreshAutostartState } = use()

    await refreshAutostartState()

    expect(autostartSupported.value).toBe(false)
    expect(autostartEnabled.value).toBe(false)
  })

  it('refreshAutostartState handles invoke error', async () => {
    mockInvoke.mockRejectedValue(new Error('fail'))

    const { useAutostart: use } = await load()
    const { autostartSupported, autostartEnabled, refreshAutostartState } = use()

    await refreshAutostartState()

    expect(autostartSupported.value).toBe(false)
    expect(autostartEnabled.value).toBe(false)
  })

  it('applyAutostartDraft enables when draft is true', async () => {
    mockInvoke.mockResolvedValue(true)
    mockIsEnabled.mockResolvedValue(true)
    mockEnable.mockResolvedValue(undefined)

    const { useAutostart: use } = await load()
    const { autostartEnabled, draftAutostartEnabled, refreshAutostartState, applyAutostartDraft } = use()

    await refreshAutostartState()
    autostartEnabled.value = false
    draftAutostartEnabled.value = true

    const result = await applyAutostartDraft()

    expect(result).toBe(true)
    expect(mockEnable).toHaveBeenCalled()
  })

  it('applyAutostartDraft disables when draft is false', async () => {
    mockInvoke.mockResolvedValue(true)
    mockIsEnabled.mockResolvedValue(false)
    mockDisable.mockResolvedValue(undefined)

    const { useAutostart: use } = await load()
    const { autostartEnabled, draftAutostartEnabled, refreshAutostartState, applyAutostartDraft } = use()

    await refreshAutostartState()
    autostartEnabled.value = true
    draftAutostartEnabled.value = false

    const result = await applyAutostartDraft()

    expect(result).toBe(true)
    expect(mockDisable).toHaveBeenCalled()
  })

  it('applyAutostartDraft returns true without calling plugin when unsupported', async () => {
    mockInvoke.mockResolvedValue(false)

    const { useAutostart: use } = await load()
    const { draftAutostartEnabled, refreshAutostartState, applyAutostartDraft } = use()

    await refreshAutostartState()
    draftAutostartEnabled.value = true

    const result = await applyAutostartDraft()

    expect(result).toBe(true)
    expect(mockEnable).not.toHaveBeenCalled()
    expect(mockDisable).not.toHaveBeenCalled()
  })

  it('applyAutostartDraft shows error and returns false on failure', async () => {
    mockInvoke.mockResolvedValue(true)
    // First isEnabled call (in refreshAutostartState) succeeds
    mockIsEnabled.mockResolvedValueOnce(true)

    const { useAutostart: use } = await load()
    const { draftAutostartEnabled, refreshAutostartState, applyAutostartDraft } = use()

    await refreshAutostartState()
    draftAutostartEnabled.value = true

    // Second isEnabled call (in applyAutostartDraft) fails
    mockIsEnabled.mockRejectedValue(new Error('plugin error'))

    const result = await applyAutostartDraft()

    expect(result).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()
  })
})
