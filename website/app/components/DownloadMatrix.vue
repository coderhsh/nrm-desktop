<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { Copy, DownloadKind } from '../types/site'

withDefaults(
  defineProps<{
    dense?: boolean
  }>(),
  {
    dense: false,
  },
)

type DownloadCard = {
  id: DownloadKind
  platform: Copy
  title: Copy
  detail: Copy
  recommendedFor: Array<'macos' | 'windows'>
}

const {
  ensureReleaseLoaded,
  findAsset,
  formatSize,
  isLoadingRelease,
  latestReleaseUrl,
  release,
  releaseError,
  t,
  userPlatform,
} = useSiteState()

const isRecommended = (card: DownloadCard) => {
  return userPlatform.value !== 'other' && card.recommendedFor.includes(userPlatform.value)
}

const cards = computed<DownloadCard[]>(() => [
  {
    id: 'dmg',
    platform: { en: 'macOS', zh: 'macOS' },
    title: { en: 'Apple Silicon DMG', zh: 'Apple Silicon DMG' },
    detail: {
      en: 'Recommended for Apple Silicon Macs. Drag into Applications after download.',
      zh: '推荐 Apple Silicon Mac 使用。下载后拖入“应用程序”。',
    },
    recommendedFor: ['macos'],
  },
  {
    id: 'setup',
    platform: { en: 'Windows', zh: 'Windows' },
    title: { en: 'Setup EXE', zh: '安装版 EXE' },
    detail: {
      en: 'Best default choice for Windows 10 / 11 x64 users.',
      zh: '适合大多数 Windows 10 / 11 x64 用户的默认选择。',
    },
    recommendedFor: ['windows'],
  },
  {
    id: 'portable',
    platform: { en: 'Windows', zh: 'Windows' },
    title: { en: 'Portable ZIP', zh: '便携版 ZIP' },
    detail: {
      en: 'Run directly after unzip. Useful for quick trials and portable setups.',
      zh: '解压后直接运行，适合快速试用和便携环境。',
    },
    recommendedFor: [],
  },
  {
    id: 'msi',
    platform: { en: 'Windows', zh: 'Windows' },
    title: { en: 'MSI package', zh: 'MSI 安装包' },
    detail: {
      en: 'For administrators who need silent installation and deployment.',
      zh: '适合需要静默安装和批量部署的管理员。',
    },
    recommendedFor: [],
  },
])

onMounted(() => {
  void ensureReleaseLoaded()
})
</script>

<template>
  <div class="release-strip" data-reveal>
    <div>
      <span>{{ t({ en: 'Latest release', zh: '最新版本' }) }}</span>
      <strong>{{ isLoadingRelease ? '...' : release?.tag_name ?? 'latest' }}</strong>
    </div>
    <a class="button secondary compact" :href="release?.html_url ?? latestReleaseUrl" target="_blank" rel="noreferrer">
      {{ t({ en: 'Open release', zh: '查看发布' }) }}
    </a>
  </div>

  <div v-if="releaseError" class="release-warning" data-reveal>
    {{
      t({
        en: 'GitHub release assets are temporarily unavailable in this environment. Fallback links stay enabled.',
        zh: '当前环境暂时无法读取 GitHub Release 资产，备用下载链接仍然可用。',
      })
    }}
  </div>

  <div class="download-grid" :class="{ dense }">
    <article
      v-for="card in cards"
      :key="card.id"
      class="download-card"
      :class="{ recommended: isRecommended(card) }"
      data-reveal
    >
      <div class="download-card-top">
        <span>{{ t(card.platform) }}</span>
        <em v-if="isRecommended(card)">{{ t({ en: 'Recommended', zh: '推荐' }) }}</em>
      </div>
      <h3>{{ t(card.title) }}</h3>
      <p>{{ t(card.detail) }}</p>
      <small>{{ findAsset(card.id)?.name ?? t({ en: 'Fallback to GitHub Releases', zh: '回退到 GitHub Releases' }) }}</small>
      <a class="button primary download-button" :href="findAsset(card.id)?.browser_download_url ?? latestReleaseUrl" target="_blank" rel="noreferrer">
        <span class="download-button-label">{{ t({ en: 'Download', zh: '下载' }) }}</span>
        <span class="download-button-size">
          {{ formatSize(findAsset(card.id)?.size) || '--' }}
        </span>
      </a>
    </article>
  </div>
</template>
