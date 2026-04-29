<script setup lang="ts">
import { ElMessage } from "element-plus";
import { CopyDocument } from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-shell";
import { useRegistryStore } from "@/stores/registry";
import { storeToRefs } from "pinia";

const store = useRegistryStore();
const { currentRegistry } = storeToRefs(store);

/**
 * 复制当前源 URL 到剪贴板。
 */
async function handleCopyUrl() {
  if (!currentRegistry.value?.url) return;
  try {
    await navigator.clipboard.writeText(currentRegistry.value.url);
    ElMessage.success("URL 已复制");
  } catch (error) {
    ElMessage.error(`复制失败: ${error}`);
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
    ElMessage.error(`打开链接失败: ${error}`);
  }
}
</script>

<template>
  <div
    class="flex items-center justify-between px-6 py-5 rounded-xl text-white"
    style="background: linear-gradient(135deg, #4f6ef7, #6d8aff)"
  >
    <div class="flex flex-col gap-0.5">
      <div class="text-xs opacity-80 uppercase tracking-wide">当前源</div>
      <div class="text-xl font-bold leading-tight">
        {{ currentRegistry?.name ?? "未设置" }}
      </div>
      <div
        class="text-xs opacity-90 break-all underline decoration-white/60 cursor-pointer hover:opacity-100 transition-opacity"
        :title="currentRegistry?.url || ''"
        @click="handleOpenUrl"
      >
        {{ currentRegistry?.url || "暂无 URL" }}
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
        复制 URL
      </el-button>
      <div
        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
        style="background: rgba(255, 255, 255, 0.2)"
      >
        <span
          class="w-2 h-2 rounded-full bg-white shadow-md"
          style="box-shadow: 0 0 6px rgba(255, 255, 255, 0.6)"
        ></span>
        使用中
      </div>
    </div>
  </div>
</template>
