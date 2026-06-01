<script setup lang="ts">
import DownloadPage from '../../components/pages/DownloadPage.vue'

definePageMeta({
  pageKey: 'download',
  validate: (route) => ['en', 'zh'].includes(String(route.params.locale)),
})

usePageSeo('download')
</script>

<template>
  <DownloadPage />
</template>
