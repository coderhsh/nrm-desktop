<script setup lang="ts">
import type { Locale, PageKey } from '../types/site'

const { assetPath, linkTo, primaryNav, siteConfig, t } = useSiteState()

defineProps<{
  currentPage: PageKey
  lang: Locale
}>()

defineEmits<{
  switchLanguage: []
  switchTheme: [event: MouseEvent]
}>()
</script>

<template>
  <header class="nav-shell">
    <div class="nav">
      <NuxtLink class="brand" :to="linkTo('home', lang)" aria-label="nrm desktop">
        <img :src="assetPath(siteConfig.assets.logo)" alt="" />
        <span>
          <strong>nrm desktop</strong>
          <small>registry control</small>
        </span>
      </NuxtLink>

      <nav class="nav-links" aria-label="Primary">
        <NuxtLink
          v-for="link in primaryNav"
          :key="link.page"
          :to="linkTo(link.page, lang)"
          :class="{ active: link.page === currentPage }"
        >
          {{ t(link.label) }}
        </NuxtLink>
      </nav>

      <div class="nav-actions">
        <a class="nav-chip nav-chip-link" :href="siteConfig.repoUrl" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <button class="nav-chip" type="button" @click="$emit('switchLanguage')">
          {{ lang === 'en' ? '中文' : 'EN' }}
        </button>
        <button class="nav-chip nav-chip-icon" type="button" @click="$emit('switchTheme', $event)">
          <span aria-hidden="true">◐</span>
        </button>
      </div>
    </div>
  </header>
</template>
