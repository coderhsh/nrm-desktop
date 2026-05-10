<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { useShellIntro } from '@/composables/useShellIntro'
import { onClickOutside } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { Delete, Expand, Fold, Rank, RefreshRight, Search, Setting } from '@element-plus/icons-vue'
import { useRegistryStore } from '@/stores/registry'
import { useI18n } from '@/composables/useI18n'
import { storeToRefs } from 'pinia'
import type { Registry } from '@/types'
import { testSingleSpeed } from '@/api/speedtest'
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from '@/utils/latency-error-i18n'
import { latencyBarColor } from '@/utils/latency-bar-color'
import RegistryDialog from './RegistryDialog.vue'
import { appEntranceSettledKey } from '@/composables/useAppBlocksEntrance'
import { CATEGORY_LABEL_MAX_LENGTH } from './constants'
import type { ManageCategorySlot, RegistrySlot, GroupedRegistries } from './constants'

// ==================== Composables ====================
import { useCategoryManage } from '@/composables/useCategoryManage'
import { useRegistryDragSort } from '@/composables/useRegistryDragSort'

const store = useRegistryStore()
const { t } = useI18n()
const { introPhase } = useShellIntro()
const entranceSettled = inject(appEntranceSettledKey, Promise.resolve())

const {
  filteredRegistries,
  currentRegistry,
  searchQuery,
  loading,
  latencyResults,
} = storeToRefs(store)

// ==================== 入场动画 ====================
const holdCategoriesCollapsedUntilEntrance = ref(true)
const registryListIntroClass = computed(() => {
  if (introPhase.value === 'prep') return 'registry-list-intro-prep'
  if (introPhase.value === 'run') return 'registry-list-intro-run'
  return ''
})

// ==================== 分类管理 ====================
const categoryManage = useCategoryManage()
const {
  categoryByRegistry,
  categoryLabels,
  categoryExpanded,
  presetCategoryLabel,
  uncategorizedLabel,
  applyStoredOrderForCategory,
  getOrderedRegistryNamesInCategory,
  getRegistryCategory,
  pruneRegistryOrder,
  reorderStorageAfterCrossCategoryMove,
  commitRegistryOrderWithinCategory,
  isCategoryExpanded,
  toggleCategoryExpanded,
  expandAllCategories: expandAll,
  collapseAllCategories: collapseAll,
  isUncategorizedCategory,
  moveRegistryToCategory,
  saveCategoryFromDialog,
  showCategoryManageDialog,
  categoryManageDraftLabels,
  newCategoryLabel,
  newCategoryLabelInputRef,
  editingCategoryLabel,
  categoryRenameInputs,
  getCategoryRenameRefCallback,
  openCategoryManageDialog,
  applyCategoryManageDraftAndClose,
  closeCategoryManageDialogWithoutSave,
  onCategoryManageDialogClosed,
  focusNewCategoryLabelInput,
  addCategoryLabel,
  addCategoryLabelToDraft,
  startRenameCategory,
  cancelRenameCategory,
  persistRenamedCategory,
  confirmRenameInManageDraft,
  deleteCategoryLabel,
} = categoryManage

// ==================== 拖拽排序 ====================
const dragSort = useRegistryDragSort({
  categoryExpanded,
  isCategoryExpanded,
  getOrderedRegistryNamesInCategory,
  moveRegistryToCategory,
  reorderStorageAfterCrossCategoryMove,
  commitRegistryOrderWithinCategory,
  getRegistryCategory,
})

const {
  pointerDragRegistryName,
  pointerDragSourceCategory,
  registrySortDropIndex,
  registrySortActive,
  isPointerDragging,
  ghostPosition,
  ghostTransition,
  suppressNextClick,
  dragOverCategoryLabel,
  draggingRegistry,
  manageDragLabel,
  isManageDragging,
  manageDropIndex,
  categoryManageScrollRef,
  manageGhostPosition,
  onRegistryMouseDown,
  onCategoryMouseEnter,
  startManageDrag,
} = dragSort

// ==================== UI 状态 ====================
const showDialog = ref(false)
const editingRegistry = ref<Registry | null>(null)
const showDetailDialog = ref(false)
const selectedRegistry = ref<Registry | null>(null)
const testingByRegistry = ref<Record<string, boolean>>({})

// 右键菜单状态
const contextMenu = ref<{ x: number; y: number; registry: Registry } | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const categoryContextMenu = ref<{ x: number; y: number; label: string } | null>(null)
const categoryContextMenuRef = ref<HTMLElement | null>(null)

// 分类上下文提示对话框
const showCategoryContextPromptDialog = ref(false)
const categoryContextPromptMode = ref<'rename' | 'create' | null>(null)
const categoryContextPromptRenameFrom = ref<string | null>(null)
const categoryContextPromptInput = ref('')

const categoryContextPromptTitle = computed(() => {
  if (categoryContextPromptMode.value === 'rename') return t('registryList.categoryContext.renameTitle')
  if (categoryContextPromptMode.value === 'create') return t('registryList.categoryContext.createTitle')
  return ''
})

const categoryContextPromptHint = computed(() => {
  if (categoryContextPromptMode.value === 'rename') return t('registryList.categoryContext.renamePrompt')
  if (categoryContextPromptMode.value === 'create') return t('registryList.categoryContext.createPrompt')
  return ''
})

