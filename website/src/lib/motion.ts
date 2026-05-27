let cleanup: Array<() => void> = []

export const cleanupMotion = () => {
  cleanup.forEach((fn) => fn())
  cleanup = []
}

export const initMotion = () => {
  cleanupMotion()

  const reveals = [...document.querySelectorAll<HTMLElement>('[data-reveal]')]
  if (reveals.length > 0) {
    const revealNow = (element: Element) => {
      element.classList.add('is-visible')
      observer.unobserve(element)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            revealNow(entry.target)
          }
        })
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )

    reveals.forEach((element, index) => {
      if (!element.style.getPropertyValue('--reveal-delay')) {
        element.style.setProperty('--reveal-delay', `${Math.min(index * 45, 360)}ms`)
      }
      observer.observe(element)

      const rect = element.getBoundingClientRect()
      const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0
      if (inView) {
        revealNow(element)
      }
    })

    cleanup.push(() => observer.disconnect())
  }

  const parallax = [...document.querySelectorAll<HTMLElement>('[data-parallax]')]
  if (parallax.length > 0) {
    let frame = 0
    const update = () => {
      frame = 0
      const scrollTop = window.scrollY
      parallax.forEach((element) => {
        const speed = Number(element.dataset.parallax ?? '0.08')
        const shift = scrollTop * speed
        element.style.setProperty('--parallax-shift', `${shift}px`)
      })
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    cleanup.push(() => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    })
  }
}
