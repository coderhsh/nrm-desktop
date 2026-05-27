<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import SiteNav from './components/SiteNav.vue'
import SiteFooter from './components/SiteFooter.vue'
import { cleanupMotion, initMotion } from './lib/motion'
import { useSiteState, type PageKey } from './lib/site'

const route = useRoute()
const { applyMeta, lang, switchLanguage, switchTheme } = useSiteState()
let refreshTimer = 0

const currentPage = computed<PageKey>(() => {
  return (route.meta.page as PageKey | undefined) ?? 'home'
})

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
    applyMeta(currentPage.value)
    await refreshMotion()
  },
)

watch(lang, () => {
  applyMeta(currentPage.value)
})

onMounted(async () => {
  applyMeta(currentPage.value)
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
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