// ==================== 分组计算 ====================
const groupedRegistries = computed((): GroupedRegistries[] => {
  const ucat = uncategorizedLabel.value
  const groups: Record<string, Registry[]> = {}
  for (const label of categoryLabels.value) {
    groups[label] = []
  }
  for (const registry of filteredRegistries.value) {
    const assignedCategory = categoryByRegistry.value[registry.name]
    const category = assignedCategory || (registry.is_custom ? ucat : categoryLabels.value.includes(presetCategoryLabel.value) ? presetCategoryLabel.value : ucat)
    if (!groups[category]) groups[category] = []
    groups[category].push(registry)
  }
  const labels = Object.keys(groups)
  const orderedLabels = labels
    .filter(label => label !== ucat)
    .sort((a, b) => {
      const ai = categoryLabels.value.indexOf(a)
      const bi = categoryLabels.value.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  if (labels.includes(ucat)) orderedLabels.push(ucat)
  return orderedLabels.map(label => ({
    label,
    items: applyStoredOrderForCategory(label, groups[label]),
  }))
})

// ==================== 分类折叠状态 ====================
function isCategoryExpandedLocal(label: string): boolean {
  return isCategoryExpanded(label, holdCategoriesCollapsedUntilEntrance.value)
}

function toggleCategoryExpandedLocal(label: string) {
  toggleCategoryExpanded(label, holdCategoriesCollapsedUntilEntrance.value)
}

function expandAllCategories() {
  expandAll(groupedRegistries.value)
}

function collapseAllCategories() {
  collapseAll(groupedRegistries.value)
}

const categoryFoldActionsDisabled = computed(() => loading.value || holdCategoriesCollapsedUntilEntrance.value)

// ==================== 搜索自动展开 ====================
watch(
  () => searchQuery.value.trim(),
  q => {
    if (!q) return
    const next = { ...categoryExpanded.value }
    for (const g of groupedRegistries.value) {
      if (g.items.length > 0) next[g.label] = true
    }
    categoryExpanded.value = next
  }
)

// ==================== 分类管理拖拽 ====================
const categoryManageDragSlots = computed((): ManageCategorySlot[] => {
  const labels = categoryManageDraftLabels.value
  const drag = manageDragLabel.value
  if (!isManageDragging.value || !drag) {
    return labels.map(label => ({ kind: 'row' as const, label }))
  }
  const rest = labels.filter(l => l !== drag)
  const k = Math.min(Math.max(manageDropIndex.value, 0), rest.length)
  const ordered = [...rest.slice(0, k), drag, ...rest.slice(k)]
  return ordered.map(label => ({
    kind: 'row' as const,
    label,
    isDragPreview: label === drag,
  }))
})

function onStartManageDrag(label: string, event: MouseEvent) {
  startManageDrag(label, event)
  manageDropIndex.value = categoryManageDraftLabels.value.indexOf(label)
}

// 注意：事件监听已在 useRegistryDragSort composable 中处理

// ==================== 源操作 ====================
function handleSwitch(registry: Registry) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  if (currentRegistry.value?.name === registry.name) return
  store.switchRegistry(registry.name)
}

function openAdd() {
  editingRegistry.value = null
  showDialog.value = true
}

function openEdit(registry: Registry) {
  editingRegistry.value = registry
  showDialog.value = true
  contextMenu.value = null
}

function openDetail(registry: Registry) {
  selectedRegistry.value = registry
  showDetailDialog.value = true
}

async function handleDelete(registry: Registry) {
  contextMenu.value = null
  try {
    const { ElMessageBox } = await import('element-plus')
    await ElMessageBox.confirm(t('registryList.confirmDeleteContent', { name: registry.name }), t('registryList.confirmDeleteTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      customClass: 'category-delete-confirm-messagebox',
      confirmButtonClass: 'category-delete-confirm-messagebox__btn-confirm',
      cancelButtonClass: 'category-delete-confirm-messagebox__btn-cancel',
      showClose: false,
      closeOnClickModal: false,
      distinguishCancelAndClose: true,
    })
    await store.deleteRegistry(registry.name)
    pruneRegistryOrder(registry.name)
  } catch {
    // cancelled
  }
}

async function handleTest(registry: Registry) {
  testingByRegistry.value = {
    ...testingByRegistry.value,
    [registry.name]: true,
  }
  try {
    const result = await testSingleSpeed(registry.name)
    store.setSingleLatencyResult(result)
    if (result.latency_ms !== null) {
      ElMessage.success(t('speedTest.toastOk', { name: registry.name, ms: result.latency_ms }))
      return
    }
    ElMessage.warning(formatLatencyErrorMessage(t, result.error))
  } catch (error) {
    ElMessage.error(t('speedTest.runError', { detail: truncateSpeedTestRunError(String(error)) }))
  } finally {
    testingByRegistry.value = {
      ...testingByRegistry.value,
      [registry.name]: false,
    }
  }
}

// ==================== 右键菜单 ====================
function onContextMenu(e: MouseEvent, registry: Registry) {
  e.preventDefault()
  categoryContextMenu.value = null
  contextMenu.value = { x: e.clientX, y: e.clientY, registry }
}

function onCategoryContextMenu(e: MouseEvent, label: string) {
  e.preventDefault()
  contextMenu.value = null
  categoryContextMenu.value = { x: e.clientX, y: e.clientY, label }
  void nextTick(() => {
    const menu = categoryContextMenuRef.value
    const current = categoryContextMenu.value
    if (!menu || !current) return
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const pad = 8
    const maxX = Math.max(pad, viewportW - menu.offsetWidth - pad)
    const maxY = Math.max(pad, viewportH - menu.offsetHeight - pad)
    categoryContextMenu.value = {
      ...current,
      x: Math.min(Math.max(current.x, pad), maxX),
      y: Math.min(Math.max(current.y, pad), maxY),
    }
  })
}

onClickOutside(contextMenuRef, () => { contextMenu.value = null })
onClickOutside(categoryContextMenuRef, () => { categoryContextMenu.value = null })

// 右键菜单操作
function openCategoryContextPrompt(mode: 'rename' | 'create', renameFromLabel?: string) {
  categoryContextPromptMode.value = mode
  categoryContextPromptRenameFrom.value = mode === 'rename' && renameFromLabel ? renameFromLabel : null
  categoryContextPromptInput.value = mode === 'rename' && renameFromLabel ? renameFromLabel : ''
  showCategoryContextPromptDialog.value = true
}

function closeCategoryContextPrompt() {
  showCategoryContextPromptDialog.value = false
}

function onCategoryContextPromptDialogClosed() {
  categoryContextPromptMode.value = null
  categoryContextPromptRenameFrom.value = null
  categoryContextPromptInput.value = ''
}

function confirmCategoryContextPrompt() {
  if (categoryContextPromptMode.value === 'rename' && categoryContextPromptRenameFrom.value) {
    const label = categoryContextPromptRenameFrom.value
    categoryRenameInputs.value = {
      ...categoryRenameInputs.value,
      [label]: categoryContextPromptInput.value,
    }
    editingCategoryLabel.value = label
    persistRenamedCategory(label)
    if (editingCategoryLabel.value === null) {
      closeCategoryContextPrompt()
    }
    return
  }
  if (categoryContextPromptMode.value === 'create') {
    newCategoryLabel.value = categoryContextPromptInput.value
    if (addCategoryLabel()) {
      closeCategoryContextPrompt()
    }
  }
}

function renameCategoryFromContext(label: string) {
  categoryContextMenu.value = null
  if (isUncategorizedCategory(label)) return
  openCategoryContextPrompt('rename', label)
}

function createCategoryFromContext() {
  categoryContextMenu.value = null
  openCategoryContextPrompt('create')
}

async function deleteCategoryFromContext(label: string) {
  categoryContextMenu.value = null
  if (isUncategorizedCategory(label)) return
  await deleteCategoryLabel(label)
}

async function onDeleteCategoryFromContextClick(label: string) {
  if (isUncategorizedCategory(label)) {
    ElMessage.info(t('registryList.categoryContext.deleteDisabledHint'))
    return
  }
  await deleteCategoryFromContext(label)
}

function toggleCategoryFromContext(label: string) {
  toggleCategoryExpandedLocal(label)
  categoryContextMenu.value = null
}

function openCategoryManageFromContext() {
  categoryContextMenu.value = null
  openCategoryManageDialog()
}

// ==================== 延迟显示 ====================
function getLatencyText(name: string): string {
  const latency = latencyResults.value[name]
  if (!latency) return t('speedTest.notTested')
  if (latency.latency_ms !== null) return `${latency.latency_ms}ms`
  return formatLatencyErrorMessage(t, latency.error, 120)
}

function latencyFailLabel(error: string | null | undefined): string {
  return formatLatencyErrorMessage(t, error, 14)
}

// ==================== 复制功能 ====================
async function copyText(content: string, label: string) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success(t('registryList.detail.copied', { label }))
  } catch (error) {
    ElMessage.error(t('registryList.detail.copyFailed', { error: String(error) }))
  }
}

