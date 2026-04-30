<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onClickOutside, useLocalStorage } from "@vueuse/core";
import { ElMessage, ElMessageBox } from "element-plus";
import { Rank, RefreshRight, Search, Setting } from "@element-plus/icons-vue";
import { useRegistryStore } from "@/stores/registry";
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY } from "@/composables/useI18n";
import { storeToRefs } from "pinia";
import type { Registry } from "@/types";
import { testSingleSpeed } from "@/api/speedtest";
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from "@/utils/latency-error-i18n";
import RegistryDialog from "./RegistryDialog.vue";

const store = useRegistryStore();
const { t, language } = useI18n();
const { filteredRegistries, currentRegistry, searchQuery, loading, latencyResults, latencyLoading } =
  storeToRefs(store);

/** 左侧列表中「未分类」分组标题，随界面语言变化。 */
const uncategorizedLabel = computed(() => t("registryList.uncategorized"));

const defaultPresetLabel = "预设源";
const categoryLabelMaxLength = 20;
const categoryByRegistry = useLocalStorage<Record<string, string>>(
  CATEGORY_BY_REGISTRY_STORAGE_KEY,
  {}
);
const categoryLabels = useLocalStorage<string[]>("nrm-desktop-category-labels", []);
const categoryExpanded = useLocalStorage<Record<string, boolean>>(
  "nrm-desktop-category-expanded",
  {}
);
const presetCategoryLabel = useLocalStorage<string>(
  "nrm-desktop-preset-category-label",
  defaultPresetLabel
);
if (!categoryLabels.value.includes(presetCategoryLabel.value)) {
  categoryLabels.value = [presetCategoryLabel.value, ...categoryLabels.value];
}

/**
 * 切换语言后，把展开状态与曾显式存成旧文案的「未分类」映射迁移到当前语言的标签。
 */
function migrateUncategorizedCategoryStorage() {
  const cur = uncategorizedLabel.value;
  const expanded = { ...categoryExpanded.value };
  let expChanged = false;
  for (const legacy of ["未分类", "Uncategorized"] as const) {
    if (legacy === cur) continue;
    if (expanded[legacy] === undefined) continue;
    if (expanded[cur] === undefined) expanded[cur] = expanded[legacy];
    delete expanded[legacy];
    expChanged = true;
  }
  if (expChanged) categoryExpanded.value = expanded;

  const mapping = { ...categoryByRegistry.value };
  let mapChanged = false;
  for (const [name, cat] of Object.entries(mapping)) {
    if ((cat === "未分类" || cat === "Uncategorized") && cat !== cur) {
      delete mapping[name];
      mapChanged = true;
    }
  }
  if (mapChanged) categoryByRegistry.value = mapping;
}

watch(language, () => {
  migrateUncategorizedCategoryStorage();
});

/**
 * 自定义源（含首次启动合并进来的当前源）不应出现在「预设源」分组下；并清理已不存在源的分类映射。
 */
function normalizeCustomRegistryCategories() {
  const presetCat = presetCategoryLabel.value;
  const validNames = new Set(store.registries.map((r) => r.name));
  const next = { ...categoryByRegistry.value };
  let changed = false;

  for (const key of Object.keys(next)) {
    if (!validNames.has(key)) {
      delete next[key];
      changed = true;
    }
  }

  for (const r of store.registries) {
    if (!r.is_custom) continue;
    if (next[r.name] === presetCat) {
      delete next[r.name];
      changed = true;
    }
  }

  if (changed) categoryByRegistry.value = next;
}

