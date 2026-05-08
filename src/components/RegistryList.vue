<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShellIntro } from '@/composables/useShellIntro'
import { onClickOutside, useLocalStorage } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Expand, Fold, Rank, RefreshRight, Search, Setting } from '@element-plus/icons-vue'
import { useRegistryStore } from '@/stores/registry'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY } from '@/composables/useI18n'
import { storeToRefs } from 'pinia'
import type { Registry } from '@/types'
import { testSingleSpeed } from '@/api/speedtest'
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from '@/utils/latency-error-i18n'
import { latencyBarColor } from '@/utils/latency-bar-color'
import RegistryDialog from './RegistryDialog.vue'

const store = useRegistryStore()
const { t, language } = useI18n()
const { introPhase } = useShellIntro()
const registryListIntroClass = computed(() => {
  if (introPhase.value === 'prep') return 'registry-list-intro-prep'
  if (introPhase.value === 'run') return 'registry-list-intro-run'
  return ''
})
const { filteredRegistries, currentRegistry, searchQuery, loading, latencyResults, latencyLoading } = storeToRefs(store)

/** 左侧列表中「未分类」分组标题，随界面语言变化。 */
const uncategorizedLabel = computed(() => t('registryList.uncategorized'))

const defaultPresetLabel = '预设源'
const categoryLabelMaxLength = 20
const categoryByRegistry = useLocalStorage<Record<string, string>>(CATEGORY_BY_REGISTRY_STORAGE_KEY, {})
const categoryLabels = useLocalStorage<string[]>('nrm-desktop-category-labels', [])
const categoryExpanded = useLocalStorage<Record<string, boolean>>('nrm-desktop-category-expanded', {})
const presetCategoryLabel = useLocalStorage<string>('nrm-desktop-preset-category-label', defaultPresetLabel)
if (!categoryLabels.value.includes(presetCategoryLabel.value)) {
  categoryLabels.value = [presetCategoryLabel.value, ...categoryLabels.value]
}

/**
 * 切换语言后，把展开状态与曾显式存成旧文案的「未分类」映射迁移到当前语言的标签。
 */
function migrateUncategorizedCategoryStorage() {
  const cur = uncategorizedLabel.value
  const expanded = { ...categoryExpanded.value }
  let expChanged = false
  for (const legacy of ['未分类', 'Uncategorized'] as const) {
    if (legacy === cur) continue
    if (expanded[legacy] === undefined) continue
    if (expanded[cur] === undefined) expanded[cur] = expanded[legacy]
    delete expanded[legacy]
    expChanged = true
  }
  if (expChanged) categoryExpanded.value = expanded

  const mapping = { ...categoryByRegistry.value }
  let mapChanged = false
  for (const [name, cat] of Object.entries(mapping)) {
    if ((cat === '未分类' || cat === 'Uncategorized') && cat !== cur) {
      delete mapping[name]
      mapChanged = true
    }
  }
  if (mapChanged) categoryByRegistry.value = mapping
}

watch(language, () => {
  migrateUncategorizedCategoryStorage()
})

/**
 * 自定义源（含首次启动合并进来的当前源）不应出现在「预设源」分组下；并清理已不存在源的分类映射。
 */
function normalizeCustomRegistryCategories() {
  const presetCat = presetCategoryLabel.value
  const validNames = new Set(store.registries.map(r => r.name))
  const next = { ...categoryByRegistry.value }
  let changed = false

  for (const key of Object.keys(next)) {
    if (!validNames.has(key)) {
      delete next[key]
      changed = true
    }
  }

  for (const r of store.registries) {
    if (!r.is_custom) continue
    if (next[r.name] === presetCat) {
      delete next[r.name]
      changed = true
    }
  }

  if (changed) categoryByRegistry.value = next
}