function copyDetailField(field: 'name' | 'url' | 'latency') {
  if (!selectedRegistry.value) return
  if (field === 'name') {
    copyText(selectedRegistry.value.name, t('registryList.detail.copyLabel.name'))
    return
  }
  if (field === 'url') {
    copyText(selectedRegistry.value.url, t('registryList.detail.copyLabel.url'))
    return
  }
  copyText(getLatencyText(selectedRegistry.value.name), t('registryList.detail.copyLabel.latency'))
}

function copyAllDetails() {
  if (!selectedRegistry.value) return
  const registry = selectedRegistry.value
  const detailText = [
    t('registryList.detail.copyAll.name', { value: registry.name }),
    t('registryList.detail.copyAll.url', { value: registry.url }),
    t('registryList.detail.copyAll.latency', { value: getLatencyText(registry.name) }),
    t('registryList.detail.copyAll.category', { value: getRegistryCategory(registry) }),
  ].join('\n')
  copyText(detailText, t('registryList.detail.copyLabel.detail'))
}

// ==================== 分组槽位 ====================
function getRegistrySlotsForGroup(group: { label: string; items: Registry[] }): RegistrySlot[] {
  const dragName = pointerDragRegistryName.value
  const srcCat = pointerDragSourceCategory.value
  if (!isPointerDragging.value || !registrySortActive.value || !dragName || srcCat !== group.label || searchQuery.value.trim()) {
    return group.items.map(registry => ({ registry }))
  }
  const restItems = group.items.filter(r => r.name !== dragName)
  const dragItem = group.items.find(r => r.name === dragName)
  if (!dragItem) return group.items.map(registry => ({ registry }))
  const k = Math.min(Math.max(registrySortDropIndex.value, 0), restItems.length)
  const ordered = [...restItems.slice(0, k), dragItem, ...restItems.slice(k)]
  return ordered.map(registry => ({
    registry,
    isDragPreview: registry.name === dragName,
  }))
}

function registryFlipTransitionName(categoryLabel: string): string {
  return registrySortActive.value && pointerDragSourceCategory.value === categoryLabel && isPointerDragging.value ? 'reg-sort-flip' : 'reg-sort-idle'
}

