<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import { useRegistryStore } from "@/stores/registry";
import { storeToRefs } from "pinia";
import type { Registry } from "@/types";
import RegistryDialog from "./RegistryDialog.vue";

const store = useRegistryStore();
const { filteredRegistries, currentRegistry, searchQuery, loading, latencyResults, latencyLoading } =
  storeToRefs(store);

const groupedRegistries = computed(() => {
  const preset: Registry[] = [];
  const custom: Registry[] = [];
  for (const registry of filteredRegistries.value) {
    if (registry.is_custom) {
      custom.push(registry);
    } else {
      preset.push(registry);
    }
  }
  return { preset, custom };
});
const isPresetExpanded = ref(true);
const isCustomExpanded = ref(true);

const showDialog = ref(false);
const editingRegistry = ref<Registry | null>(null);
const showDetailDialog = ref(false);
const selectedRegistry = ref<Registry | null>(null);
const contextMenu = ref<{
  x: number;
  y: number;
  registry: Registry;
} | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);

onClickOutside(contextMenuRef, () => {
  contextMenu.value = null;
});

function handleSwitch(registry: Registry) {
  if (currentRegistry.value?.name === registry.name) return;
  store.switchRegistry(registry.name);
}

function openAdd() {
  editingRegistry.value = null;
  showDialog.value = true;
}

function togglePresetExpanded() {
  isPresetExpanded.value = !isPresetExpanded.value;
}

function toggleCustomExpanded() {
  isCustomExpanded.value = !isCustomExpanded.value;
}

function openEdit(registry: Registry) {
  editingRegistry.value = registry;
  showDialog.value = true;
  contextMenu.value = null;
}

function openDetail(registry: Registry) {
  selectedRegistry.value = registry;
  showDetailDialog.value = true;
}

async function handleDelete(registry: Registry) {
  contextMenu.value = null;
  try {
    await ElMessageBox.confirm(
      `确定要删除源 "${registry.name}" 吗？`,
      "确认删除",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }
    );
    await store.deleteRegistry(registry.name);
    ElMessage.success(`已删除源: ${registry.name}`);
  } catch {
    // cancelled
  }
}

function onContextMenu(e: MouseEvent, registry: Registry) {
  e.preventDefault();
  contextMenu.value = { x: e.clientX, y: e.clientY, registry };
}

function getLatencyColor(ms: number | null): string {
  if (ms === null) return "#94a3b8";
  if (ms < 200) return "#22c55e";
  if (ms < 500) return "#84cc16";
  if (ms < 1000) return "#eab308";
  if (ms < 3000) return "#f97316";
  return "#ef4444";
}

function getLatencyText(name: string): string {
  const latency = latencyResults.value[name];
  if (!latency) return "未测试";
  if (latency.latency_ms !== null) return `${latency.latency_ms}ms`;
  return latency.error || "超时";
}

async function copyText(content: string, label: string) {
  try {
    await navigator.clipboard.writeText(content);
    ElMessage.success(`${label}已复制`);
  } catch (error) {
    ElMessage.error(`复制失败: ${error}`);
  }
}

function copyDetailField(field: "name" | "url" | "latency") {
  if (!selectedRegistry.value) return;
  if (field === "name") {
    copyText(selectedRegistry.value.name, "名称");
    return;
  }
  if (field === "url") {
    copyText(selectedRegistry.value.url, "URL");
    return;
  }
  copyText(getLatencyText(selectedRegistry.value.name), "延迟");
}

