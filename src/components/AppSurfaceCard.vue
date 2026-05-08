<script setup lang="ts">
/**
 * 公共表面卡片组件：渐变底、描边、阴影、高光层（视觉样式由 .app-surface-card 提供）。
 * 通过默认 slot 放内容；外层可再叠 `class`（如布局、rounded-2xl、区块名）。
 */
withDefaults(
  defineProps<{
    /** 仅当前源块使用的入场动画，避免与全局 GSAP 入场重复 */
    entryAnimation?: boolean
  }>(),
  { entryAnimation: false },
)
</script>

<template>
  <div class="app-surface-card" :class="{ 'app-surface-card--entry': entryAnimation }">
    <slot />
  </div>
</template>
