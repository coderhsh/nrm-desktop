import { describe, expect, it, beforeEach, vi } from 'vitest'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => vi.fn()),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async () => vi.fn()),
  }),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.stubGlobal('ElMessage', {
  error: vi.fn(),
})

describe('useCloseBehavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.resetModules()
  })

  async function load() {
    return import('./useCloseBehavior')
  }

  it('defaults closeBehavior to ask', async () => {
    const { useCloseBehavior: use } = await load()
    const { closeBehavior } = use()
    expect(closeBehavior.value).toBe('ask')
  })

  it('applyCloseAction sets pendingCloseAction and closes dialog', async () => {
    const { useCloseBehavior: use } = await load()
    const { showCloseConfirmDialog, pendingCloseAction, applyCloseAction } = use()

    showCloseConfirmDialog.value = true
    await applyCloseAction('minimize')

    expect(pendingCloseAction.value).toBe('minimize')
    expect(showCloseConfirmDialog.value).toBe(false)
  })

  it('applyCloseAction persists choice when rememberCloseChoice is true', async () => {
    const { useCloseBehavior: use } = await load()
    const { closeBehavior, rememberCloseChoice, applyCloseAction } = use()

    rememberCloseChoice.value = true
    await applyCloseAction('exit')

    expect(closeBehavior.value).toBe('exit')
  })

  it('handleCloseDialogClosed calls hide_main_window for minimize', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const { useCloseBehavior: use } = await load()
    const { pendingCloseAction, handleCloseDialogClosed } = use()

    pendingCloseAction.value = 'minimize'
    await handleCloseDialogClosed()

    expect(mockInvoke).toHaveBeenCalledWith('hide_main_window')
  })

  it('handleCloseDialogClosed calls exit_app for exit', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const { useCloseBehavior: use } = await load()
    const { isClosingByChoice, pendingCloseAction, handleCloseDialogClosed } = use()

    pendingCloseAction.value = 'exit'
    await handleCloseDialogClosed()

    expect(isClosingByChoice.value).toBe(true)
    expect(mockInvoke).toHaveBeenCalledWith('exit_app')
  })

  it('handleCloseDialogClosed does nothing when no pending action', async () => {
    const { useCloseBehavior: use } = await load()
    const { pendingCloseAction, handleCloseDialogClosed } = use()

    pendingCloseAction.value = null
    await handleCloseDialogClosed()

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('handleCloseDialogClosed shows error when minimize fails', async () => {
    mockInvoke.mockRejectedValue(new Error('fail'))
    const { useCloseBehavior: use } = await load()
    const { pendingCloseAction, handleCloseDialogClosed } = use()

    pendingCloseAction.value = 'minimize'
    await handleCloseDialogClosed()

    expect(ElMessage.error).toHaveBeenCalledWith('app.closeDialog.minimizeFailed')
  })

  it('initCloseHandler and cleanup manage event listeners', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { useCloseBehavior: use } = await load()
    const { initCloseHandler, cleanup } = use()

    await initCloseHandler()

    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)

    cleanup()

    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