watch(
  () => store.registries.map((r) => `${r.name}:${r.is_custom}`).join("|"),
  () => {
    normalizeCustomRegistryCategories();
  },
  { immediate: true }
);
const groupedRegistries = computed(() => {
  const ucat = uncategorizedLabel.value;
  const groups: Record<string, Registry[]> = {};
  for (const label of categoryLabels.value) {
    groups[label] = [];
  }
  for (const registry of filteredRegistries.value) {
    const assignedCategory = categoryByRegistry.value[registry.name];
    const category = assignedCategory
      || (registry.is_custom
        ? ucat
        : (categoryLabels.value.includes(presetCategoryLabel.value)
            ? presetCategoryLabel.value
            : ucat));
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(registry);
  }
  const labels = Object.keys(groups);
  const orderedLabels = labels
    .filter((label) => label !== ucat)
    .sort((a, b) => {
      const ai = categoryLabels.value.indexOf(a);
      const bi = categoryLabels.value.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  if (labels.includes(ucat)) {
    orderedLabels.push(ucat);
  }
  return orderedLabels.map((label) => ({
    label,
    items: groups[label],
  }));
});

const showDialog = ref(false);
const editingRegistry = ref<Registry | null>(null);
const showDetailDialog = ref(false);
const selectedRegistry = ref<Registry | null>(null);
const showCategoryManageDialog = ref(false);
const newCategoryLabel = ref("");
const categoryRenameInputs = ref<Record<string, string>>({});
const testingByRegistry = ref<Record<string, boolean>>({});
const editingCategoryLabel = ref<string | null>(null);
const draggingCategoryLabel = ref<string | null>(null);
const dragOverManageCategoryLabel = ref<string | null>(null);
const manageDragLabel = ref<string | null>(null);
const manageDragStart = ref<{ x: number; y: number } | null>(null);
const isManageDragging = ref(false);
const manageDragSourceRect = ref<{ x: number; y: number } | null>(null);
const manageDragPointerOffset = ref({ x: 0, y: 0 });
const manageGhostPosition = ref({ x: 0, y: 0 });
const manageGhostTransition = ref("none");
const dragOverCategoryLabel = ref<string | null>(null);
const pointerDragRegistryName = ref<string | null>(null);
const isPointerDragging = ref(false);
const pointerStart = ref<{ x: number; y: number } | null>(null);
const pointerPosition = ref({ x: 0, y: 0 });
const dragSourceRect = ref<{ x: number; y: number } | null>(null);
const dragPointerOffset = ref({ x: 0, y: 0 });
const ghostPosition = ref({ x: 0, y: 0 });
const ghostTransition = ref("none");
const suppressNextClick = ref(false);
const contextMenu = ref<{
  x: number;
  y: number;
  registry: Registry;
} | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);

onClickOutside(contextMenuRef, () => {
  contextMenu.value = null;
});

const draggingRegistry = computed(() =>
  pointerDragRegistryName.value
    ? store.registries.find((item) => item.name === pointerDragRegistryName.value) || null
    : null
);

function handleSwitch(registry: Registry) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  if (currentRegistry.value?.name === registry.name) return;
  store.switchRegistry(registry.name);
}

function openAdd() {
  editingRegistry.value = null;
  showDialog.value = true;
}

function isCategoryExpanded(label: string): boolean {
  if (categoryExpanded.value[label] === undefined) return true;
  return categoryExpanded.value[label];
}

function toggleCategoryExpanded(label: string) {
  categoryExpanded.value = {
    ...categoryExpanded.value,
    [label]: !isCategoryExpanded(label),
  };
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
      t("registryList.confirmDeleteContent", { name: registry.name }),
      t("registryList.confirmDeleteTitle"),
      {
        confirmButtonText: t("common.delete"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      }
    );
    await store.deleteRegistry(registry.name);
  } catch {
    // cancelled
  }
}

async function handleTest(registry: Registry) {
  testingByRegistry.value = {
    ...testingByRegistry.value,
    [registry.name]: true,
  };
  try {
    const result = await testSingleSpeed(registry.name);
    store.setSingleLatencyResult(result);
    if (result.latency_ms !== null) {
      ElMessage.success(t("speedTest.toastOk", { name: registry.name, ms: result.latency_ms }));
      return;
    }
    ElMessage.warning(formatLatencyErrorMessage(t, result.error));
  } catch (error) {
    ElMessage.error(
      t("speedTest.runError", { detail: truncateSpeedTestRunError(String(error)) }),
    );
  } finally {
    testingByRegistry.value = {
      ...testingByRegistry.value,
      [registry.name]: false,
    };
  }
}

function onContextMenu(e: MouseEvent, registry: Registry) {
  e.preventDefault();
  contextMenu.value = { x: e.clientX, y: e.clientY, registry };
}

function getRegistryCategory(registry: Registry): string {
  const ucat = uncategorizedLabel.value;
  const assignedCategory = categoryByRegistry.value[registry.name];
  if (assignedCategory) return assignedCategory;
  if (registry.is_custom) return ucat;
  return categoryLabels.value.includes(presetCategoryLabel.value)
    ? presetCategoryLabel.value
    : ucat;
}

