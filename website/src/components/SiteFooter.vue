<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { footerColumns, t } from '../lib/site'
</script>

<template>
  <footer class="footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <strong>nrm desktop</strong>
        <p>
          {{
            t({
              en: 'A desktop workspace for npm registry management, release downloads and project maintainers.',
              zh: '面向 npm 源管理、版本下载和项目维护者的桌面工作台。',
            })
          }}
        </p>
      </div>

      <div v-for="column in footerColumns" :key="column.title.en" class="footer-column">
        <h3>{{ t(column.title) }}</h3>
        <template v-for="link in column.links" :key="'to' in link ? link.to : link.href">
          <RouterLink v-if="'to' in link" :to="link.to">{{ t(link.label) }}</RouterLink>
          <a v-else :href="link.href" target="_blank" rel="noreferrer">{{ t(link.label) }}</a>
        </template>
      </div>
    </div>
  </footer>
</template>
