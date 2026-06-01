<script setup lang="ts">
import HomePage from '../../components/pages/HomePage.vue'

definePageMeta({
  pageKey: 'home',
  validate: (route) => ['en', 'zh'].includes(String(route.params.locale)),
})

usePageSeo('home')
</script>

<template>
  <HomePage />
</template>
