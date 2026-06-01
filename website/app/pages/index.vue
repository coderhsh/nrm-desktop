<script setup lang="ts">
import { onMounted } from 'vue'

const { linkTo, siteConfig } = useSiteState()

useSeoMeta({
  title: siteConfig.pageMeta.home.title[siteConfig.defaultLocale],
  description: siteConfig.pageMeta.home.description[siteConfig.defaultLocale],
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
      Choose a language to open the static website.
    </p>
    <div class="hero-actions" data-reveal>
      <NuxtLink class="button primary" :to="linkTo('home', 'en')">English</NuxtLink>
      <NuxtLink class="button secondary" :to="linkTo('home', 'zh')">中文</NuxtLink>
    </div>
  </section>
</template>