function moveRegistryToCategory(registryName: string, label: string) {
  const registry = filteredRegistries.value.find((item) => item.name === registryName);
  if (!registry) return;
  const currentCategory = getRegistryCategory(registry);
  if (currentCategory === label) return;

  const next = { ...categoryByRegistry.value };
  if (label === uncategorizedLabel.value) {
    delete next[registry.name];
  } else {
    ensureCategoryLabel(label);
    next[registry.name] = label;
  }
  categoryByRegistry.value = next;
  ElMessage.success(`已将 "${registry.name}" 移动到分类 "${label}"`);
}

function onRegistryMouseDown(registry: Registry, event: MouseEvent) {
  if (event.button !== 0) return;
  pointerDragRegistryName.value = registry.name;
  pointerStart.value = { x: event.clientX, y: event.clientY };
  const current = event.currentTarget as HTMLElement | null;
  if (current) {
    const rect = current.getBoundingClientRect();
    dragSourceRect.value = { x: rect.left, y: rect.top };
    dragPointerOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    ghostPosition.value = { x: rect.left, y: rect.top };
  } else {
    dragSourceRect.value = null;
    dragPointerOffset.value = { x: 0, y: 0 };
    ghostPosition.value = { x: event.clientX, y: event.clientY };
  }
  ghostTransition.value = "none";
  isPointerDragging.value = false;
}

function onCategoryMouseEnter(label: string) {
  if (!isPointerDragging.value || !pointerDragRegistryName.value) return;
  if (!isCategoryExpanded(label)) {
    categoryExpanded.value = {
      ...categoryExpanded.value,
      [label]: true,
    };
  }
  dragOverCategoryLabel.value = label;
  document.documentElement.style.setProperty("cursor", "copy", "important");
  document.body.style.setProperty("cursor", "copy", "important");
}

function clearPointerDragState() {
  pointerDragRegistryName.value = null;
  pointerStart.value = null;
  dragSourceRect.value = null;
  dragPointerOffset.value = { x: 0, y: 0 };
  isPointerDragging.value = false;
  dragOverCategoryLabel.value = null;
  ghostTransition.value = "none";
  document.documentElement.style.removeProperty("cursor");
  document.body.style.removeProperty("cursor");
}

function onWindowMouseMove(event: MouseEvent) {
  if (manageDragLabel.value && manageDragStart.value) {
    if (isManageDragging.value) {
      manageGhostTransition.value = "none";
      manageGhostPosition.value = {
        x: event.clientX - manageDragPointerOffset.value.x,
        y: event.clientY - manageDragPointerOffset.value.y,
      };
      return;
    }

    if (!isManageDragging.value) {
      const dx = Math.abs(event.clientX - manageDragStart.value.x);
      const dy = Math.abs(event.clientY - manageDragStart.value.y);
      if (dx + dy >= 4) {
        isManageDragging.value = true;
        document.documentElement.style.setProperty("cursor", "grabbing", "important");
        document.body.style.setProperty("cursor", "grabbing", "important");
        if (manageDragSourceRect.value) {
          manageGhostTransition.value = "transform 120ms ease-out";
          requestAnimationFrame(() => {
            manageGhostPosition.value = {
              x: event.clientX - manageDragPointerOffset.value.x,
              y: event.clientY - manageDragPointerOffset.value.y,
            };
          });
          return;
        }
        manageGhostPosition.value = {
          x: event.clientX - manageDragPointerOffset.value.x,
          y: event.clientY - manageDragPointerOffset.value.y,
        };
      }
    }
    return;
  }

  pointerPosition.value = { x: event.clientX, y: event.clientY };
  if (!pointerDragRegistryName.value || !pointerStart.value) return;
  if (isPointerDragging.value) {
    ghostTransition.value = "none";
    ghostPosition.value = {
      x: event.clientX - dragPointerOffset.value.x,
      y: event.clientY - dragPointerOffset.value.y,
    };
    return;
  }
  const dx = Math.abs(event.clientX - pointerStart.value.x);
  const dy = Math.abs(event.clientY - pointerStart.value.y);
  if (dx + dy >= 6) {
    isPointerDragging.value = true;
    document.documentElement.style.setProperty("cursor", "grabbing", "important");
    document.body.style.setProperty("cursor", "grabbing", "important");
    if (dragSourceRect.value) {
      ghostTransition.value = "transform 140ms ease-out";
      requestAnimationFrame(() => {
        ghostPosition.value = {
          x: event.clientX - dragPointerOffset.value.x,
          y: event.clientY - dragPointerOffset.value.y,
        };
      });
      return;
    }
    ghostPosition.value = {
      x: event.clientX - dragPointerOffset.value.x,
      y: event.clientY - dragPointerOffset.value.y,
    };
  }
}

