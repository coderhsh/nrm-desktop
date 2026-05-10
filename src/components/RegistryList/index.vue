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
  applyCategoryManageOrder,
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
  applyCategoryManageOrder,
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
  const hasQuery = searchQuery.value.trim().length > 0
  return orderedLabels
    .map(label => ({
      label,
      items: hasQuery ? groups[label] : applyStoredOrderForCategory(label, groups[label]),
    }))
    .filter(g => !hasQuery || g.items.length > 0)
})

// ==================== 搜索自动展开 ====================
const isSearchActive = ref(false)

watch(
  () => searchQuery.value.trim(),
  q => {
    isSearchActive.value = !!q
    if (!q) return
    const cats = new Set<string>()
    for (const r of filteredRegistries.value) {
      const assigned = categoryByRegistry.value[r.name]
      cats.add(assigned || (r.is_custom ? uncategorizedLabel.value : categoryLabels.value.includes(presetCategoryLabel.value) ? presetCategoryLabel.value : uncategorizedLabel.value))
    }
    if (cats.size === 0) return
    const next = { ...categoryExpanded.value }
    for (const label of cats) {
      next[label] = true
    }
    categoryExpanded.value = next
  },
  { flush: 'pre' },
)

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
  startManageDrag(label, event, categoryManageDraftLabels.value)
  manageDropIndex.value = categoryManageDraftLabels.value.indexOf(label)
}

/** 新增分类后自动滚动到底部 */
function handleAddCategoryToDraft() {
  const added = addCategoryLabelToDraft()
  if (added) {
    nextTick(() => {
      const scrollEl = categoryManageScrollRef.value as any
      if (scrollEl) {
        // el-scrollbar 实例上有 scrollTo 方法
        if (typeof scrollEl.scrollTo === 'function') {
          scrollEl.scrollTo({ top: scrollEl.scrollHeight ?? 99999, behavior: 'smooth' })
        } else if (scrollEl.$el) {
          const wrap = scrollEl.$el.querySelector('.el-scrollbar__wrap')
          if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' })
        }
      }
    })
  }
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
        'is-search-active': isSearchActive,
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
                <div class="flex flex-col gap-2.5">
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
                </div>
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
          <el-input ref="newCategoryLabelInputRef" v-model="newCategoryLabel" :placeholder="t('categoryDialog.newPlaceholder')" :maxlength="CATEGORY_LABEL_MAX_LENGTH" show-word-limit clearable @keyup.enter="handleAddCategoryToDraft" />
          <el-button class="category-create-btn category-create-btn--add" @click="handleAddCategoryToDraft">
            {{ t('categoryDialog.add') }}
          </el-button>
        </div>
        <div v-if="categoryManageDraftLabels.length === 0" class="category-empty-state">
          {{ t('categoryDialog.empty') }}
        </div>
        <el-scrollbar v-else ref="categoryManageScrollRef" class="app-scrollbar category-list-scroll-host">
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
        </el-scrollbar>
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

<style scoped lang="less">
@import './index.less';
</style>