watch(
  () => store.registries.map(r => `${r.name}:${r.is_custom}`).join('|'),
  () => {
    normalizeCustomRegistryCategories()
  },
  { immediate: true }
)
const groupedRegistries = computed(() => {
  const ucat = uncategorizedLabel.value
  const groups: Record<string, Registry[]> = {}
  for (const label of categoryLabels.value) {
    groups[label] = []
  }
  for (const registry of filteredRegistries.value) {
    const assignedCategory = categoryByRegistry.value[registry.name]
    const category = assignedCategory || (registry.is_custom ? ucat : categoryLabels.value.includes(presetCategoryLabel.value) ? presetCategoryLabel.value : ucat)
    if (!groups[category]) {
      groups[category] = []
    }
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
  if (labels.includes(ucat)) {
    orderedLabels.push(ucat)
  }
  return orderedLabels.map(label => ({
    label,
    items: groups[label],
  }))
})

const showDialog = ref(false)
const editingRegistry = ref<Registry | null>(null)
const showDetailDialog = ref(false)
const selectedRegistry = ref<Registry | null>(null)
const showCategoryManageDialog = ref(false)
const newCategoryLabel = ref('')
const categoryRenameInputs = ref<Record<string, string>>({})
const testingByRegistry = ref<Record<string, boolean>>({})
const editingCategoryLabel = ref<string | null>(null)
const draggingCategoryLabel = ref<string | null>(null)
const dragOverManageCategoryLabel = ref<string | null>(null)
const manageDragLabel = ref<string | null>(null)
const manageDragStart = ref<{ x: number; y: number } | null>(null)
const isManageDragging = ref(false)
const manageDragSourceRect = ref<{ x: number; y: number } | null>(null)
const manageDragPointerOffset = ref({ x: 0, y: 0 })
const manageGhostPosition = ref({ x: 0, y: 0 })
const manageGhostTransition = ref('none')
const dragOverCategoryLabel = ref<string | null>(null)
const pointerDragRegistryName = ref<string | null>(null)
const isPointerDragging = ref(false)
const pointerStart = ref<{ x: number; y: number } | null>(null)
const pointerPosition = ref({ x: 0, y: 0 })
const dragSourceRect = ref<{ x: number; y: number } | null>(null)
const dragPointerOffset = ref({ x: 0, y: 0 })
const ghostPosition = ref({ x: 0, y: 0 })
const ghostTransition = ref('none')
const suppressNextClick = ref(false)
const contextMenu = ref<{
  x: number
  y: number
  registry: Registry
} | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const categoryContextMenu = ref<{
  x: number
  y: number
  label: string
} | null>(null)
const categoryContextMenuRef = ref<HTMLElement | null>(null)

/** 右键菜单「新建 / 重命名分类」用对话框（MessageBox.prompt 无法展示字数统计） */
const showCategoryContextPromptDialog = ref(false)
const categoryContextPromptMode = ref<'rename' | 'create' | null>(null)
const categoryContextPromptRenameFrom = ref<string | null>(null)
const categoryContextPromptInput = ref('')

const categoryContextPromptTitle = computed(() => {
  if (categoryContextPromptMode.value === 'rename') {
    return t('registryList.categoryContext.renameTitle')
  }
  if (categoryContextPromptMode.value === 'create') {
    return t('registryList.categoryContext.createTitle')
  }
  return ''
})

const categoryContextPromptHint = computed(() => {
  if (categoryContextPromptMode.value === 'rename') {
    return t('registryList.categoryContext.renamePrompt')
  }
  if (categoryContextPromptMode.value === 'create') {
    return t('registryList.categoryContext.createPrompt')
  }
  return ''
})

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

onClickOutside(contextMenuRef, () => {
  contextMenu.value = null
})
onClickOutside(categoryContextMenuRef, () => {
  categoryContextMenu.value = null
})

function debugLogRegistryFoldTooltip(runId: string, hypothesisId: string, message: string, data: Record<string, unknown>) {
  const payload = {
    sessionId: '77e62b',
    runId,
    hypothesisId,
    location: 'src/components/RegistryList.vue:debugLogRegistryFoldTooltip',
    message,
    data,
    timestamp: Date.now(),
  }
  // #region agent log
  fetch('http://127.0.0.1:7699/ingest/c0d39d9f-6e52-430a-89fa-d646e6e3ca47', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '77e62b' }, body: JSON.stringify(payload) }).catch(() => {})
  // #endregion
  // #region agent log
  try {
    navigator.sendBeacon('http://127.0.0.1:7699/ingest/c0d39d9f-6e52-430a-89fa-d646e6e3ca47', JSON.stringify(payload))
  } catch {
    // ignore
  }
  // #endregion
}

function collectFoldTooltipSnapshot(trigger: 'expand' | 'collapse'): Record<string, unknown> {
  const poppers = Array.from(document.querySelectorAll<HTMLElement>('.registry-fold-tooltip.el-popper'))
  const first = poppers[0] ?? null
  const style = first ? window.getComputedStyle(first) : null
  const arrow = first?.querySelector<HTMLElement>('.el-popper__arrow') ?? null
  const arrowBefore = arrow ? window.getComputedStyle(arrow, '::before') : null
  const arrowAfter = arrow ? window.getComputedStyle(arrow, '::after') : null
  return {
    trigger,
    isDark: document.documentElement.classList.contains('dark'),
    popperCount: poppers.length,
    popperClass: first?.className ?? null,
    popperBackground: style?.backgroundColor ?? null,
    popperBorderTopColor: style?.borderTopColor ?? null,
    arrowBeforeBackground: arrowBefore?.backgroundColor ?? null,
    arrowBeforeBorderTopColor: arrowBefore?.borderTopColor ?? null,
    arrowBeforeBorderTopWidth: arrowBefore?.borderTopWidth ?? null,
    arrowAfterBackground: arrowAfter?.backgroundColor ?? null,
    arrowAfterBorderTopColor: arrowAfter?.borderTopColor ?? null,
    arrowAfterBorderTopWidth: arrowAfter?.borderTopWidth ?? null,
  }
}

async function onFoldTooltipShow(trigger: 'expand' | 'collapse') {
  await nextTick()
  requestAnimationFrame(() => {
    debugLogRegistryFoldTooltip('run-tooltip', 'H2', 'fold tooltip shown snapshot', collectFoldTooltipSnapshot(trigger))
  })
}

const draggingRegistry = computed(() => (pointerDragRegistryName.value ? store.registries.find(item => item.name === pointerDragRegistryName.value) || null : null))

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

function isCategoryExpanded(label: string): boolean {
  if (categoryExpanded.value[label] === undefined) return true
  return categoryExpanded.value[label]
}

function toggleCategoryExpanded(label: string) {
  categoryExpanded.value = {
    ...categoryExpanded.value,
    [label]: !isCategoryExpanded(label),
  }
}

