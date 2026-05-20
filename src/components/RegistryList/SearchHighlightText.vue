<script setup lang="ts">
import { computed } from 'vue'
import { getHighlightSegments } from '@/utils/highlight-text'

const props = defineProps<{
  text: string
  query: string
}>()

const segments = computed(() => getHighlightSegments(props.text, props.query))
const hasHighlight = computed(() => props.query.trim().length > 0)
</script>

<template>
  <span class="search-highlight-text">
    <template v-if="hasHighlight">
      <template v-for="(segment, index) in segments" :key="index">
        <mark v-if="segment.highlight" class="registry-search-highlight">{{ segment.text }}</mark>
        <template v-else>{{ segment.text }}</template>
      </template>
    </template>
    <template v-else>{{ text }}</template>
  </span>
</template>
