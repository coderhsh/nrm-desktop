<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { Locale } from '../types/site'

const { assetPath, currentPage, linkTo, primaryNav, siteConfig, t } = useSiteState()
const route = useRoute()

defineProps<{
  lang: Locale
}>()

defineEmits<{
  switchLanguage: []
  switchTheme: [event: MouseEvent]
}>()

const sentinelRef = useTemplateRef<HTMLDivElement>('sentinel')
let observer: IntersectionObserver | null = null
let lastScrollY = 0
let ticking = false
const isMobileMenuOpen = ref(false)

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
}

watch(() => route.fullPath, closeMobileMenu)

onMounted(() => {
  const sentinel = sentinelRef.value
  const shell = sentinel?.parentElement as HTMLElement | null
  if (!sentinel || !shell) return

  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry) shell.classList.toggle('is-scrolled', !entry.isIntersecting)
    },
    { threshold: 0 },
  )
  observer.observe(sentinel)

  lastScrollY = window.scrollY

  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      const y = window.scrollY
      const delta = y - lastScrollY

      if (delta > 4 && y > 80) {
        shell.classList.add('is-hidden')
      } else if (delta < -4) {
        shell.classList.remove('is-hidden')
      }

      lastScrollY = y
      ticking = false
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <header class="nav-shell" :class="{ 'is-mobile-menu-open': isMobileMenuOpen }">
    <div ref="sentinel" class="nav-scroll-sentinel" />
    <div class="nav-accent-line" />
    <div class="nav">
      <NuxtLink class="brand" :to="linkTo('home', lang)" aria-label="nrm desktop" @click="closeMobileMenu">
        <div class="brand-logo-wrap">
          <img :src="assetPath(siteConfig.assets.logo)" alt="" />
        </div>
        <span>
          <strong>nrm desktop</strong>
          <small>registry control</small>
        </span>
      </NuxtLink>

      <nav class="nav-links" :class="{ 'is-open': isMobileMenuOpen }" aria-label="Primary">
        <NuxtLink
          v-for="link in primaryNav"
          :key="link.page"
          :to="linkTo(link.page, lang)"
          :class="{ active: link.page === currentPage }"
          @click="closeMobileMenu"
        >
          {{ t(link.label) }}
        </NuxtLink>
        <div class="nav-mobile-actions">
          <a class="nav-chip nav-chip-link" :href="siteConfig.repoUrl" target="_blank" rel="noreferrer">
            <svg class="nav-chip-github" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <button class="nav-chip nav-chip-lang" type="button" @click="$emit('switchLanguage')">
            {{ lang === 'en' ? '中文' : 'EN' }}
          </button>
          <button class="nav-chip nav-chip-icon" type="button" :aria-label="t({ en: 'Switch theme', zh: '切换主题' })" @click="$emit('switchTheme', $event)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a10 10 0 010 20" fill="currentColor" />
            </svg>
          </button>
        </div>
      </nav>

      <div class="nav-actions">
        <a class="nav-chip nav-chip-link" :href="siteConfig.repoUrl" target="_blank" rel="noreferrer">
          <svg class="nav-chip-github" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
        <button class="nav-chip nav-chip-lang" type="button" @click="$emit('switchLanguage')">
          {{ lang === 'en' ? '中文' : 'EN' }}
        </button>
        <button class="nav-chip nav-chip-icon" type="button" :aria-label="t({ en: 'Switch theme', zh: '切换主题' })" @click="$emit('switchTheme', $event)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 010 20" fill="currentColor" />
          </svg>
        </button>
        <button
          class="nav-hamburger"
          type="button"
          :aria-expanded="isMobileMenuOpen"
          :aria-label="isMobileMenuOpen ? 'Close menu' : 'Open menu'"
          @click="toggleMobileMenu"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <Transition name="nav-overlay">
        <div
          v-if="isMobileMenuOpen"
          class="nav-mobile-overlay"
          @click="closeMobileMenu"
        />
      </Transition>
    </div>
  </header>
</template>