function expandAllCategories() {
  debugLogRegistryFoldTooltip('run-tooltip', 'H4', 'expand all clicked', {
    isDark: document.documentElement.classList.contains('dark'),
  })
  const groups = groupedRegistries.value
  if (groups.length === 0) return
  const next = { ...categoryExpanded.value }
  for (const g of groups) {
    next[g.label] = true
  }
  categoryExpanded.value = next
}

function collapseAllCategories() {
  debugLogRegistryFoldTooltip('run-tooltip', 'H4', 'collapse all clicked', {
    isDark: document.documentElement.classList.contains('dark'),
  })
  const groups = groupedRegistries.value
  if (groups.length === 0) return
  const next = { ...categoryExpanded.value }
  for (const g of groups) {
    next[g.label] = false
  }
  categoryExpanded.value = next
}

const categoryFoldActionsDisabled = computed(() => loading.value)

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
    await ElMessageBox.confirm(t('registryList.confirmDeleteContent', { name: registry.name }), t('registryList.confirmDeleteTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await store.deleteRegistry(registry.name)
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

function onContextMenu(e: MouseEvent, registry: Registry) {
  e.preventDefault()
  categoryContextMenu.value = null
  contextMenu.value = { x: e.clientX, y: e.clientY, registry }
}

function onCategoryContextMenu(e: MouseEvent, label: string) {
  e.preventDefault()
  contextMenu.value = null
  categoryContextMenu.value = { x: e.clientX, y: e.clientY, label }
}

function isUncategorizedCategory(label: string): boolean {
  return label === uncategorizedLabel.value
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

function confirmCategoryContextPrompt() {
  if (categoryContextPromptMode.value === 'rename' && categoryContextPromptRenameFrom.value) {
    const label = categoryContextPromptRenameFrom.value
    categoryRenameInputs.value = {
      ...categoryRenameInputs.value,
      [label]: categoryContextPromptInput.value,
    }
    editingCategoryLabel.value = label
    saveRenamedCategory(label)
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

async function deleteCategoryFromContext(label: string) {
  categoryContextMenu.value = null
  if (isUncategorizedCategory(label)) return
  await deleteCategoryLabel(label)
}

function toggleCategoryFromContext(label: string) {
  toggleCategoryExpanded(label)
  categoryContextMenu.value = null
}

function openCategoryManageFromContext() {
  categoryContextMenu.value = null
  openCategoryManageDialog()
}

function getRegistryCategory(registry: Registry): string {
  const ucat = uncategorizedLabel.value
  const assignedCategory = categoryByRegistry.value[registry.name]
  if (assignedCategory) return assignedCategory
  if (registry.is_custom) return ucat
  return categoryLabels.value.includes(presetCategoryLabel.value) ? presetCategoryLabel.value : ucat
}

function moveRegistryToCategory(registryName: string, label: string) {
  const registry = filteredRegistries.value.find(item => item.name === registryName)
  if (!registry) return
  const currentCategory = getRegistryCategory(registry)
  if (currentCategory === label) return

  const next = { ...categoryByRegistry.value }
  if (label === uncategorizedLabel.value) {
    delete next[registry.name]
  } else {
    ensureCategoryLabel(label)
    next[registry.name] = label
  }
  categoryByRegistry.value = next
  if (label !== uncategorizedLabel.value) {
    ElMessage.success(t('registryList.moveToCategorySuccess', { name: registry.name, label }))
  }
}

function onRegistryMouseDown(registry: Registry, event: MouseEvent) {
  if (event.button !== 0) return
  pointerDragRegistryName.value = registry.name
  pointerStart.value = { x: event.clientX, y: event.clientY }
  const current = event.currentTarget as HTMLElement | null
  if (current) {
    const rect = current.getBoundingClientRect()
    dragSourceRect.value = { x: rect.left, y: rect.top }
    dragPointerOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    ghostPosition.value = { x: rect.left, y: rect.top }
  } else {
    dragSourceRect.value = null
    dragPointerOffset.value = { x: 0, y: 0 }
    ghostPosition.value = { x: event.clientX, y: event.clientY }
  }
  ghostTransition.value = 'none'
  isPointerDragging.value = false
}

function onCategoryMouseEnter(label: string) {
  if (!isPointerDragging.value || !pointerDragRegistryName.value) return
  if (!isCategoryExpanded(label)) {
    categoryExpanded.value = {
      ...categoryExpanded.value,
      [label]: true,
    }
  }
  dragOverCategoryLabel.value = label
  document.documentElement.style.setProperty('cursor', 'copy', 'important')
  document.body.style.setProperty('cursor', 'copy', 'important')
}

function clearPointerDragState() {
  pointerDragRegistryName.value = null
  pointerStart.value = null
  dragSourceRect.value = null
  dragPointerOffset.value = { x: 0, y: 0 }
  isPointerDragging.value = false
  dragOverCategoryLabel.value = null
  ghostTransition.value = 'none'
  document.documentElement.style.removeProperty('cursor')
  document.body.style.removeProperty('cursor')
}

function onWindowMouseMove(event: MouseEvent) {
  if (manageDragLabel.value && manageDragStart.value) {
    if (isManageDragging.value) {
      manageGhostTransition.value = 'none'
      manageGhostPosition.value = {
        x: event.clientX - manageDragPointerOffset.value.x,
        y: event.clientY - manageDragPointerOffset.value.y,
      }
      return
    }

    if (!isManageDragging.value) {
      const dx = Math.abs(event.clientX - manageDragStart.value.x)
      const dy = Math.abs(event.clientY - manageDragStart.value.y)
      if (dx + dy >= 4) {
        isManageDragging.value = true
        document.documentElement.style.setProperty('cursor', 'grabbing', 'important')
        document.body.style.setProperty('cursor', 'grabbing', 'important')
        if (manageDragSourceRect.value) {
          manageGhostTransition.value = 'transform 120ms ease-out'
          requestAnimationFrame(() => {
            manageGhostPosition.value = {
              x: event.clientX - manageDragPointerOffset.value.x,
              y: event.clientY - manageDragPointerOffset.value.y,
            }
          })
          return
        }
        manageGhostPosition.value = {
          x: event.clientX - manageDragPointerOffset.value.x,
          y: event.clientY - manageDragPointerOffset.value.y,
        }
      }
    }
    return
  }

  pointerPosition.value = { x: event.clientX, y: event.clientY }
  if (!pointerDragRegistryName.value || !pointerStart.value) return
  if (isPointerDragging.value) {
    ghostTransition.value = 'none'
    ghostPosition.value = {
      x: event.clientX - dragPointerOffset.value.x,
      y: event.clientY - dragPointerOffset.value.y,
    }
    return
  }
  const dx = Math.abs(event.clientX - pointerStart.value.x)
  const dy = Math.abs(event.clientY - pointerStart.value.y)
  if (dx + dy >= 6) {
    isPointerDragging.value = true
    document.documentElement.style.setProperty('cursor', 'grabbing', 'important')
    document.body.style.setProperty('cursor', 'grabbing', 'important')
    if (dragSourceRect.value) {
      ghostTransition.value = 'transform 140ms ease-out'
      requestAnimationFrame(() => {
        ghostPosition.value = {
          x: event.clientX - dragPointerOffset.value.x,
          y: event.clientY - dragPointerOffset.value.y,
        }
      })
      return
    }
    ghostPosition.value = {
      x: event.clientX - dragPointerOffset.value.x,
      y: event.clientY - dragPointerOffset.value.y,
    }
  }
}

function onWindowMouseUp() {
  if (manageDragLabel.value) {
    finishManageDrag()
    document.documentElement.style.removeProperty('cursor')
    document.body.style.removeProperty('cursor')
    return
  }

  if (!pointerDragRegistryName.value) return
  if (isPointerDragging.value && dragOverCategoryLabel.value) {
    moveRegistryToCategory(pointerDragRegistryName.value, dragOverCategoryLabel.value)
    suppressNextClick.value = true
  }
  clearPointerDragState()
}

onMounted(() => {
  debugLogRegistryFoldTooltip('run-tooltip', 'H1', 'registry list mounted', {
    isDark: document.documentElement.classList.contains('dark'),
    locationHref: window.location.href,
  })
  migrateUncategorizedCategoryStorage()
  normalizeCustomRegistryCategories()
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  document.documentElement.style.removeProperty('cursor')
  document.body.style.removeProperty('cursor')
})

function normalizeCategoryLabel(label: string | null | undefined): string {
  if (!label) return ''
  return label.trim().slice(0, categoryLabelMaxLength)
}

function ensureCategoryLabel(label: string) {
  const ucat = uncategorizedLabel.value
  if (!label || label === ucat) return
  if (!categoryLabels.value.includes(label)) {
    categoryLabels.value = [...categoryLabels.value, label]
  }
}

function saveCategoryFromDialog(payload: { oldName: string; newName: string; category: string | null }) {
  const normalized = normalizeCategoryLabel(payload.category)
  const nextMapping = { ...categoryByRegistry.value }
  delete nextMapping[payload.oldName]
  if (normalized) {
    ensureCategoryLabel(normalized)
    nextMapping[payload.newName] = normalized
  }
  /* 成功提示仅在 RegistryDialog 中展示一次，此处不再弹 Toast，避免与「已更新/已添加」重复 */
  categoryByRegistry.value = nextMapping
}

function openCategoryManageDialog() {
  const inputs: Record<string, string> = {}
  for (const label of categoryLabels.value) {
    inputs[label] = label
  }
  categoryRenameInputs.value = inputs
  editingCategoryLabel.value = null
  draggingCategoryLabel.value = null
  dragOverManageCategoryLabel.value = null
  manageDragLabel.value = null
  manageDragStart.value = null
  isManageDragging.value = false
  contextMenu.value = null
  showCategoryManageDialog.value = true
}

function startManageDrag(label: string, event: MouseEvent) {
  if (event.button !== 0) return
  manageDragLabel.value = label
  manageDragStart.value = { x: event.clientX, y: event.clientY }
  const current = event.currentTarget as HTMLElement | null
  if (current) {
    const rect = current.getBoundingClientRect()
    manageDragSourceRect.value = { x: rect.left, y: rect.top }
    manageDragPointerOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    manageGhostPosition.value = { x: rect.left, y: rect.top }
  } else {
    manageDragSourceRect.value = null
    manageDragPointerOffset.value = { x: 0, y: 0 }
    manageGhostPosition.value = { x: event.clientX, y: event.clientY }
  }
  manageGhostTransition.value = 'none'
  isManageDragging.value = false
  dragOverManageCategoryLabel.value = null
}

function onManageRowEnter(label: string) {
  if (!isManageDragging.value || !manageDragLabel.value || manageDragLabel.value === label) {
    return
  }
  dragOverManageCategoryLabel.value = label
}

function finishManageDrag() {
  if (!manageDragLabel.value) return
  if (isManageDragging.value && dragOverManageCategoryLabel.value) {
    const fromLabel = manageDragLabel.value
    const toLabel = dragOverManageCategoryLabel.value
    const fromIndex = categoryLabels.value.indexOf(fromLabel)
    const toIndex = categoryLabels.value.indexOf(toLabel)
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      const nextLabels = [...categoryLabels.value]
      nextLabels.splice(fromIndex, 1)
      nextLabels.splice(toIndex, 0, fromLabel)
      categoryLabels.value = nextLabels
      ElMessage.success(t('categoryDialog.sorted'))
    }
  }
  manageDragLabel.value = null
  manageDragStart.value = null
  isManageDragging.value = false
  dragOverManageCategoryLabel.value = null
  manageDragSourceRect.value = null
  manageDragPointerOffset.value = { x: 0, y: 0 }
  manageGhostTransition.value = 'none'
}

function addCategoryLabel(): boolean {
  const normalized = normalizeCategoryLabel(newCategoryLabel.value)
  if (!normalized) {
    ElMessage.error(t('categoryDialog.nameRequired'))
    return false
  }
  if (normalized === uncategorizedLabel.value || normalized === presetCategoryLabel.value || categoryLabels.value.includes(normalized)) {
    ElMessage.error(t('categoryDialog.nameExists'))
    return false
  }
  categoryLabels.value = [...categoryLabels.value, normalized]
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [normalized]: normalized,
  }
  newCategoryLabel.value = ''
  ElMessage.success(t('categoryDialog.added'))
  return true
}

function startRenameCategory(label: string) {
  editingCategoryLabel.value = label
}

function cancelRenameCategory(label: string) {
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [label]: label,
  }
  editingCategoryLabel.value = null
}

function saveRenamedCategory(oldLabel: string) {
  if (editingCategoryLabel.value !== oldLabel) {
    return
  }
  const newLabel = normalizeCategoryLabel(categoryRenameInputs.value[oldLabel] || '')
  if (!newLabel) {
    ElMessage.error(t('categoryDialog.nameRequired'))
    return
  }
  if (newLabel === oldLabel) {
    editingCategoryLabel.value = null
    ElMessage.success(t('categoryDialog.saved'))
    return
  }
  if (newLabel === uncategorizedLabel.value || newLabel === presetCategoryLabel.value || categoryLabels.value.includes(newLabel)) {
    ElMessage.error(t('categoryDialog.nameExists'))
    return
  }
  categoryLabels.value = categoryLabels.value.map(label => (label === oldLabel ? newLabel : label))

  if (oldLabel === presetCategoryLabel.value) {
    presetCategoryLabel.value = newLabel
  }

  const mapping: Record<string, string> = {}
  for (const [name, label] of Object.entries(categoryByRegistry.value)) {
    mapping[name] = label === oldLabel ? newLabel : label
  }
  categoryByRegistry.value = mapping

  const expanded = { ...categoryExpanded.value }
  if (expanded[oldLabel] !== undefined) {
    expanded[newLabel] = expanded[oldLabel]
    delete expanded[oldLabel]
    categoryExpanded.value = expanded
  }

  editingCategoryLabel.value = null

  const renameInputs = { ...categoryRenameInputs.value }
  delete renameInputs[oldLabel]
  renameInputs[newLabel] = newLabel
  categoryRenameInputs.value = renameInputs

  ElMessage.success(t('categoryDialog.renamed'))
}

async function deleteCategoryLabel(label: string) {
  try {
    await ElMessageBox.confirm(t('categoryDialog.confirmDeleteContent', { label }), t('categoryDialog.confirmDeleteTitle'), { confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel'), type: 'warning' })
  } catch {
    return
  }
  categoryLabels.value = categoryLabels.value.filter(item => item !== label)
  const mapping: Record<string, string> = {}
  for (const [name, category] of Object.entries(categoryByRegistry.value)) {
    if (category !== label) {
      mapping[name] = category
    }
  }
  categoryByRegistry.value = mapping
  const expanded = { ...categoryExpanded.value }
  delete expanded[label]
  categoryExpanded.value = expanded

  if (editingCategoryLabel.value === label) {
    editingCategoryLabel.value = null
  }

  const renameInputs = { ...categoryRenameInputs.value }
  delete renameInputs[label]
  categoryRenameInputs.value = renameInputs

  ElMessage.success(t('categoryDialog.deleted'))
}

function getLatencyText(name: string): string {
  const latency = latencyResults.value[name]
  if (!latency) return t('speedTest.notTested')
  if (latency.latency_ms !== null) return `${latency.latency_ms}ms`
  return formatLatencyErrorMessage(t, latency.error, 120)
}

/** 列表/拖拽气泡中与语言一致的测速失败短文案 */
function latencyFailLabel(error: string | null | undefined): string {
  return formatLatencyErrorMessage(t, error, 14)
}

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
</script>

<template>
  <div class="registry-list-root flex flex-col h-full min-h-0" :class="[registryListIntroClass, { 'registry-list-root--dragging': isPointerDragging || isManageDragging }]">
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
      <div v-if="latencyLoading" class="ml-auto">
        <el-icon class="is-loading text-gray-400"><Search /></el-icon>
      </div>
    </div>

    <!-- Search + 分类全部展开/折叠 -->
    <div class="rl-intro-search px-4 pb-1">
      <div class="flex items-center gap-2 min-w-0">
        <el-input v-model="searchQuery" class="registry-search-field flex-1 min-w-0" :placeholder="t('registryList.searchPlaceholder')" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="registry-fold-toolbar inline-flex shrink-0 items-stretch rounded-md overflow-hidden" role="group">
          <el-tooltip :content="t('registryList.expandAllCategories')" placement="top" :show-after="280" popper-class="registry-fold-tooltip" @show="onFoldTooltipShow('expand')">
            <el-button text class="registry-fold-btn" :disabled="categoryFoldActionsDisabled" :aria-label="t('registryList.expandAllCategories')" @click="expandAllCategories">
              <el-icon class="text-[17px]"><Expand /></el-icon>
            </el-button>
          </el-tooltip>
          <span class="registry-fold-split" aria-hidden="true" />
          <el-tooltip :content="t('registryList.collapseAllCategories')" placement="top" :show-after="280" popper-class="registry-fold-tooltip" @show="onFoldTooltipShow('collapse')">
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
        <!-- Loading Skeleton -->
        <div v-if="loading" class="flex flex-col gap-2 p-2">
          <div v-for="i in 6" :key="i" class="registry-list-skeleton-shimmer h-14 rounded-lg animate-pulse"></div>
        </div>

        <!-- Empty -->
        <div v-else-if="filteredRegistries.length === 0" class="flex-center py-10 text-sm text-gray-400">
          {{ t('registryList.empty') }}
        </div>

        <!-- Items -->
        <div v-else class="flex flex-col gap-2 p-1">
          <div
            v-for="group in groupedRegistries"
            :key="group.label"
            :class="[
              'relative flex flex-col gap-2 rounded border border-transparent transition-colors',
              {
                'bg-gray-50 border-primary/60 shadow-sm': dragOverCategoryLabel === group.label && isPointerDragging,
              },
            ]"
            @mouseenter="onCategoryMouseEnter(group.label)"
          >
            <div :class="['px-1.5 pt-0.5 text-xs font-semibold text-gray-400 cursor-pointer select-none flex items-center gap-1 rounded', { 'bg-gray-100': dragOverCategoryLabel === group.label }]" @click="toggleCategoryExpanded(group.label)" @contextmenu="onCategoryContextMenu($event, group.label)">
              <span class="category-row-chevron text-gray-400" :class="{ 'is-expanded': isCategoryExpanded(group.label) }" aria-hidden="true">▸</span>
              <span>{{ group.label }} ({{ group.items.length }})</span>
            </div>
            <div v-if="dragOverCategoryLabel === group.label && isPointerDragging" class="category-drop-overlay absolute inset-0 z-20 pointer-events-none rounded-lg bg-white/55 border border-primary/25 backdrop-blur-[2px] flex items-center justify-center">
              <div class="category-drop-hint px-3.5 py-2 text-xs font-medium text-primary bg-white/88 rounded-lg border border-white shadow-sm flex items-center gap-1.5">
                <span class="text-[11px]">↳</span>
                <span>{{ t('registryList.dropHint', { label: group.label }) }}</span>
              </div>
            </div>
            <div class="reg-category-fold-shell" :class="{ 'reg-category-fold-shell--open': isCategoryExpanded(group.label) }">
              <div class="reg-category-fold-inner flex flex-col gap-2.5">
                <div
                  v-for="registry in group.items"
                  :key="registry.name"
                  :class="[
                    'registry-item flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer border-l-3 border-transparent select-none cursor-grab',
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
                      <span :class="['text-sm font-semibold truncate', { 'text-primary': currentRegistry?.name === registry.name }]">
                        {{ registry.name }}
                      </span>
                    </div>
                    <div class="text-xs text-gray-400 truncate mt-0.5">
                      {{ registry.url }}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                    <template v-if="latencyResults[registry.name]">
                      <span class="text-xs font-mono font-medium" :style="{ color: latencyBarColor(latencyResults[registry.name].latency_ms) }">
                        <template v-if="latencyResults[registry.name].latency_ms !== null"> {{ latencyResults[registry.name].latency_ms }}ms </template>
                        <template v-else class="text-gray-400">
                          {{ latencyFailLabel(latencyResults[registry.name].error) }}
                        </template>
                      </span>
                      <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: latencyBarColor(latencyResults[registry.name].latency_ms) }"></span>
                    </template>
                    <div v-else-if="currentRegistry?.name === registry.name" class="w-2 h-2 rounded-full" style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"></div>
                    <div class="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      <el-button link size="small" class="registry-speed-btn registry-speed-btn-fixed" :loading="!!testingByRegistry[registry.name]" :disabled="!!testingByRegistry[registry.name]" @click.stop="handleTest(registry)">
                        <el-icon v-if="!testingByRegistry[registry.name]" class="text-base leading-none">
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
        <div
          class="context-menu-item px-3 py-2 text-sm cursor-pointer"
          @click="
            openDetail(contextMenu!.registry);
            contextMenu = null;
          "
        >
          {{ t('registryList.context.viewDetail') }}
        </div>
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="openEdit(contextMenu!.registry)">
          {{ t('registryList.context.edit') }}
        </div>
        <div class="context-menu-item context-menu-item--danger px-3 py-2 text-sm cursor-pointer text-red-500" @click="handleDelete(contextMenu!.registry)">
          {{ t('registryList.context.delete') }}
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="categoryContextMenu" ref="categoryContextMenuRef" class="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-44" :style="{ left: categoryContextMenu.x + 'px', top: categoryContextMenu.y + 'px' }">
        <div class="context-menu-item px-3 py-2 text-sm cursor-pointer" @click="toggleCategoryFromContext(categoryContextMenu.label)">
          {{ isCategoryExpanded(categoryContextMenu.label) ? t('registryList.categoryContext.collapse') : t('registryList.categoryContext.expand') }}
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
        <div :class="['context-menu-item context-menu-item--danger px-3 py-2 text-sm cursor-pointer text-red-500', { 'opacity-40 pointer-events-none': isUncategorizedCategory(categoryContextMenu.label) }]" @click="deleteCategoryFromContext(categoryContextMenu.label)">
          {{ t('registryList.categoryContext.delete') }}
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Dialog -->
    <RegistryDialog :visible="showDialog" :registry="editingRegistry" :category-labels="categoryLabels" :current-category="editingRegistry ? categoryByRegistry[editingRegistry.name] || '' : ''" @save-category="saveCategoryFromDialog" @close="showDialog = false" />

    <el-dialog v-model="showCategoryContextPromptDialog" :title="categoryContextPromptTitle" width="420px" :close-on-click-modal="false" destroy-on-close @closed="onCategoryContextPromptDialogClosed">
      <p class="text-sm text-gray-500 mb-3 m-0">{{ categoryContextPromptHint }}</p>
      <el-input v-model="categoryContextPromptInput" :maxlength="categoryLabelMaxLength" show-word-limit clearable @keyup.enter="confirmCategoryContextPrompt" />
      <template #footer>
        <el-button @click="closeCategoryContextPrompt">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmCategoryContextPrompt">
          {{ categoryContextPromptMode === 'create' ? t('categoryDialog.add') : t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCategoryManageDialog" :title="t('categoryDialog.title')" width="520px" class="category-manage-dialog" :close-on-click-modal="false">
      <div class="category-manage-content">
        <div class="category-create-row">
          <el-input v-model="newCategoryLabel" :placeholder="t('categoryDialog.newPlaceholder')" :maxlength="categoryLabelMaxLength" show-word-limit clearable @keyup.enter="addCategoryLabel" />
          <el-button type="primary" class="category-create-btn" @click="addCategoryLabel">
            {{ t('categoryDialog.add') }}
          </el-button>
        </div>
        <div v-if="categoryLabels.length === 0" class="category-empty-state">
          {{ t('categoryDialog.empty') }}
        </div>
        <div v-else class="category-list-wrap">
          <div
            v-for="label in categoryLabels"
            :key="label"
            :class="[
              'category-list-row',
              {
                'category-list-row--drag-over': dragOverManageCategoryLabel === label,
                'opacity-70': isManageDragging && manageDragLabel === label,
              },
            ]"
            @mouseenter="onManageRowEnter(label)"
          >
            <div class="category-drag-handle" @mousedown.left.stop.prevent="startManageDrag(label, $event)" :title="t('categoryDialog.dragSort')">
              <el-icon><Rank /></el-icon>
            </div>
            <el-input v-model="categoryRenameInputs[label]" class="category-input" :maxlength="categoryLabelMaxLength" show-word-limit :disabled="editingCategoryLabel !== label" />
            <div class="category-row-actions">
              <el-button size="small" :disabled="editingCategoryLabel !== null && editingCategoryLabel !== label" @click="editingCategoryLabel === label ? cancelRenameCategory(label) : startRenameCategory(label)">
                {{ editingCategoryLabel === label ? t('common.cancel') : t('categoryDialog.rename') }}
              </el-button>
              <el-button v-if="editingCategoryLabel === label" size="small" type="primary" @click="saveRenamedCategory(label)">
                {{ t('common.save') }}
              </el-button>
              <el-button size="small" type="danger" @click="deleteCategoryLabel(label)">
                {{ t('categoryDialog.delete') }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showCategoryManageDialog = false">{{ t('common.close') }}</el-button>
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
            <div
              class="text-sm font-mono"
              :style="{
                color: latencyBarColor(latencyResults[selectedRegistry.name]?.latency_ms ?? null),
              }"
            >
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
            <span class="text-xs font-mono font-medium" :style="{ color: latencyBarColor(latencyResults[draggingRegistry.name].latency_ms) }">
              <template v-if="latencyResults[draggingRegistry.name].latency_ms !== null"> {{ latencyResults[draggingRegistry.name].latency_ms }}ms </template>
              <template v-else>
                {{ latencyFailLabel(latencyResults[draggingRegistry.name].error) }}
              </template>
            </span>
            <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: latencyBarColor(latencyResults[draggingRegistry.name].latency_ms) }"></span>
          </template>
          <div v-else-if="currentRegistry?.name === draggingRegistry.name" class="w-2 h-2 rounded-full" style="background: var(--el-color-primary); box-shadow: 0 0 6px rgba(79, 110, 247, 0.4)"></div>
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
/* Element Plus loading 态会绘制 ::before 蒙层，这里强制透明避免黑底闪现 */
.registry-speed-btn.el-button.is-link.is-loading::before {
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

.category-manage-content {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding-top: 0.25rem;
}

.category-create-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 80%, transparent);
  border-radius: 0.875rem;
  background: linear-gradient(160deg, color-mix(in srgb, var(--el-fill-color-blank) 92%, #ffffff 8%), color-mix(in srgb, var(--el-fill-color) 72%, var(--el-fill-color-blank) 28%));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.category-create-btn {
  min-width: 5.25rem;
  border-radius: 0.625rem;
  font-weight: 600;
}

.category-empty-state {
  font-size: 0.875rem;
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 2.2rem 1rem;
  border: 1px dashed color-mix(in srgb, var(--el-border-color) 78%, transparent);
  border-radius: 0.875rem;
  background: var(--el-fill-color-lighter);
}

.category-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  max-height: 19rem;
  overflow: auto;
  padding: 0.2rem 0.35rem 0.35rem 0;
}

.category-list-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.6rem;
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 84%, transparent);
  border-radius: 0.875rem;
  background: var(--el-fill-color-blank);
  transition:
    border-color var(--app-duration) var(--app-ease),
    background-color var(--app-duration) var(--app-ease),
    box-shadow var(--app-duration) var(--app-ease);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.category-list-row:hover {
  border-color: color-mix(in srgb, var(--el-border-color) 88%, transparent);
  background: color-mix(in srgb, var(--el-fill-color-lighter) 84%, var(--el-fill-color-blank));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.category-list-row--drag-over {
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--el-fill-color-blank));
  border-color: color-mix(in srgb, var(--el-color-primary) 45%, var(--el-border-color));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}