function onWindowMouseUp() {
  if (manageDragLabel.value) {
    finishManageDrag();
    document.documentElement.style.removeProperty("cursor");
    document.body.style.removeProperty("cursor");
    return;
  }

  if (!pointerDragRegistryName.value) return;
  if (isPointerDragging.value && dragOverCategoryLabel.value) {
    moveRegistryToCategory(pointerDragRegistryName.value, dragOverCategoryLabel.value);
    suppressNextClick.value = true;
  }
  clearPointerDragState();
}

onMounted(() => {
  migrateUncategorizedCategoryStorage();
  normalizeCustomRegistryCategories();
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onWindowMouseUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onWindowMouseMove);
  window.removeEventListener("mouseup", onWindowMouseUp);
  document.documentElement.style.removeProperty("cursor");
  document.body.style.removeProperty("cursor");
});

function normalizeCategoryLabel(label: string | null | undefined): string {
  if (!label) return "";
  return label.trim().slice(0, categoryLabelMaxLength);
}

function ensureCategoryLabel(label: string) {
  const ucat = uncategorizedLabel.value;
  if (!label || label === ucat) return;
  if (!categoryLabels.value.includes(label)) {
    categoryLabels.value = [...categoryLabels.value, label];
  }
}

function saveCategoryFromDialog(payload: { oldName: string; newName: string; category: string | null }) {
  const normalized = normalizeCategoryLabel(payload.category);
  const nextMapping = { ...categoryByRegistry.value };
  delete nextMapping[payload.oldName];
  if (normalized) {
    ensureCategoryLabel(normalized);
    nextMapping[payload.newName] = normalized;
    ElMessage.success(t("categoryDialog.registryCategoryUpdated"));
  } else {
    ElMessage.success(t("categoryDialog.registrySetUncategorized"));
  }
  categoryByRegistry.value = nextMapping;
}

function openCategoryManageDialog() {
  const inputs: Record<string, string> = {};
  for (const label of categoryLabels.value) {
    inputs[label] = label;
  }
  categoryRenameInputs.value = inputs;
  editingCategoryLabel.value = null;
  draggingCategoryLabel.value = null;
  dragOverManageCategoryLabel.value = null;
  manageDragLabel.value = null;
  manageDragStart.value = null;
  isManageDragging.value = false;
  contextMenu.value = null;
  showCategoryManageDialog.value = true;
}

function startManageDrag(label: string, event: MouseEvent) {
  if (event.button !== 0) return;
  manageDragLabel.value = label;
  manageDragStart.value = { x: event.clientX, y: event.clientY };
  const current = event.currentTarget as HTMLElement | null;
  if (current) {
    const rect = current.getBoundingClientRect();
    manageDragSourceRect.value = { x: rect.left, y: rect.top };
    manageDragPointerOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    manageGhostPosition.value = { x: rect.left, y: rect.top };
  } else {
    manageDragSourceRect.value = null;
    manageDragPointerOffset.value = { x: 0, y: 0 };
    manageGhostPosition.value = { x: event.clientX, y: event.clientY };
  }
  manageGhostTransition.value = "none";
  isManageDragging.value = false;
  dragOverManageCategoryLabel.value = null;
}

function onManageRowEnter(label: string) {
  if (!isManageDragging.value || !manageDragLabel.value || manageDragLabel.value === label) {
    return;
  }
  dragOverManageCategoryLabel.value = label;
}

