<script setup lang="ts">
import { CopyDocument } from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-shell";
import { useRegistryStore } from "@/stores/registry";
import { useI18n } from "@/composables/useI18n";
import { storeToRefs } from "pinia";
import AppSurfaceCard from "@/components/AppSurfaceCard.vue";

const store = useRegistryStore();
const { currentRegistry } = storeToRefs(store);
const { t } = useI18n();

/**
 * 复制当前源 URL 到剪贴板。
 */
async function handleCopyUrl() {
  if (!currentRegistry.value?.url) return;
  try {
    await navigator.clipboard.writeText(currentRegistry.value.url);
    ElMessage.success(t("currentSource.copySuccess"));
  } catch (error) {
    ElMessage.error(t("currentSource.copyFailed", { error: String(error) }));
  }
}

/**
 * 使用系统浏览器打开当前源 URL。
 */
async function handleOpenUrl() {
  if (!currentRegistry.value?.url) return;
  try {
    await open(currentRegistry.value.url);
  } catch (error) {
    ElMessage.error(t("currentSource.openFailed", { error: String(error) }));
  }
}
</script>

<template>
  <AppSurfaceCard
    class="current-source-card flex items-center justify-between px-6 py-5 rounded-2xl"
  >
    <div class="flex flex-col gap-0.5">
      <div class="current-source-kicker text-xs uppercase tracking-wide">{{ t("currentSource.title") }}</div>
      <div class="current-source-name text-xl font-semibold leading-tight">
        {{ currentRegistry?.name ?? t("currentSource.unset") }}
      </div>
      <div
        class="current-source-url text-xs break-all cursor-pointer"
        :title="currentRegistry?.url || ''"
        @click="handleOpenUrl"
      >
        {{ currentRegistry?.url || t("currentSource.emptyUrl") }}
      </div>
    </div>
    <div v-if="currentRegistry" class="flex items-center">
      <el-button
        text
        size="small"
        class="current-source-copy-btn !px-2.5 !py-1.5 !rounded-full !border-0 active:!scale-[0.97]"
        :title="t('currentSource.copyUrlTooltip')"
        @click="handleCopyUrl"
      >
        <el-icon class="mr-1"><CopyDocument /></el-icon>
        {{ t("currentSource.copyUrl") }}
      </el-button>
    </div>
  </AppSurfaceCard>
</template>
