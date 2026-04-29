<script setup lang="ts">
import { ElMessage } from "element-plus";
import { CopyDocument } from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-shell";
import { useRegistryStore } from "@/stores/registry";
import { useI18n } from "@/composables/useI18n";
import { storeToRefs } from "pinia";

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
  <div
    class="current-source-card flex items-center justify-between px-6 py-5 rounded-xl text-white"
  >
    <div class="flex flex-col gap-0.5">
      <div class="text-xs opacity-80 uppercase tracking-wide">{{ t("currentSource.title") }}</div>
      <div class="text-xl font-bold leading-tight">
        {{ currentRegistry?.name ?? t("currentSource.unset") }}
      </div>
      <div
        class="text-xs opacity-90 break-all underline decoration-white/60 cursor-pointer hover:opacity-100 transition-opacity"
        :title="currentRegistry?.url || ''"
        @click="handleOpenUrl"
      >
        {{ currentRegistry?.url || t("currentSource.emptyUrl") }}
      </div>
    </div>
    <div v-if="currentRegistry" class="flex items-center gap-2">
      <el-button
        text
        size="small"
        class="!text-white !px-2.5 !py-1.5 !rounded-full !border-0 hover:!bg-white/25"
        style="background: rgba(255, 255, 255, 0.18)"
        title="复制当前源链接"
        @click="handleCopyUrl"
      >
        <el-icon class="mr-1"><CopyDocument /></el-icon>
        {{ t("currentSource.copyUrl") }}
      </el-button>
      <div
        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style="background: rgba(255, 255, 255, 0.2)"
      >
        <span
          class="w-2 h-2 rounded-full bg-white shadow-md"
          style="box-shadow: 0 0 6px rgba(255, 255, 255, 0.6)"
        ></span>
        {{ t("currentSource.inUse") }}
      </div>
    </div>
  </div>
</template>