function finishManageDrag() {
  if (!manageDragLabel.value) return;
  if (isManageDragging.value && dragOverManageCategoryLabel.value) {
    const fromLabel = manageDragLabel.value;
    const toLabel = dragOverManageCategoryLabel.value;
    const fromIndex = categoryLabels.value.indexOf(fromLabel);
    const toIndex = categoryLabels.value.indexOf(toLabel);
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      const nextLabels = [...categoryLabels.value];
      nextLabels.splice(fromIndex, 1);
      nextLabels.splice(toIndex, 0, fromLabel);
      categoryLabels.value = nextLabels;
      ElMessage.success(t("categoryDialog.sorted"));
    }
  }
  manageDragLabel.value = null;
  manageDragStart.value = null;
  isManageDragging.value = false;
  dragOverManageCategoryLabel.value = null;
  manageDragSourceRect.value = null;
  manageDragPointerOffset.value = { x: 0, y: 0 };
  manageGhostTransition.value = "none";
}

function addCategoryLabel() {
  const normalized = normalizeCategoryLabel(newCategoryLabel.value);
  if (!normalized) {
    ElMessage.error(t("categoryDialog.nameRequired"));
    return;
  }
  if (
    normalized === uncategorizedLabel.value ||
    normalized === presetCategoryLabel.value ||
    categoryLabels.value.includes(normalized)
  ) {
    ElMessage.error(t("categoryDialog.nameExists"));
    return;
  }
  categoryLabels.value = [...categoryLabels.value, normalized];
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [normalized]: normalized,
  };
  newCategoryLabel.value = "";
  ElMessage.success(t("categoryDialog.added"));
}

function startRenameCategory(label: string) {
  editingCategoryLabel.value = label;
}

function cancelRenameCategory(label: string) {
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [label]: label,
  };
  editingCategoryLabel.value = null;
}

function saveRenamedCategory(oldLabel: string) {
  if (editingCategoryLabel.value !== oldLabel) {
    return;
  }
  const newLabel = normalizeCategoryLabel(categoryRenameInputs.value[oldLabel] || "");
  if (!newLabel) {
    ElMessage.error(t("categoryDialog.nameRequired"));
    return;
  }
  if (newLabel === oldLabel) {
    editingCategoryLabel.value = null;
    ElMessage.success(t("categoryDialog.saved"));
    return;
  }
  if (
    newLabel === uncategorizedLabel.value ||
    newLabel === presetCategoryLabel.value ||
    categoryLabels.value.includes(newLabel)
  ) {
    ElMessage.error(t("categoryDialog.nameExists"));
    return;
  }
  categoryLabels.value = categoryLabels.value.map((label) =>
    label === oldLabel ? newLabel : label
  );

  if (oldLabel === presetCategoryLabel.value) {
    presetCategoryLabel.value = newLabel;
  }

  const mapping: Record<string, string> = {};
  for (const [name, label] of Object.entries(categoryByRegistry.value)) {
    mapping[name] = label === oldLabel ? newLabel : label;
  }
  categoryByRegistry.value = mapping;

  const expanded = { ...categoryExpanded.value };
  if (expanded[oldLabel] !== undefined) {
    expanded[newLabel] = expanded[oldLabel];
    delete expanded[oldLabel];
    categoryExpanded.value = expanded;
  }

  editingCategoryLabel.value = null;

  const renameInputs = { ...categoryRenameInputs.value };
  delete renameInputs[oldLabel];
  renameInputs[newLabel] = newLabel;
  categoryRenameInputs.value = renameInputs;

  ElMessage.success(t("categoryDialog.renamed"));
}

async function deleteCategoryLabel(label: string) {
  try {
    await ElMessageBox.confirm(
      t("categoryDialog.confirmDeleteContent", { label }),
      t("categoryDialog.confirmDeleteTitle"),
      { confirmButtonText: t("common.delete"), cancelButtonText: t("common.cancel"), type: "warning" }
    );
  } catch {
    return;
  }
  categoryLabels.value = categoryLabels.value.filter((item) => item !== label);
  const mapping: Record<string, string> = {};
  for (const [name, category] of Object.entries(categoryByRegistry.value)) {
    if (category !== label) {
      mapping[name] = category;
    }
  }
  categoryByRegistry.value = mapping;
  const expanded = { ...categoryExpanded.value };
  delete expanded[label];
  categoryExpanded.value = expanded;

  if (editingCategoryLabel.value === label) {
    editingCategoryLabel.value = null;
  }

  const renameInputs = { ...categoryRenameInputs.value };
  delete renameInputs[label];
  categoryRenameInputs.value = renameInputs;

  ElMessage.success(t("categoryDialog.deleted"));
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
  if (!latency) return t("speedTest.notTested");
  if (latency.latency_ms !== null) return `${latency.latency_ms}ms`;
  return formatLatencyErrorMessage(t, latency.error, 120);
}