// ==================== 初始化 ====================
onMounted(async () => {
  await entranceSettled
  holdCategoriesCollapsedUntilEntrance.value = false
  expandAllCategories()
})
</script>

<template>
  <div
    class="registry-list-root flex flex-col h-full min-h-0"
    :class="[
      registryListIntroClass,
      {
        'registry-list-root--dragging': isPointerDragging || isManageDragging || manageDragLabel,
        'registry-list-root--pointer-dragging': isPointerDragging,
        'registry-list-root--registry-sort-dragging': registrySortActive && isPointerDragging,
      },
    ]"
  >
    <!-- Header -->
    <div class="rl-intro-header flex items-center gap-2 px-4 pt-4 pb-2">
      <h2 class="text-base font-bold">{{ t('registryList.title') }}</h2>
      <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">
        {{ filteredRegistries.length }}
      </span>
      <el-button text size="small" @click="openCategoryManageDialog">
        <el-icon class="mr-1"><Setting /></el-icon>
        {{ t('registryList.categoryManage') }}
      </el-button>
    </div>

    <!-- Search + 折叠控制 -->
    <div class="rl-intro-search px-4 pb-1">
      <div class="flex items-center gap-2 min-w-0">
        <el-input v-model="searchQuery" class="registry-search-field flex-1 min-w-0" :placeholder="t('registryList.searchPlaceholder')" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="registry-fold-toolbar inline-flex shrink-0 items-stretch rounded-md overflow-hidden" role="group">
          <el-tooltip :content="t('registryList.expandAllCategories')" placement="top" :show-after="280" popper-class="registry-fold-tooltip">
            <el-button text class="registry-fold-btn" :disabled="categoryFoldActionsDisabled" :aria-label="t('registryList.expandAllCategories')" @click="expandAllCategories">
              <el-icon class="text-[17px]"><Expand /></el-icon>
            </el-button>
          </el-tooltip>
          <span class="registry-fold-split" aria-hidden="true" />
          <el-tooltip :content="t('registryList.collapseAllCategories')" placement="top" :show-after="280" popper-class="registry-fold-tooltip">
            <el-button text class="registry-fold-btn" :disabled="categoryFoldActionsDisabled" :aria-label="t('registryList.collapseAllCategories')" @click="collapseAllCategories">
              <el-icon class="text-[17px]"><Fold /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- List -->
    <div class="rl-intro-body flex flex-col flex-1 min-h-0 overflow-hidden px-2 mb-2">
      <el-scrollbar class="app-scrollbar min-h-0 flex-1 h-0 w-full">
        <div v-if="loading" class="flex flex-col gap-2 p-2">
          <div v-for="i in 6" :key="i" class="registry-list-skeleton-shimmer h-14 rounded-lg animate-pulse"></div>
        </div>

        <div v-else-if="filteredRegistries.length === 0" class="flex-center py-10 text-sm text-gray-400">
          {{ t('registryList.empty') }}
        </div>

        <div v-else class="flex flex-col gap-2 p-1">
          <div
            v-for="group in groupedRegistries"
            :key="group.label"
            :data-registry-category-host="group.label"
            :class="[
              'relative flex flex-col gap-2 rounded border border-transparent transition-colors',
              {
                'bg-gray-50 border-primary/60 shadow-sm': dragOverCategoryLabel === group.label && isPointerDragging && pointerDragSourceCategory && dragOverCategoryLabel !== pointerDragSourceCategory,
              },
            ]"
            @mouseenter="onCategoryMouseEnter(group.label)"
          >
            <div
              :class="[
                'px-1.5 pt-0.5 text-xs font-semibold text-gray-400 cursor-pointer select-none flex items-center gap-1 rounded',
                {
                  'bg-gray-100': dragOverCategoryLabel === group.label && pointerDragSourceCategory && dragOverCategoryLabel !== pointerDragSourceCategory,
                },
              ]"
              @click="toggleCategoryExpandedLocal(group.label)"
              @contextmenu="onCategoryContextMenu($event, group.label)"
            >
              <span class="category-row-chevron text-gray-400" :class="{ 'is-expanded': isCategoryExpandedLocal(group.label) }" aria-hidden="true">▸</span>
              <span>{{ group.label }} ({{ group.items.length }})</span>
            </div>
            <div
              v-if="dragOverCategoryLabel === group.label && isPointerDragging && pointerDragSourceCategory && dragOverCategoryLabel !== pointerDragSourceCategory"
              class="category-drop-overlay absolute inset-0 z-20 pointer-events-none rounded-lg bg-white/55 border border-primary/25 backdrop-blur-[2px] flex items-center justify-center"
            >
              <div class="category-drop-hint px-3.5 py-2 text-xs font-medium text-primary bg-white/88 rounded-lg border border-white shadow-sm flex items-center gap-1.5">
                <span class="text-[11px]">↳</span>
                <span>{{ t('registryList.dropHint', { label: group.label }) }}</span>
              </div>
            </div>
            <div class="reg-category-fold-shell" :class="{ 'reg-category-fold-shell--open': isCategoryExpandedLocal(group.label) }">
              <div class="reg-category-fold-inner flex flex-col gap-2.5">
                <transition-group :name="registryFlipTransitionName(group.label)" tag="div" class="flex flex-col gap-2.5">
                  <div
                    v-for="slot in getRegistrySlotsForGroup(group)"
                    :key="slot.registry.name"
                    :data-registry-sort-row="slot.registry.name"
                    :class="[
                      'registry-item flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer border-l-3 border-transparent select-none cursor-grab',
                      {
                        'is-active': currentRegistry?.name === slot.registry.name,
                        'is-idle': currentRegistry?.name !== slot.registry.name,
                        'opacity-40 cursor-grabbing': pointerDragRegistryName === slot.registry.name && isPointerDragging && !slot.isDragPreview,
                        'registry-item--sort-preview': slot.isDragPreview,
                      },
                    ]"
                    @click="handleSwitch(slot.registry)"
                    @mousedown.left="onRegistryMouseDown(slot.registry, $event)"
                    @dblclick.stop="openEdit(slot.registry)"
                    @contextmenu="onContextMenu($event, slot.registry)"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span :class="['text-sm font-semibold truncate', { 'text-primary': currentRegistry?.name === slot.registry.name }]">
                          {{ slot.registry.name }}
                        </span>
                      </div>
                      <div class="text-xs text-gray-400 truncate mt-0.5">
                        {{ slot.registry.url }}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                      <template v-if="latencyResults[slot.registry.name]">
                        <span class="text-xs font-mono font-medium" :style="{ color: latencyBarColor(latencyResults[slot.registry.name].latency_ms) }">
                          <template v-if="latencyResults[slot.registry.name].latency_ms !== null"> {{ latencyResults[slot.registry.name].latency_ms }}ms </template>
                          <template v-else class="text-gray-400">
                            {{ latencyFailLabel(latencyResults[slot.registry.name].error) }}
                          </template>
                        </span>
                        <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: latencyBarColor(latencyResults[slot.registry.name].latency_ms) }"></span>
                      </template>
                      <div v-else-if="currentRegistry?.name === slot.registry.name" class="w-2 h-2 rounded-full" style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"></div>
                      <div class="w-8 h-8 flex items-center justify-center flex-shrink-0" @mousedown.stop>
                        <el-button link size="small" class="registry-speed-btn registry-speed-btn-fixed" :loading="!!testingByRegistry[slot.registry.name]" :disabled="!!testingByRegistry[slot.registry.name]" @click.stop="handleTest(slot.registry)">
                          <el-icon v-if="!testingByRegistry[slot.registry.name]" class="text-base leading-none">
                            <RefreshRight />
                          </el-icon>
                        </el-button>
                      </div>
                    </div>
                  </div>
                </transition-group>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- Footer -->
    <div class="px-4 py-2.5 border-t border-gray-100">
      <el-button type="primary" class="w-full registry-add-btn" @click="openAdd">
        {{ t('registryList.addSource') }}
      </el-button>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div v-if="contextMenu" ref="contextMenuRef" class="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-36" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="openDetail(contextMenu.registry); contextMenu = null">
          {{ t('registryList.context.viewDetail') }}
        </div>
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="openEdit(contextMenu.registry)">
          {{ t('registryList.context.edit') }}
        </div>
        <div class="context-menu-item context-menu-item--danger px-3 py-2 text-sm cursor-pointer text-red-500" @click="handleDelete(contextMenu.registry)">
          {{ t('registryList.context.delete') }}
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="categoryContextMenu" ref="categoryContextMenuRef" class="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-44" :style="{ left: categoryContextMenu.x + 'px', top: categoryContextMenu.y + 'px' }">
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="toggleCategoryFromContext(categoryContextMenu.label)">
          {{ isCategoryExpandedLocal(categoryContextMenu.label) ? t('registryList.categoryContext.collapse') : t('registryList.categoryContext.expand') }}
        </div>
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="createCategoryFromContext">
          {{ t('registryList.categoryContext.create') }}
        </div>
        <div :class="['context-menu-item px-3 py-2 text-sm cursor-pointer', { 'opacity-40 pointer-events-none': isUncategorizedCategory(categoryContextMenu.label) }]" @click="renameCategoryFromContext(categoryContextMenu.label)">
          {{ t('registryList.categoryContext.rename') }}
        </div>
        <div class="h-px mx-2 my-1 bg-gray-100"></div>
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="openCategoryManageFromContext">
          {{ t('registryList.categoryContext.manage') }}
        </div>
        <div
          :class="[
            'context-menu-item context-menu-item--danger px-3 py-2 text-sm text-red-500',
            isUncategorizedCategory(categoryContextMenu.label) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
          ]"
          :title="isUncategorizedCategory(categoryContextMenu.label) ? t('registryList.categoryContext.deleteDisabledHint') : ''"
          @click="onDeleteCategoryFromContextClick(categoryContextMenu.label)"
        >
          {{ t('registryList.categoryContext.delete') }}
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Dialog -->
    <RegistryDialog :visible="showDialog" :registry="editingRegistry" :category-labels="categoryLabels" :current-category="editingRegistry ? categoryByRegistry[editingRegistry.name] || '' : ''" @save-category="saveCategoryFromDialog" @close="showDialog = false" />

    <el-dialog v-model="showCategoryContextPromptDialog" :title="categoryContextPromptTitle" width="420px" class="app-dialog" :close-on-click-modal="false" destroy-on-close @closed="onCategoryContextPromptDialogClosed">
      <p class="text-sm text-gray-500 mb-3 m-0">{{ categoryContextPromptHint }}</p>
      <el-input v-model="categoryContextPromptInput" :maxlength="CATEGORY_LABEL_MAX_LENGTH" show-word-limit clearable @keyup.enter="confirmCategoryContextPrompt" />
      <template #footer>
        <el-button @click="closeCategoryContextPrompt">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmCategoryContextPrompt">
          {{ categoryContextPromptMode === 'create' ? t('categoryDialog.add') : t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCategoryManageDialog" :title="t('categoryDialog.title')" width="520px" class="category-manage-dialog app-dialog" modal-class="category-manage-modal" align-center :close-on-click-modal="false" @opened="focusNewCategoryLabelInput" @closed="onCategoryManageDialogClosed">
      <div class="category-manage-content">
        <div class="category-create-row">
          <el-input ref="newCategoryLabelInputRef" v-model="newCategoryLabel" :placeholder="t('categoryDialog.newPlaceholder')" :maxlength="CATEGORY_LABEL_MAX_LENGTH" show-word-limit clearable @keyup.enter="addCategoryLabelToDraft" />
          <el-button class="category-create-btn category-create-btn--add" @click="addCategoryLabelToDraft">
            {{ t('categoryDialog.add') }}
          </el-button>
        </div>
        <div v-if="categoryManageDraftLabels.length === 0" class="category-empty-state">
          {{ t('categoryDialog.empty') }}
        </div>
        <div v-else ref="categoryManageScrollRef" class="category-list-scroll-host">
          <TransitionGroup :name="isManageDragging ? 'cat-manage-flip' : 'cat-manage-idle'" tag="div" class="category-list-wrap">
            <div v-for="slot in categoryManageDragSlots" :key="slot.label" class="category-manage-flip-item" :data-manage-row-label="slot.label">
              <div
                :class="[
                  'category-list-row',
                  {
                    'category-list-row--drag-preview': slot.isDragPreview,
                  },
                ]"
              >
                <div class="category-drag-handle" @mousedown.left.stop.prevent="onStartManageDrag(slot.label, $event)" :title="t('categoryDialog.dragSort')">
                  <el-icon><Rank /></el-icon>
                </div>
                <el-input :ref="getCategoryRenameRefCallback(slot.label)" v-model="categoryRenameInputs[slot.label]" class="category-input" :maxlength="CATEGORY_LABEL_MAX_LENGTH" show-word-limit :disabled="editingCategoryLabel !== slot.label" />
                <div class="category-row-actions">
                  <el-button size="small" :disabled="editingCategoryLabel !== null && editingCategoryLabel !== slot.label" @click="editingCategoryLabel === slot.label ? cancelRenameCategory(slot.label) : startRenameCategory(slot.label)">
                    {{ editingCategoryLabel === slot.label ? t('common.cancel') : t('categoryDialog.rename') }}
                  </el-button>
                  <el-button v-if="editingCategoryLabel === slot.label" size="small" type="primary" @click="confirmRenameInManageDraft(slot.label)">
                    {{ t('common.confirm') }}
                  </el-button>
                  <el-button size="small" type="danger" @click="deleteCategoryLabel(slot.label)">
                    <el-icon class="mr-1"><Delete /></el-icon>
                    {{ t('common.delete') }}
                  </el-button>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </div>
      <template #footer>
        <div class="category-manage-dialog-footer">
          <el-button class="category-manage-dialog-footer__close" @click="closeCategoryManageDialogWithoutSave">{{ t('common.close') }}</el-button>
          <el-button type="primary" @click="applyCategoryManageDraftAndClose">{{ t('categoryDialog.footerSave') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Registry Detail Dialog -->
    <el-dialog v-model="showDetailDialog" :title="t('registryList.detail.title')" width="520px" :close-on-click-modal="true" destroy-on-close>
      <div v-if="selectedRegistry" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">{{ t('registryList.detail.name') }}</div>
            <div class="text-sm font-semibold break-all">{{ selectedRegistry.name }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('name')">{{ t('common.copy') }}</el-button>
        </div>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs text-gray-400">{{ t('registryList.detail.url') }}</div>
            <div class="text-sm break-all">{{ selectedRegistry.url }}</div>
          </div>
          <el-button text size="small" @click="copyDetailField('url')">{{ t('common.copy') }}</el-button>
        </div>
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-400">{{ t('registryList.detail.latency') }}</div>
            <div class="text-sm font-mono" :style="{ color: latencyBarColor(latencyResults[selectedRegistry.name]?.latency_ms ?? null) }">
              {{ getLatencyText(selectedRegistry.name) }}
            </div>
          </div>
          <el-button text size="small" @click="copyDetailField('latency')">{{ t('common.copy') }}</el-button>
        </div>
        <div>
          <div class="text-xs text-gray-400">{{ t('registryList.detail.category') }}</div>
          <div class="text-sm">{{ getRegistryCategory(selectedRegistry) }}</div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
          <el-button type="primary" @click="copyAllDetails">{{ t('registryList.detail.copyAll') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Dragging Ghost -->
    <Teleport to="body">
      <div
        v-if="isPointerDragging && draggingRegistry"
        class="fixed z-[9999] pointer-events-none registry-item flex items-center justify-between px-3 py-3 rounded-lg border-l-3 border-primary bg-white shadow-lg min-w-62 max-w-88"
        :style="{
          left: '0px',
          top: '0px',
          transform: `translate(${ghostPosition.x}px, ${ghostPosition.y}px)`,
          transition: ghostTransition,
        }"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-semibold truncate">{{ draggingRegistry.name }}</span>
          </div>
          <div class="text-xs text-gray-400 truncate mt-0.5">{{ draggingRegistry.url }}</div>
        </div>
        <div class="flex items-center gap-2 ml-2 flex-shrink-0">
          <template v-if="latencyResults[draggingRegistry.name]">
            <span class="text-xs font-mono font-medium" :style="{ color: latencyBarColor(latencyResults[draggingRegistry.name].latency_ms) }">
              <template v-if="latencyResults[draggingRegistry.name].latency_ms !== null"> {{ latencyResults[draggingRegistry.name].latency_ms }}ms </template>
              <template v-else>{{ latencyFailLabel(latencyResults[draggingRegistry.name].error) }}</template>
            </span>
            <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: latencyBarColor(latencyResults[draggingRegistry.name].latency_ms) }"></span>
          </template>
          <div v-else-if="currentRegistry?.name === draggingRegistry.name" class="w-2 h-2 rounded-full" style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"></div>
        </div>
      </div>
    </Teleport>

    <!-- Category Manage Drag Ghost -->
    <Teleport to="body">
      <div
        v-if="isManageDragging && manageDragLabel"
        class="category-manage-drag-ghost fixed z-[10000] pointer-events-none"
        :style="{
          left: '0px',
          top: '0px',
          transform: `translate(${manageGhostPosition.x}px, ${manageGhostPosition.y}px)`,
        }"
      >
        <div class="category-manage-drag-ghost-inner flex items-center gap-2 text-sm font-semibold">
          <el-icon class="category-manage-drag-ghost-icon"><Rank /></el-icon>
          <span class="truncate">{{ manageDragLabel }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.registry-list-root--dragging,
.registry-list-root--dragging * {
  user-select: none !important;
  -webkit-user-select: none !important;
}

.registry-fold-toolbar {
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 88%, transparent);
  background: color-mix(in srgb, var(--el-fill-color-lighter) 50%, var(--el-fill-color-blank) 50%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.registry-fold-split {
  width: 1px;
  align-self: stretch;
  min-height: 1.1rem;
  margin: 0.2rem 0;
  background: color-mix(in srgb, var(--el-border-color-lighter) 90%, transparent);
  flex-shrink: 0;
}

.registry-fold-btn.el-button.is-text {
  margin: 0;
  padding: 0.2rem 0.45rem;
  min-width: 2rem;
  height: 2rem;
  border-radius: 0;
  color: var(--el-text-color-secondary);
}

.registry-fold-btn.el-button.is-text:not(.is-disabled):hover {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 9%, transparent);
}

.registry-fold-btn.el-button.is-text:not(.is-disabled):focus-visible {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 11%, transparent);
}

:global(html.dark) .registry-fold-toolbar {
  border-color: var(--el-border-color);
  background: var(--el-fill-color-blank);
  box-shadow: 0 1px 0 var(--app-separator);
}

:global(html.dark) .registry-fold-split {
  background: var(--app-separator);
}

:global(html.dark) .registry-fold-btn.el-button.is-text:not(.is-disabled):hover {
  background: color-mix(in srgb, var(--el-color-primary) 14%, var(--el-fill-color-blank));
}

:global(html.dark .registry-fold-tooltip.el-popper) {
  background: linear-gradient(160deg, #2b3140, #343b4d) !important;
  border: none !important;
  color: #f5f7fa !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35) !important;
}

:global(html.dark .registry-fold-tooltip.el-popper[data-popper-placement^='top'] .el-popper__arrow:before),
:global(html.dark .registry-fold-tooltip.el-popper[data-popper-placement^='top'] .el-popper__arrow::before) {
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
  border: 5px solid transparent !important;
  border-bottom: 0 !important;
  border-top-color: #343b4d !important;
  transform: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  top: auto !important;
  bottom: 0 !important;
  left: 0 !important;
  right: auto !important;
  margin: 0 !important;
}

.registry-speed-btn.el-button.is-link {
  background-color: transparent !important;
}
.registry-speed-btn.el-button.is-link:hover,
.registry-speed-btn.el-button.is-link:focus {
  background-color: transparent !important;
}
.registry-speed-btn.el-button.is-link.is-loading::before {
  background-color: transparent !important;
}
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

.category-empty-state {
  width: 100%;
  box-sizing: border-box;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  text-align: center;
  padding: 2.5rem 1.25rem;
  border-radius: var(--app-radius-md);
  border: 0.5px dashed color-mix(in srgb, var(--app-separator) 95%, var(--el-color-primary) 5%);
  background: color-mix(in srgb, #f2f2f7 88%, #ffffff 12%);
  line-height: 1.45;
}

.category-list-scroll-host {
  width: 100%;
  max-height: 19rem;
  overflow-y: auto;
  overflow-x: hidden;
  overflow-anchor: none;
  box-sizing: border-box;
}

.category-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  padding: 0.15rem 0 0.35rem;
  box-sizing: border-box;
}

.category-manage-flip-item {
  width: 100%;
  flex-shrink: 0;
}

.cat-manage-flip-enter-active,
.cat-manage-flip-leave-active,
.cat-manage-idle-enter-active,
.cat-manage-idle-leave-active {
  transition: none !important;
}

.cat-manage-flip-enter-from,
.cat-manage-flip-enter-to,
.cat-manage-flip-leave-from,
.cat-manage-flip-leave-to,
.cat-manage-idle-enter-from,
.cat-manage-idle-enter-to,
.cat-manage-idle-leave-from,
.cat-manage-idle-leave-to {
  opacity: 1;
}

.cat-manage-idle-move {
  transition: none !important;
}

.cat-manage-flip-move {
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}

.reg-sort-flip-enter-active,
.reg-sort-flip-leave-active,
.reg-sort-idle-enter-active,
.reg-sort-idle-leave-active {
  transition: none !important;
}

.reg-sort-flip-enter-from,
.reg-sort-flip-enter-to,
.reg-sort-flip-leave-from,
.reg-sort-flip-leave-to,
.reg-sort-idle-enter-from,
.reg-sort-idle-enter-to,
.reg-sort-idle-leave-from,
.reg-sort-idle-leave-to {
  opacity: 1;
}

.reg-sort-idle-move {
  transition: none !important;
}

.reg-sort-flip-move {
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}

.registry-item--sort-preview {
  opacity: 0.5;
}

.registry-item--sort-preview .registry-speed-btn {
  pointer-events: none;
}

.category-list-row--drag-preview {
  opacity: 0.5;
}

.category-list-row--drag-preview .category-drag-handle,
.category-list-row--drag-preview .category-row-actions {
  pointer-events: none;
}

.category-list-row--drag-preview :deep(.el-input__wrapper) {
  pointer-events: none;
}

.category-manage-drag-ghost-inner {
  padding: 0.55rem 0.85rem;
  border-radius: var(--app-radius-md);
  border: 0.5px solid color-mix(in srgb, var(--app-separator) 88%, transparent);
  background: linear-gradient(180deg, #ffffff 0%, #f2f5fa 100%);
  box-shadow:
    0 8px 22px rgba(0, 0, 0, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  min-width: 10rem;
  max-width: min(90vw, 28rem);
  color: var(--el-text-color-primary);
}

.category-manage-drag-ghost-icon {
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.category-list-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.55rem 0.6rem;
  border-radius: var(--app-radius-md);
  border: 0.5px solid color-mix(in srgb, var(--app-separator) 82%, transparent);
  background: color-mix(in srgb, #ffffff 94%, #f2f2f7 6%);
  transition:
    border-color var(--app-duration-mid) var(--app-ease-spring),
    background-color var(--app-duration-mid) var(--app-ease-spring),
    box-shadow var(--app-duration-mid) var(--app-ease-out);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 1px 3px rgba(0, 0, 0, 0.05);
}

.category-list-row:hover {
  border-color: color-mix(in srgb, var(--el-color-primary) 22%, var(--app-separator));
  background: color-mix(in srgb, #ffffff 88%, var(--el-color-primary-light-9) 12%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    0 4px 14px rgba(0, 122, 255, 0.09);
}

.category-drag-handle {
  width: 1.75rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
  border-radius: 0.55rem;
  cursor: grab;
  flex-shrink: 0;
  transition:
    color var(--app-duration-mid) var(--app-ease-spring),
    background-color var(--app-duration-mid) var(--app-ease-spring),
    transform 0.14s var(--app-ease-spring);
}

.category-drag-handle:active {
  cursor: grabbing;
  transform: scale(0.94);
}

.category-drag-handle:hover {
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-color-primary-light-9) 65%, transparent);
}

.category-input {
  flex: 1;
  min-width: 0;
}

.category-input :deep(.el-input__wrapper) {
  border-radius: 0.72rem;
  transition:
    box-shadow var(--app-duration-mid) var(--app-ease-out),
    background-color var(--app-duration-mid) var(--app-ease-out);
}

.category-row-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.category-row-actions :deep(.el-button) {
  border-radius: 980px;
  font-weight: 500;
  font-size: 0.8125rem;
  letter-spacing: -0.015em;
  padding: 0.32rem 0.72rem;
  min-height: 2rem;
  transition:
    background-color 0.2s var(--app-ease-out),
    border-color 0.2s var(--app-ease-out),
    color 0.2s var(--app-ease-out),
    box-shadow 0.2s var(--app-ease-out),
    transform 0.15s var(--app-ease-spring);
}

.category-row-actions :deep(.el-button:active:not(.is-disabled)) {
  transform: scale(0.97);
}

.category-row-actions :deep(.el-button--primary) {
  background: linear-gradient(180deg, #52a3ff 0%, #0a84ff 52%, #0878eb 100%);
  border: 1px solid color-mix(in srgb, #ffffff 24%, rgba(8, 120, 235, 0.55));
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 2px 10px rgba(10, 132, 255, 0.2);
}

.category-row-actions :deep(.el-button--primary:hover),
.category-row-actions :deep(.el-button--primary:focus) {
  background: linear-gradient(180deg, #62adff 0%, #1b8fff 52%, #0a7ad8 100%);
  border-color: color-mix(in srgb, #ffffff 30%, rgba(27, 143, 255, 0.65));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.32),
    0 4px 14px rgba(10, 132, 255, 0.24);
}

.category-row-actions :deep(.el-button:not(.el-button--primary):not(.el-button--danger)) {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #1d1d1f;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.045);
}

.category-row-actions :deep(.el-button:not(.el-button--primary):not(.el-button--danger):hover),
.category-row-actions :deep(.el-button:not(.el-button--primary):not(.el-button--danger):focus) {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.11);
  color: #000000;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.07);
}

.category-row-actions :deep(.el-button--danger) {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 59, 48, 0.3);
  color: #ff3b30;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.category-row-actions :deep(.el-button--danger:hover),
.category-row-actions :deep(.el-button--danger:focus) {
  background: rgba(255, 59, 48, 0.08);
  border-color: rgba(255, 59, 48, 0.45);
  color: #e62f26;
  box-shadow: 0 2px 8px rgba(255, 59, 48, 0.12);
}

.context-menu-item {
  transition:
    background-color var(--app-duration) var(--app-ease),
    color var(--app-duration) var(--app-ease);
}

.context-menu-item:hover {
  background-color: #f2f2f7;
}

.context-menu-item--danger:hover {
  background-color: #fee2e2;
}

:global(html.dark) .context-menu-item:hover {
  background-color: #3a3a3c;
}

:global(html.dark) .context-menu-item--danger:hover {
  background-color: rgba(255, 59, 48, 0.14);
  color: #ff6961;
}
</style>