.category-drag-handle {
  width: 1.75rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  border-radius: 0.625rem;
  cursor: grab;
  flex-shrink: 0;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.category-drag-handle:active {
  cursor: grabbing;
}

.category-drag-handle:hover {
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-fill-color) 86%, transparent);
}

.category-input {
  flex: 1;
  min-width: 0;
}

.category-input :deep(.el-input__wrapper) {
  border-radius: 0.625rem;
}

.category-row-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.category-row-actions :deep(.el-button) {
  border-radius: 0.625rem;
}

:global(html.dark) .category-create-row {
  border-color: var(--el-border-color);
  background: var(--el-bg-color-overlay);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
}

:global(html.dark) .category-list-row {
  border-color: var(--el-border-color);
  background: var(--el-fill-color-blank);
  box-shadow: 0 1px 0 var(--app-separator);
}

:global(html.dark) .category-list-row:hover {
  border-color: var(--el-border-color-light);
  background: var(--el-fill-color-light);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
}

:global(html.dark) .category-create-row :deep(.el-input__wrapper),
:global(html.dark) .category-input :deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-blank) !important;
  box-shadow: 0 0 0 1px var(--el-border-color) inset !important;
}

:global(html.dark) .category-create-row :deep(.el-input__wrapper:hover),
:global(html.dark) .category-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-border-color-light) inset !important;
}