/** 列表/拖拽气泡中与语言一致的测速失败短文案 */
function latencyFailLabel(error: string | null | undefined): string {
  return formatLatencyErrorMessage(t, error, 14);
}

async function copyText(content: string, label: string) {
  try {
    await navigator.clipboard.writeText(content);
    ElMessage.success(t("registryList.detail.copied", { label }));
  } catch (error) {
    ElMessage.error(t("registryList.detail.copyFailed", { error: String(error) }));
  }
}

function copyDetailField(field: "name" | "url" | "latency") {
  if (!selectedRegistry.value) return;
  if (field === "name") {
    copyText(selectedRegistry.value.name, t("registryList.detail.copyLabel.name"));
    return;
  }
  if (field === "url") {
    copyText(selectedRegistry.value.url, t("registryList.detail.copyLabel.url"));
    return;
  }
  copyText(
    getLatencyText(selectedRegistry.value.name),
    t("registryList.detail.copyLabel.latency")
  );
}

function copyAllDetails() {
  if (!selectedRegistry.value) return;
  const registry = selectedRegistry.value;
  const detailText = [
    t("registryList.detail.copyAll.name", { value: registry.name }),
    t("registryList.detail.copyAll.url", { value: registry.url }),
    t("registryList.detail.copyAll.latency", { value: getLatencyText(registry.name) }),
    t("registryList.detail.copyAll.category", { value: getRegistryCategory(registry) }),
  ].join("\n");
  copyText(detailText, t("registryList.detail.copyLabel.detail"));
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-5 pt-7 pb-4">
      <h2 class="text-lg font-bold">{{ t("registryList.title") }}</h2>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
        {{ filteredRegistries.length }}
      </span>
      <el-button text size="small" @click="openCategoryManageDialog">
        <el-icon class="mr-1"><Setting /></el-icon>
        {{ t("registryList.categoryManage") }}
      </el-button>
      <div v-if="latencyLoading" class="ml-auto">
        <el-icon class="is-loading text-gray-400"><Search /></el-icon>
      </div>
    </div>

    <!-- Search -->
    <div class="px-4 pb-3">
      <el-input
        v-model="searchQuery"
        :placeholder="t('registryList.searchPlaceholder')"
        clearable
      >
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
          {{ t("registryList.empty") }}
        </div>

        <!-- Items -->
        <div v-else class="flex flex-col gap-3 p-1">
          <div
            v-for="group in groupedRegistries"
            :key="group.label"
            :class="[
              'relative flex flex-col gap-1 rounded border border-transparent transition-colors',
              {
                'bg-gray-50 border-primary/60 shadow-sm': dragOverCategoryLabel === group.label && isPointerDragging,
              },
            ]"
            @mouseenter="onCategoryMouseEnter(group.label)"
          >
            <div
              :class="[
                'px-2 pt-1 text-xs font-semibold text-gray-400 cursor-pointer select-none flex items-center gap-1 rounded',
                { 'bg-gray-100': dragOverCategoryLabel === group.label },
              ]"
              @click="toggleCategoryExpanded(group.label)"
            >
              <span>{{ isCategoryExpanded(group.label) ? "▾" : "▸" }}</span>
              <span>{{ group.label }} ({{ group.items.length }})</span>
            </div>
            <div
              v-if="dragOverCategoryLabel === group.label && isPointerDragging"
              class="category-drop-overlay absolute inset-0 z-20 pointer-events-none rounded-lg bg-white/55 border border-primary/25 backdrop-blur-[2px] flex items-center justify-center"
            >
              <div class="category-drop-hint px-3.5 py-2 text-xs font-medium text-primary bg-white/88 rounded-lg border border-white shadow-sm flex items-center gap-1.5">
                <span class="text-[11px]">↳</span>
                <span>{{ t("registryList.dropHint", { label: group.label }) }}</span>
              </div>
            </div>
            <div
              v-if="isCategoryExpanded(group.label)"
              v-for="registry in group.items"
              :key="registry.name"
              :class="[
                'registry-item flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border-l-3 border-transparent select-none cursor-grab',
                {
                  'is-active': currentRegistry?.name === registry.name,
                  'is-idle': currentRegistry?.name !== registry.name,
                  'opacity-40 cursor-grabbing': pointerDragRegistryName === registry.name && isPointerDragging,
                },
              ]"
              @click="handleSwitch(registry)"
              @mousedown.left="onRegistryMouseDown(registry, $event)"
              @dblclick.stop="openEdit(registry)"
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
                      {{ latencyFailLabel(latencyResults[registry.name].error) }}
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
                <div class="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <el-button
                    link
                    size="small"
                    class="registry-speed-btn registry-speed-btn-fixed"
                    :loading="!!testingByRegistry[registry.name]"
                    :disabled="!!testingByRegistry[registry.name]"
                    @click.stop="handleTest(registry)"
                  >
                    <el-icon v-if="!testingByRegistry[registry.name]" class="text-base leading-none">
                      <RefreshRight />
                    </el-icon>
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- Footer -->
    <div class="px-4 py-4 border-t border-gray-100">
      <el-button type="primary" class="w-full registry-add-btn" @click="openAdd">
        {{ t("registryList.addSource") }}
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
          {{ t("registryList.context.viewDetail") }}
        </div>
        <div class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50" @click="openEdit(contextMenu!.registry)">
          {{ t("registryList.context.edit") }}
        </div>
        <div class="px-3 py-2 text-sm cursor-pointer hover:bg-red-50 text-red-500" @click="handleDelete(contextMenu!.registry)">
          {{ t("registryList.context.delete") }}
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Dialog -->
    <RegistryDialog
      :visible="showDialog"
      :registry="editingRegistry"
      :category-labels="categoryLabels"
      :current-category="editingRegistry ? categoryByRegistry[editingRegistry.name] || '' : ''"
      @save-category="saveCategoryFromDialog"
      @close="showDialog = false"
    />

    <el-dialog
      v-model="showCategoryManageDialog"
      :title="t('categoryDialog.title')"
      width="520px"
      :close-on-click-modal="false"
    >
      <div class="flex items-center gap-2 mb-3">
        <el-input
          v-model="newCategoryLabel"
          :placeholder="t('categoryDialog.newPlaceholder')"
          :maxlength="categoryLabelMaxLength"
          show-word-limit
          clearable
          @keyup.enter="addCategoryLabel"
        />
        <el-button type="primary" @click="addCategoryLabel">{{ t("categoryDialog.add") }}</el-button>
      </div>
      <div v-if="categoryLabels.length === 0" class="text-sm text-gray-400 py-6 text-center">
        {{ t("categoryDialog.empty") }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="label in categoryLabels"
          :key="label"
          :class="[
            'flex items-center gap-2 rounded',
            {
              'bg-primary/8': dragOverManageCategoryLabel === label,
              'opacity-70': isManageDragging && manageDragLabel === label,
            },
          ]"
          @mouseenter="onManageRowEnter(label)"
        >
          <div
            class="w-7 h-8 flex items-center justify-center text-gray-400 cursor-grab active:cursor-grabbing"
            @mousedown.left.stop.prevent="startManageDrag(label, $event)"
            :title="t('categoryDialog.dragSort')"
          >
            <el-icon><Rank /></el-icon>
          </div>
          <el-input
            v-model="categoryRenameInputs[label]"
            :maxlength="categoryLabelMaxLength"
            show-word-limit
            :disabled="editingCategoryLabel !== label"
          />
          <el-button
            size="small"
            :disabled="editingCategoryLabel !== null && editingCategoryLabel !== label"
            @click="
              editingCategoryLabel === label
                ? cancelRenameCategory(label)
                : startRenameCategory(label)
            "
          >
            {{ editingCategoryLabel === label ? t("common.cancel") : t("categoryDialog.rename") }}
          </el-button>
          <el-button
            v-if="editingCategoryLabel === label"
            size="small"
            type="primary"
            @click="saveRenamedCategory(label)"
          >
            {{ t("common.save") }}
          </el-button>
          <el-button size="small" type="danger" @click="deleteCategoryLabel(label)">
            {{ t("categoryDialog.delete") }}
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="showCategoryManageDialog = false">{{ t("common.close") }}</el-button>
      </template>
    </el-dialog>

    <!-- Registry Detail Dialog -->
    <el-dialog
      v-model="showDetailDialog"
      :title="t('registryList.detail.title')"
      width="520px"
      :close-on-click-modal="true"
      destroy-on-close
    >
      <div v-if="selectedRegistry" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">{{ t("registryList.detail.name") }}</div>
            <div class="text-sm font-semibold break-all">{{ selectedRegistry.name }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('name')">{{ t("common.copy") }}</el-button>
        </div>

        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs text-gray-400">{{ t("registryList.detail.url") }}</div>
            <div class="text-sm break-all">{{ selectedRegistry.url }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('url')">{{ t("common.copy") }}</el-button>
        </div>

        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">{{ t("registryList.detail.latency") }}</div>
            <div
              class="text-sm font-mono"
              :style="{
                color: getLatencyColor(latencyResults[selectedRegistry.name]?.latency_ms ?? null),
              }"
            >
              {{ getLatencyText(selectedRegistry.name) }}
            </div>
          </div>
          <el-button text size="small" @click="copyDetailField('latency')">{{ t("common.copy") }}</el-button>
        </div>

        <div>
          <div class="text-xs text-gray-400">{{ t("registryList.detail.category") }}</div>
          <div class="text-sm">{{ getRegistryCategory(selectedRegistry) }}</div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="showDetailDialog = false">{{ t("common.close") }}</el-button>
          <el-button type="primary" @click="copyAllDetails">{{ t("registryList.detail.copyAll") }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Dragging Ghost -->
    <Teleport to="body">
      <div
        v-if="isPointerDragging && draggingRegistry"
        class="fixed z-[9999] pointer-events-none registry-item flex items-center justify-between px-3 py-2.5 rounded-lg border-l-3 border-primary bg-white shadow-lg min-w-62 max-w-88"
        :style="{
          left: '0px',
          top: '0px',
          transform: `translate(${ghostPosition.x}px, ${ghostPosition.y}px)`,
          transition: ghostTransition,
        }"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-semibold truncate">
              {{ draggingRegistry.name }}
            </span>
          </div>
          <div class="text-xs text-gray-400 truncate mt-0.5">
            {{ draggingRegistry.url }}
          </div>
        </div>
        <div class="flex items-center gap-2 ml-2 flex-shrink-0">
          <template v-if="latencyResults[draggingRegistry.name]">
            <span
              class="text-xs font-mono font-medium"
              :style="{ color: getLatencyColor(latencyResults[draggingRegistry.name].latency_ms) }"
            >
              <template v-if="latencyResults[draggingRegistry.name].latency_ms !== null">
                {{ latencyResults[draggingRegistry.name].latency_ms }}ms
              </template>
              <template v-else>
                {{ latencyFailLabel(latencyResults[draggingRegistry.name].error) }}
              </template>
            </span>
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: getLatencyColor(latencyResults[draggingRegistry.name].latency_ms) }"
            ></span>
          </template>
          <div
            v-else-if="currentRegistry?.name === draggingRegistry.name"
            class="w-2 h-2 rounded-full"
            style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"
          ></div>
        </div>
      </div>
    </Teleport>

    <!-- Category Manage Dragging Ghost -->
    <Teleport to="body">
      <div
        v-if="isManageDragging && manageDragLabel"
        class="fixed z-[9999] pointer-events-none px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-lg min-w-42"
        :style="{
          left: '0px',
          top: '0px',
          transform: `translate(${manageGhostPosition.x}px, ${manageGhostPosition.y}px)`,
          transition: manageGhostTransition,
        }"
      >
        <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
          <el-icon class="text-gray-400"><Rank /></el-icon>
          <span class="truncate">{{ manageDragLabel }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.registry-speed-btn.el-button.is-link {
  background-color: transparent !important;
}
.registry-speed-btn.el-button.is-link:hover,
.registry-speed-btn.el-button.is-link:focus {
  background-color: transparent !important;
}
/* 与 loading 动画占位一致，避免切换时布局抖动 */
.registry-speed-btn-fixed.el-button.is-link {
  width: 2rem;
  height: 2rem;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0 !important;
  box-sizing: border-box;
}
.registry-speed-btn-fixed :deep(.el-icon) {
  font-size: 1rem;
}
.registry-speed-btn-fixed.is-loading :deep(.el-icon) {
  font-size: 1rem;
}
</style>
