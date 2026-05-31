import { describe, expect, it, beforeEach, vi } from 'vitest'

const INTRO_STORAGE_KEY = 'nrm-desktop-shell-intro-v1'

describe('useShellIntro', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  async function loadComposable() {
    return import('./useShellIntro')
  }

  it('starts in prep phase when intro not finished', async () => {
    const { useShellIntro } = await loadComposable()
    const { introPhase } = useShellIntro()
    expect(introPhase.value).toBe('prep')
  })

  it('starts in idle phase when intro already finished', async () => {
    localStorage.setItem(INTRO_STORAGE_KEY, 'true')
    const { useShellIntro } = await loadComposable()
    const { introPhase } = useShellIntro()
    expect(introPhase.value).toBe('idle')
  })

  it('scheduleIntro is a no-op when already finished', async () => {
    localStorage.setItem(INTRO_STORAGE_KEY, 'true')
    const { useShellIntro } = await loadComposable()
    const { introPhase, scheduleIntro } = useShellIntro()

    scheduleIntro()
    expect(introPhase.value).toBe('idle')
  })

  it('progresses through prep → run → idle and marks finished', async () => {
    const { useShellIntro } = await loadComposable()
    const { introPhase, introFinished, scheduleIntro } = useShellIntro()

    expect(introPhase.value).toBe('prep')
    expect(introFinished.value).toBe(false)

    scheduleIntro()

    // nextTick + requestAnimationFrame × 2 → run (real timers, short wait)
    await new Promise(r => setTimeout(r, 50))
    expect(introPhase.value).toBe('run')

    // setTimeout(720) → idle + finished
    await new Promise(r => setTimeout(r, 750))
    expect(introPhase.value).toBe('idle')
    expect(introFinished.value).toBe(true)
  }, 2000)

  it('does not re-enter scheduleIntro if phase is not prep', async () => {
    const { useShellIntro } = await loadComposable()
    const { introPhase, scheduleIntro } = useShellIntro()

    scheduleIntro()
    await new Promise(r => setTimeout(r, 50))
    // Now in 'run' phase — calling again should be a no-op
    const phaseBefore = introPhase.value
    scheduleIntro()
    expect(introPhase.value).toBe(phaseBefore)
  }, 1000)
})
