<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import SiteFooter from './components/SiteFooter.vue'
import SiteNav from './components/SiteNav.vue'
import { cleanupMotion, initMotion } from './lib/motion'

const route = useRoute()
const { currentPage, initClientState, lang, switchLanguage, switchTheme } = useSiteState()
let refreshTimer = 0

useSiteHead()

const refreshMotion = async () => {
  await nextTick()
  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
  }
  refreshTimer = window.setTimeout(() => {
    cleanupMotion()
    initMotion()
    refreshTimer = 0
  }, 80)
}

watch(
  () => route.fullPath,
  async () => {
    if (import.meta.client) {
      await refreshMotion()
    }
  },
)

onMounted(async () => {
  initClientState()
  await refreshMotion()
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
  }
  cleanupMotion()
})
</script>

<template>
  <div class="site-shell">
    <SiteNav
      :current-page="currentPage"
      :lang="lang"
      @switch-language="switchLanguage"
      @switch-theme="switchTheme"
    />
    <main class="main-shell">
      <NuxtPage />
    </main>
    <SiteFooter />
  </div>
</template>