:global(html.dark) .category-create-row :deep(.el-input__wrapper.is-focus),
:global(html.dark) .category-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset !important;
}

:global(html.dark) .category-create-btn,
:global(html.dark) .category-row-actions :deep(.el-button--primary) {
  background: linear-gradient(180deg, #3f78bd 0%, #2f68ac 100%);
  border-color: rgba(137, 193, 255, 0.44);
  color: #eaf3ff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 1px 4px rgba(0, 0, 0, 0.32);
}

:global(html.dark) .category-create-btn:hover,
:global(html.dark) .category-row-actions :deep(.el-button--primary:hover) {
  background: linear-gradient(180deg, #4b85cc 0%, #3873ba 100%);
  border-color: rgba(160, 210, 255, 0.56);
  color: #f5f9ff;
}

:global(html.dark) .category-row-actions :deep(.el-button) {
  transition:
    background-color 0.24s var(--app-ease-out),
    border-color 0.24s var(--app-ease-out),
    color 0.24s var(--app-ease-out),
    box-shadow 0.24s var(--app-ease-out);
}

:global(html.dark) .category-row-actions :deep(.el-button:not(.el-button--primary):not(.el-button--danger)) {
  background: linear-gradient(180deg, #4b505a 0%, #434852 100%);
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(236, 238, 244, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

:global(html.dark) .category-row-actions :deep(.el-button:not(.el-button--primary):not(.el-button--danger):hover) {
  background: linear-gradient(180deg, #565c67 0%, #4d5460 100%);
  border-color: rgba(255, 255, 255, 0.24);
  color: #ffffff;
}

:global(html.dark) .category-row-actions :deep(.el-button--danger) {
  background: rgba(255, 69, 58, 0.14);
  border-color: rgba(255, 69, 58, 0.42);
  color: #ff7b72;
}

:global(html.dark) .category-row-actions :deep(.el-button--danger:hover) {
  background: rgba(255, 69, 58, 0.2);
  border-color: rgba(255, 69, 58, 0.52);
  color: #ff918a;
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
