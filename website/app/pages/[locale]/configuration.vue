<script setup lang="ts">
import ConfigurationPage from '../../components/pages/ConfigurationPage.vue'

definePageMeta({
  pageKey: 'configuration',
  validate: (route) => ['en', 'zh'].includes(String(route.params.locale)),
})

usePageSeo('configuration')
</script>

<template>
  <ConfigurationPage />
</template>
