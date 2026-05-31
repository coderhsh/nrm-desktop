import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent, type Ref } from 'vue'

let onCompleteCallback: (() => void) | undefined

vi.mock('gsap', () => {
  const timeline = {
    to: vi.fn().mockReturnThis(),
  }
  return {
    gsap: {
      timeline: vi.fn((opts?: { onComplete?: () => void }) => {
        onCompleteCallback = opts?.onComplete
        return timeline
      }),
      context: vi.fn((fn: () => void) => {
        fn()
        return { revert: vi.fn() }
      }),
      set: vi.fn(),
    },
  }
})

import { useAppBlocksEntrance } from './useAppBlocksEntrance'

function createEl(): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-entrance', '')
  return el
}

function createEntranceWrapper(options: { reducedMotion?: boolean; nullRefs?: boolean } = {}) {
  const { reducedMotion = false, nullRefs = false } = options
  return defineComponent({
    setup() {
      const sidebar = ref(nullRefs ? null : createEl()) as Ref<HTMLElement | null>
      const currentSource = ref(nullRefs ? null : createEl()) as Ref<HTMLElement | null>
      const speedTest = ref(nullRefs ? null : createEl()) as Ref<HTMLElement | null>
      const result = useAppBlocksEntrance(sidebar, currentSource, speedTest, reducedMotion)
      return { entranceSettled: result.entranceSettled }
    },
    template: '<div />',
  })
}

describe('useAppBlocksEntrance', () => {
  let matchMediaResult = false

  beforeEach(() => {
    onCompleteCallback = undefined
    matchMediaResult = false
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' ? matchMediaResult : false }) as MediaQueryList,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves entranceSettled when animation completes', async () => {
    const wrapper = mount(createEntranceWrapper(), { attachTo: document.body })
    await flushPromises()

    onCompleteCallback?.()
    await expect(wrapper.vm.entranceSettled).resolves.toBeUndefined()
    wrapper.unmount()
  })

  it('skips animation and resolves immediately when prefers-reduced-motion', async () => {
    matchMediaResult = true
    const wrapper = mount(createEntranceWrapper({ reducedMotion: true }), { attachTo: document.body })
    await flushPromises()

    await expect(wrapper.vm.entranceSettled).resolves.toBeUndefined()
    wrapper.unmount()
  })

  it('resolves immediately when refs are null', async () => {
    const wrapper = mount(createEntranceWrapper({ nullRefs: true }), { attachTo: document.body })
    await flushPromises()

    await expect(wrapper.vm.entranceSettled).resolves.toBeUndefined()
    wrapper.unmount()
  })
})
