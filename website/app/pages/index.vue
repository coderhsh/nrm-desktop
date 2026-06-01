<script setup lang="ts">
import { onMounted } from 'vue'

const { linkTo, siteConfig } = useSiteState()
const redirectScript = `
(() => {
  const stored = localStorage.getItem('nrm-desktop.website.lang')
  const locale = stored === 'zh' || (!stored && navigator.language.toLowerCase().startsWith('zh')) ? 'zh' : 'en'
  location.replace('${siteConfig.baseUrl}' + locale + '/')
})()
`

useSeoMeta({
  title: siteConfig.pageMeta.home.title[siteConfig.defaultLocale],
  description: siteConfig.pageMeta.home.description[siteConfig.defaultLocale],
})

useHead({
  script: [
    {
      innerHTML: redirectScript,
    },
  ],
})

onMounted(() => {
  void navigateTo(linkTo('home', getPreferredLocale()), { replace: true })
})
</script>

<template>
  <section class="page-hero">
    <div class="section-kicker" data-reveal>
      <span>§00</span>
      <span>nrm desktop</span>
    </div>
    <h1 data-reveal>nrm desktop</h1>
    <p data-reveal>
      Redirecting to your language...
    </p>
  </section>
</template>
