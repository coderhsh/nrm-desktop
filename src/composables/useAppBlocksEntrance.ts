import { onMounted, onUnmounted, nextTick, type Ref, type InjectionKey } from 'vue'
import { gsap } from 'gsap'

/** 供 SpeedTest 等子组件在入场结束后再开始重逻辑（如全量测速） */
export const appEntranceSettledKey: InjectionKey<Promise<void>> = Symbol('appEntranceSettled')

/** 与 src/styles/app-shell.css 中 .app-entrance-pane[data-entrance] 初始位姿保持一致 */
const ENTRANCE_DURATION = 0.5
const ENTRANCE_EASE = 'power3.out' as const
const TO_SETTLED = { x: 0, y: 0, scale: 1, autoAlpha: 1 }

function releaseEntranceAttrs(...els: (HTMLElement | null | undefined)[]) {
  for (const el of els) {
    if (!el) continue
    if (el.hasAttribute('data-entrance')) {
      el.removeAttribute('data-entrance')
      gsap.set(el, { clearProps: 'transform,opacity,visibility' })
    }
  }
}

/**
 * 三大区域从外侧向中间聚拢：首帧由 data-entrance + CSS 固定在外侧且透明，再 to 收拢，避免刷新先亮终态再抽一下。
 * `entranceSettled` 在入场结束（或无需入场）后 resolve，供测速等逻辑延后执行。
 */
export function useAppBlocksEntrance(sidebar: Ref<HTMLElement | null>, currentSource: Ref<HTMLElement | null>, speedTest: Ref<HTMLElement | null>, introAlreadyFinishedAtBoot: boolean): { entranceSettled: Promise<void> } {
  let resolveEntrance!: () => void
  const entranceSettled = new Promise<void>(resolve => {
    resolveEntrance = resolve
  })

  let ctx: gsap.Context | null = null

  onMounted(() => {
    void nextTick(() => {
      if (typeof window === 'undefined') {
        resolveEntrance()
        return
      }

      const side = sidebar.value
      const current = currentSource.value
      const speed = speedTest.value
      if (!side || !current || !speed) {
        resolveEntrance()
        return
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        releaseEntranceAttrs(side, current, speed)
        resolveEntrance()
        return
      }

      const startAt = introAlreadyFinishedAtBoot ? 0.06 : 0.62

      ctx = gsap.context(() => {
        const targets = [side, current, speed] as const
        const tl = gsap.timeline({
          onComplete: () => {
            releaseEntranceAttrs(...targets)
            resolveEntrance()
          },
        })

        tl.to(side, { ...TO_SETTLED, duration: ENTRANCE_DURATION, ease: ENTRANCE_EASE }, startAt)
        tl.to(current, { ...TO_SETTLED, duration: ENTRANCE_DURATION, ease: ENTRANCE_EASE }, startAt + 0.02)
        tl.to(speed, { ...TO_SETTLED, duration: ENTRANCE_DURATION, ease: ENTRANCE_EASE }, startAt + 0.04)
      })
    })
  })

  onUnmounted(() => {
    ctx?.revert()
    ctx = null
    releaseEntranceAttrs(sidebar.value, currentSource.value, speedTest.value)
    resolveEntrance()
  })

  return { entranceSettled }
}
