<script setup lang="ts">
import ArchitecturePage from '../../components/pages/ArchitecturePage.vue'

definePageMeta({
  pageKey: 'architecture',
  validate: (route) => ['en', 'zh'].includes(String(route.params.locale)),
})

usePageSeo('architecture')
</script>

<template>
  <ArchitecturePage />
</template>