function copyAllDetails() {
  if (!selectedRegistry.value) return;
  const registry = selectedRegistry.value;
  const detailText = [
    `名称: ${registry.name}`,
    `URL: ${registry.url}`,
    `延迟: ${getLatencyText(registry.name)}`,
    `类型: ${registry.is_custom ? "自定义" : "预设"}`,
  ].join("\n");
  copyText(detailText, "详情");
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-5 pt-7 pb-4">
      <h2 class="text-lg font-bold">源列表</h2>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
        {{ filteredRegistries.length }}
      </span>
      <div v-if="latencyLoading" class="ml-auto">
        <el-icon class="is-loading text-gray-400"><Search /></el-icon>
      </div>
    </div>

    <!-- Search -->
    <div class="px-4 pb-3">
      <el-input v-model="searchQuery" placeholder="搜索源名称或 URL..." clearable>
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-hidden px-3">
      <el-scrollbar class="h-full">
        <!-- Loading Skeleton -->
        <div v-if="loading" class="flex flex-col gap-2 p-2">
          <div
            v-for="i in 6"
            :key="i"
            class="h-16 rounded-lg animate-pulse"
            style="background: linear-gradient(90deg, #f1f5f9 25%, #f8fafc 50%, #f1f5f9 75%); background-size: 200% 100%;"
          ></div>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredRegistries.length === 0" class="flex-center py-10 text-sm text-gray-400">
          未找到匹配的源
        </div>

        <!-- Items -->
        <div v-else class="flex flex-col gap-3 p-1">
          <div v-if="groupedRegistries.preset.length > 0" class="flex flex-col gap-1">
            <div
              class="px-2 pt-1 text-xs font-semibold text-gray-400 cursor-pointer select-none flex items-center gap-1"
              @click="togglePresetExpanded"
            >
              <span>{{ isPresetExpanded ? "▾" : "▸" }}</span>
              <span>预设源 ({{ groupedRegistries.preset.length }})</span>
            </div>
            <div
              v-if="isPresetExpanded"
              v-for="registry in groupedRegistries.preset"
              :key="registry.name"
              :class="[
                'registry-item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border-l-3 border-transparent',
                {
                  'is-active': currentRegistry?.name === registry.name,
                },
              ]"
              @click="handleSwitch(registry)"
              @dblclick.stop="openDetail(registry)"
              @contextmenu="onContextMenu($event, registry)"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span
                    :class="[
                      'text-sm font-semibold truncate',
                      { 'text-primary': currentRegistry?.name === registry.name },
                    ]"
                  >
                    {{ registry.name }}
                  </span>
                </div>
                <div class="text-xs text-gray-400 truncate mt-0.5">
                  {{ registry.url }}
                </div>
              </div>

              <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                <template v-if="latencyResults[registry.name]">
                  <span
                    class="text-xs font-mono font-medium"
                    :style="{ color: getLatencyColor(latencyResults[registry.name].latency_ms) }"
                  >
                    <template v-if="latencyResults[registry.name].latency_ms !== null">
                      {{ latencyResults[registry.name].latency_ms }}ms
                    </template>
                    <template v-else class="text-gray-400">
                      {{ latencyResults[registry.name].error || "超时" }}
                    </template>
                  </span>
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: getLatencyColor(latencyResults[registry.name].latency_ms) }"
                  ></span>
                </template>
                <div
                  v-else-if="currentRegistry?.name === registry.name"
                  class="w-2 h-2 rounded-full"
                  style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"
                ></div>
              </div>
            </div>
          </div>

          <div v-if="groupedRegistries.custom.length > 0" class="flex flex-col gap-1">
            <div
              class="px-2 pt-1 text-xs font-semibold text-gray-400 cursor-pointer select-none flex items-center gap-1"
              @click="toggleCustomExpanded"
            >
              <span>{{ isCustomExpanded ? "▾" : "▸" }}</span>
              <span>自定义源 ({{ groupedRegistries.custom.length }})</span>
            </div>
            <div
              v-if="isCustomExpanded"
              v-for="registry in groupedRegistries.custom"
              :key="registry.name"
              :class="[
                'registry-item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border-l-3 border-transparent',
                {
                  'is-active': currentRegistry?.name === registry.name,
                  'bg-gray-50': currentRegistry?.name !== registry.name,
                },
              ]"
              @click="handleSwitch(registry)"
              @dblclick.stop="openDetail(registry)"
              @contextmenu="onContextMenu($event, registry)"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span
                    :class="[
                      'text-sm font-semibold truncate',
                      { 'text-primary': currentRegistry?.name === registry.name },
                    ]"
                  >
                    {{ registry.name }}
                  </span>
                </div>
                <div class="text-xs text-gray-400 truncate mt-0.5">
                  {{ registry.url }}
                </div>
              </div>

              <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                <template v-if="latencyResults[registry.name]">
                  <span
                    class="text-xs font-mono font-medium"
                    :style="{ color: getLatencyColor(latencyResults[registry.name].latency_ms) }"
                  >
                    <template v-if="latencyResults[registry.name].latency_ms !== null">
                      {{ latencyResults[registry.name].latency_ms }}ms
                    </template>
                    <template v-else class="text-gray-400">
                      {{ latencyResults[registry.name].error || "超时" }}
                    </template>
                  </span>
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: getLatencyColor(latencyResults[registry.name].latency_ms) }"
                  ></span>
                </template>
                <div
                  v-else-if="currentRegistry?.name === registry.name"
                  class="w-2 h-2 rounded-full"
                  style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- Footer -->
    <div class="px-4 py-4 border-t border-gray-100">
      <el-button type="primary" class="w-full" @click="openAdd">
        + 添加源
      </el-button>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuRef"
        class="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-36"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50" @click="openDetail(contextMenu!.registry); contextMenu = null">
          查看详情
        </div>
        <div class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50" @click="openEdit(contextMenu!.registry)">
          编辑
        </div>
        <template v-if="contextMenu.registry.is_custom">
          <div class="px-3 py-2 text-sm cursor-pointer hover:bg-red-50 text-red-500" @click="handleDelete(contextMenu!.registry)">
            删除
          </div>
        </template>
        <div v-else class="px-3 py-2 text-xs text-gray-400 italic border-t border-gray-100">
          预设源不可删除
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Dialog -->
    <RegistryDialog
      :visible="showDialog"
      :registry="editingRegistry"
      @close="showDialog = false"
    />

    <!-- Registry Detail Dialog -->
    <el-dialog
      v-model="showDetailDialog"
      title="源详情"
      width="520px"
      :close-on-click-modal="true"
      destroy-on-close
    >
      <div v-if="selectedRegistry" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">名称</div>
            <div class="text-sm font-semibold break-all">{{ selectedRegistry.name }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('name')">复制</el-button>
        </div>

        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs text-gray-400">URL</div>
            <div class="text-sm break-all">{{ selectedRegistry.url }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('url')">复制</el-button>
        </div>

        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">延迟</div>
            <div
              class="text-sm font-mono"
              :style="{
                color: getLatencyColor(latencyResults[selectedRegistry.name]?.latency_ms ?? null),
              }"
            >
              {{ getLatencyText(selectedRegistry.name) }}
            </div>
          </div>
          <el-button text size="small" @click="copyDetailField('latency')">复制</el-button>
        </div>

        <div>
          <div class="text-xs text-gray-400">类型</div>
          <div class="text-sm">{{ selectedRegistry.is_custom ? "自定义" : "预设" }}</div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="showDetailDialog = false">关闭</el-button>
          <el-button type="primary" @click="copyAllDetails">复制全部</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
