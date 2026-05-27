<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { PageKey } from '../lib/site'
import { REPO_URL, primaryNav, t, type Locale } from '../lib/site'

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
      <RouterLink class="brand" to="/" aria-label="nrm desktop">
        <img src="/images/logo.png" alt="" />
        <span>
          <strong>nrm desktop</strong>
          <small>registry control</small>
        </span>
      </RouterLink>

      <nav class="nav-links" aria-label="Primary">
        <RouterLink
          v-for="link in primaryNav"
          :key="link.to"
          :to="link.to"
          :class="{ active: link.page === currentPage }"
        >
          {{ t(link.label) }}
        </RouterLink>
      </nav>

      <div class="nav-actions">
        <a class="nav-chip nav-chip-link" :href="REPO_URL" target="_blank" rel="noreferrer">
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
