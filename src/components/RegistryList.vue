<script setup lang="ts">
import { computed, h, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShellIntro } from '@/composables/useShellIntro'
import { onClickOutside, useLocalStorage } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Expand, Fold, Rank, RefreshRight, Search, Setting } from '@element-plus/icons-vue'
import { useRegistryStore } from '@/stores/registry'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY, REGISTRY_ORDER_BY_CATEGORY_STORAGE_KEY } from '@/composables/useI18n'
import { storeToRefs } from 'pinia'
import type { Registry } from '@/types'
import type { InputInstance } from 'element-plus'
import { testSingleSpeed } from '@/api/speedtest'
import { formatLatencyErrorMessage, truncateSpeedTestRunError } from '@/utils/latency-error-i18n'
import { latencyBarColor } from '@/utils/latency-bar-color'
import RegistryDialog from './RegistryDialog.vue'
import { appEntranceSettledKey } from '@/composables/useAppBlocksEntrance'

const store = useRegistryStore()
/** 入场结束前强制全部分类折叠；结束后由 onMounted 里 expandAllCategories 全部展开 */
const holdCategoriesCollapsedUntilEntrance = ref(true)
const entranceSettled = inject(appEntranceSettledKey, Promise.resolve())
const { t, language } = useI18n()
const { introPhase } = useShellIntro()
const registryListIntroClass = computed(() => {
  if (introPhase.value === 'prep') return 'registry-list-intro-prep'
  if (introPhase.value === 'run') return 'registry-list-intro-run'
  return ''
})
const { filteredRegistries, currentRegistry, searchQuery, loading, latencyResults } = storeToRefs(store)

/** 左侧列表中「未分类」分组标题，随界面语言变化。 */
const uncategorizedLabel = computed(() => t('registryList.uncategorized'))

const defaultPresetLabel = '预设源'
const categoryLabelMaxLength = 20
const categoryByRegistry = useLocalStorage<Record<string, string>>(CATEGORY_BY_REGISTRY_STORAGE_KEY, {})

/** 防止 localStorage 损坏或非对象导致渲染期抛错 */
function normalizeRegistryOrderRecord(v: unknown): Record<string, string[]> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      out[k] = val.filter((x): x is string => typeof x === 'string')
    }
  }
  return out
}

/** 各分类下源的展示顺序（registry name）；未记录的分类回退为按名称排序 */
const registryOrderByCategory = useLocalStorage<Record<string, string[]>>(
  REGISTRY_ORDER_BY_CATEGORY_STORAGE_KEY,
  {},
  {
    serializer: {
      read: (raw: string) => {
        try {
          const v = JSON.parse(raw) as unknown
          return normalizeRegistryOrderRecord(v)
        } catch {
          return {}
        }
      },
      write: (v: Record<string, string[]>) => JSON.stringify(normalizeRegistryOrderRecord(v)),
    },
  }
)

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
  if (store.loading || store.registries.length === 0) return

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
/** 某分类下的源列表（与 groupedRegistries 分区规则一致） */
function registriesInCategory(categoryLabel: string): Registry[] {
  const ucat = uncategorizedLabel.value
  const preset = presetCategoryLabel.value
  const list: Registry[] = []
  for (const registry of filteredRegistries.value) {
    const assignedCategory = categoryByRegistry.value[registry.name]
    const category = assignedCategory || (registry.is_custom ? ucat : categoryLabels.value.includes(preset) ? preset : ucat)
    if (category === categoryLabel) list.push(registry)
  }
  return list
}

function applyStoredOrderForCategory(categoryLabel: string, items: Registry[]): Registry[] {
  const order = normalizeRegistryOrderRecord(registryOrderByCategory.value)[categoryLabel]
  if (!order?.length) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  }
  const set = new Set(items.map(i => i.name))
  const ordered: Registry[] = []
  for (const name of order) {
    if (!set.has(name)) continue
    const r = items.find(i => i.name === name)
    if (r) ordered.push(r)
  }
  for (const r of items) {
    if (!ordered.some(o => o.name === r.name)) ordered.push(r)
  }
  return ordered
}

function getOrderedRegistryNamesInCategory(categoryLabel: string): string[] {
  return applyStoredOrderForCategory(categoryLabel, registriesInCategory(categoryLabel)).map(r => r.name)
}

function pruneRegistryOrder(name: string) {
  const next = { ...normalizeRegistryOrderRecord(registryOrderByCategory.value) }
  for (const k of Object.keys(next)) {
    next[k] = (next[k] ?? []).filter(n => n !== name)
  }
  registryOrderByCategory.value = next
}

function reorderStorageAfterCrossCategoryMove(registryName: string, _fromCat: string, toCat: string) {
  const next = { ...normalizeRegistryOrderRecord(registryOrderByCategory.value) }
  const stripAll = (arr: string[] | undefined) => (arr ?? []).filter(n => n !== registryName)
  for (const k of Object.keys(next)) {
    next[k] = stripAll(next[k])
  }
  const targetBase = stripAll(next[toCat])
  next[toCat] = [...targetBase, registryName]
  registryOrderByCategory.value = next
}

function commitRegistryOrderWithinCategory(categoryLabel: string, dragName: string, dropK: number) {
  const names = getOrderedRegistryNamesInCategory(categoryLabel)
  const rest = names.filter(n => n !== dragName)
  const k = Math.min(Math.max(dropK, 0), rest.length)
  const newOrder = [...rest.slice(0, k), dragName, ...rest.slice(k)]
  registryOrderByCategory.value = {
    ...normalizeRegistryOrderRecord(registryOrderByCategory.value),
    [categoryLabel]: newOrder,
  }
}

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
    items: applyStoredOrderForCategory(label, groups[label]),
  }))
})

/** 输入搜索词时自动展开仍有匹配源的分类，清空搜索不改变折叠状态 */
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

const showDialog = ref(false)
const editingRegistry = ref<Registry | null>(null)
const showDetailDialog = ref(false)
const selectedRegistry = ref<Registry | null>(null)
const showCategoryManageDialog = ref(false)
const newCategoryLabel = ref('')
const newCategoryLabelInputRef = ref<InputInstance>()
const categoryRenameInputs = ref<Record<string, string>>({})
const testingByRegistry = ref<Record<string, boolean>>({})
const editingCategoryLabel = ref<string | null>(null)
/** 分类管理弹窗草稿（拖拽排序、重命名、新增、删除），仅底部「保存」写入持久化 */
const categoryManageDraftLabels = ref<string[]>([])
const draftPresetCategoryLabel = ref('')
const draftCategoryByRegistry = ref<Record<string, string>>({})
const draftCategoryExpanded = ref<Record<string, boolean>>({})
/** 分类管理弹窗内各行重命名输入框，供点击「重命名」后 focus */
const categoryRenameInputRefs = new Map<string, InputInstance>()

function setCategoryRenameInputRef(label: string, el: unknown) {
  if (el == null) {
    categoryRenameInputRefs.delete(label)
    return
  }
  categoryRenameInputRefs.set(label, el as InputInstance)
}

/** 稳定引用，避免 v-for 每次渲染换函数导致 ref 反复卸载 */
const categoryRenameRefCallbacks = new Map<string, (el: unknown) => void>()

function getCategoryRenameRefCallback(label: string) {
  let cb = categoryRenameRefCallbacks.get(label)
  if (!cb) {
    cb = (el: unknown) => setCategoryRenameInputRef(label, el)
    categoryRenameRefCallbacks.set(label, cb)
  }
  return cb
}
const draggingCategoryLabel = ref<string | null>(null)
const manageDragLabel = ref<string | null>(null)
const manageDragStart = ref<{ x: number; y: number } | null>(null)
const isManageDragging = ref(false)
/** 插入槽位：在「去掉当前拖拽项」后的数组中的下标 0..rest.length */
const manageDropIndex = ref(0)

/** 分类列表滚动容器（用于松手后恢复 scrollTop，减轻布局切换时的跳动） */
const categoryManageScrollRef = ref<HTMLElement | null>(null)

/** 分类拖拽：跟随指针的分身位置（左上角屏幕坐标）与抓取偏移 */
const manageGhostPosition = ref({ x: 0, y: 0 })
const manageDragPointerOffset = ref({ x: 0, y: 0 })

/** 分类排序拖拽全程（含未过移动阈值）：body 挂类名以屏蔽 teleport 出去的对话框内 hover */
watch(manageDragLabel, v => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('category-manage-sort-dragging', Boolean(v))
})

watch(
  () => registrySortActive.value && isPointerDragging.value && Boolean(pointerDragRegistryName.value),
  v => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('registry-list-sort-dragging', Boolean(v))
  }
)

const dragOverCategoryLabel = ref<string | null>(null)
const pointerDragRegistryName = ref<string | null>(null)
const pointerDragSourceCategory = ref<string | null>(null)
/** 同分类内置顶排序：指针落在间隙时更新插入下标（与分类排序 manageDropIndex 语义一致） */
const registrySortDropIndex = ref(0)
/** 指针落在「源分类」列表区域内且未指向其它分类时，为 true */
const registrySortActive = ref(false)
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
  if (holdCategoriesCollapsedUntilEntrance.value) return false
  if (categoryExpanded.value[label] === undefined) return true
  return categoryExpanded.value[label]
}

function toggleCategoryExpanded(label: string) {
  if (holdCategoriesCollapsedUntilEntrance.value) return
  categoryExpanded.value = {
    ...categoryExpanded.value,
    [label]: !isCategoryExpanded(label),
  }
}

function expandAllCategories() {
  const groups = groupedRegistries.value
  if (groups.length === 0) return
  const next = { ...categoryExpanded.value }
  for (const g of groups) {
    next[g.label] = true
  }
  categoryExpanded.value = next
}

function collapseAllCategories() {
  const groups = groupedRegistries.value
  if (groups.length === 0) return
  const next = { ...categoryExpanded.value }
  for (const g of groups) {
    next[g.label] = false
  }
  categoryExpanded.value = next
}

const categoryFoldActionsDisabled = computed(() => loading.value || holdCategoriesCollapsedUntilEntrance.value)

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

function onContextMenu(e: MouseEvent, registry: Registry) {
  e.preventDefault()
  categoryContextMenu.value = null
  contextMenu.value = { x: e.clientX, y: e.clientY, registry }
}

function onCategoryContextMenu(e: MouseEvent, label: string) {
  e.preventDefault()
  contextMenu.value = null
  categoryContextMenu.value = { x: e.clientX, y: e.clientY, label }
  // 防止右键菜单贴边或越界：先按点击位置渲染，再按真实尺寸回退到视口内。
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
  /* 拖拽结束后多数浏览器不再派发「松手误触」的 click，suppress 会残留；新一次按下表示新手势，清掉以免第一次切换被吞 */
  suppressNextClick.value = false
  pointerDragRegistryName.value = registry.name
  pointerDragSourceCategory.value = getRegistryCategory(registry)
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
  if (!isPointerDragging.value || !pointerDragRegistryName.value || !pointerDragSourceCategory.value) return
  /** 跨分类拖拽：仅在「进入其它分类」时展开并提示放入（同分类排序走指针几何判定） */
  if (label === pointerDragSourceCategory.value) return
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

/** 当前指针下的分类分组（整块卡片区域含标题），用于区分「同分类排序」与「拖到其它分类」 */
function categoryUnderPointer(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    const el = node as HTMLElement
    const host = el.closest('[data-registry-category-host]')
    if (host) {
      return host.getAttribute('data-registry-category-host') ?? null
    }
  }
  return null
}

function updateRegistrySortDropFromPointer(clientY: number, srcCat: string) {
  const dragName = pointerDragRegistryName.value
  if (!dragName) return

  const hosts = document.querySelectorAll('[data-registry-category-host]')
  let wrap: HTMLElement | null = null
  for (const h of hosts) {
    const el = h as HTMLElement
    if (el.getAttribute('data-registry-category-host') === srcCat) {
      wrap = el
      break
    }
  }
  if (!wrap) return

  const rowEls = wrap.querySelectorAll('[data-registry-sort-row]')
  const rects: DOMRect[] = []
  const labelsVis: string[] = []
  rowEls.forEach((row: Element) => {
    const lab = (row as HTMLElement).getAttribute('data-registry-sort-row')
    if (!lab) return
    rects.push(row.getBoundingClientRect())
    labelsVis.push(lab)
  })
  const restLen = getOrderedRegistryNamesInCategory(srcCat).filter(n => n !== dragName).length
  const picked = pickManageDropIndexFromPointerY(clientY, rects, labelsVis, dragName, restLen)
  if (picked) registrySortDropIndex.value = picked.k
}

function clearPointerDragState() {
  pointerDragRegistryName.value = null
  pointerDragSourceCategory.value = null
  registrySortDropIndex.value = 0
  registrySortActive.value = false
  pointerStart.value = null
  dragSourceRect.value = null
  dragPointerOffset.value = { x: 0, y: 0 }
  isPointerDragging.value = false
  dragOverCategoryLabel.value = null
  ghostTransition.value = 'none'
  document.documentElement.style.removeProperty('cursor')
  document.body.style.removeProperty('cursor')
  if (typeof document !== 'undefined') {
    document.body.classList.remove('registry-list-sort-dragging')
  }
}

function onWindowMouseMove(event: MouseEvent) {
  if (manageDragLabel.value && manageDragStart.value) {
    if (!isManageDragging.value) {
      const dx = Math.abs(event.clientX - manageDragStart.value.x)
      const dy = Math.abs(event.clientY - manageDragStart.value.y)
      if (dx + dy >= 4) {
        isManageDragging.value = true
        window.getSelection()?.removeAllRanges()
        document.documentElement.style.setProperty('cursor', 'grabbing', 'important')
        document.body.style.setProperty('cursor', 'grabbing', 'important')
      }
    } else {
      manageGhostPosition.value = {
        x: event.clientX - manageDragPointerOffset.value.x,
        y: event.clientY - manageDragPointerOffset.value.y,
      }
      updateManageDropIndexFromPointerY(event.clientY)
    }
    return
  }

  pointerPosition.value = { x: event.clientX, y: event.clientY }
  if (!pointerDragRegistryName.value || !pointerStart.value) return
  if (isPointerDragging.value) {
    ghostTransition.value = 'none'

    const srcCat = pointerDragSourceCategory.value
    const dragName = pointerDragRegistryName.value
    const searchOff = !searchQuery.value.trim()

    if (dragName && srcCat) {
      const underCat = categoryUnderPointer(event.clientX, event.clientY)

      if (underCat && underCat !== srcCat) {
        registrySortActive.value = false
        if (!isCategoryExpanded(underCat)) {
          categoryExpanded.value = {
            ...categoryExpanded.value,
            [underCat]: true,
          }
        }
        dragOverCategoryLabel.value = underCat
        document.documentElement.style.setProperty('cursor', 'copy', 'important')
        document.body.style.setProperty('cursor', 'copy', 'important')
      } else {
        dragOverCategoryLabel.value = null
        document.documentElement.style.setProperty('cursor', 'grabbing', 'important')
        document.body.style.setProperty('cursor', 'grabbing', 'important')
        if (searchOff && underCat === srcCat) {
          registrySortActive.value = true
          updateRegistrySortDropFromPointer(event.clientY, srcCat)
        } else {
          registrySortActive.value = false
        }
      }
    }

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
    window.getSelection()?.removeAllRanges()
    document.documentElement.style.setProperty('cursor', 'grabbing', 'important')
    document.body.style.setProperty('cursor', 'grabbing', 'important')
    const src = pointerDragSourceCategory.value
    const name = pointerDragRegistryName.value
    if (src && name && !searchQuery.value.trim()) {
      const names = getOrderedRegistryNamesInCategory(src)
      const ix = names.indexOf(name)
      registrySortDropIndex.value = ix >= 0 ? ix : 0
    }
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
  const dragName = pointerDragRegistryName.value
  const srcCat = pointerDragSourceCategory.value

  if (isPointerDragging.value && dragOverCategoryLabel.value && srcCat && dragOverCategoryLabel.value !== srcCat) {
    moveRegistryToCategory(dragName, dragOverCategoryLabel.value)
    reorderStorageAfterCrossCategoryMove(dragName, srcCat, dragOverCategoryLabel.value)
    suppressNextClick.value = true
  } else if (isPointerDragging.value && registrySortActive.value && srcCat && !searchQuery.value.trim()) {
    commitRegistryOrderWithinCategory(srcCat, dragName, registrySortDropIndex.value)
    suppressNextClick.value = true
  }
  clearPointerDragState()
}

onMounted(async () => {
  migrateUncategorizedCategoryStorage()
  normalizeCustomRegistryCategories()
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)

  await entranceSettled
  holdCategoriesCollapsedUntilEntrance.value = false
  expandAllCategories()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  document.documentElement.style.removeProperty('cursor')
  document.body.style.removeProperty('cursor')
  document.body.classList.remove('category-manage-sort-dragging')
  document.body.classList.remove('registry-list-sort-dragging')
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

type ManageCategorySlot = { kind: 'row'; label: string; isDragPreview?: boolean }

/** 拖拽时在目标位置渲染半透明本体行；松手后写回 draft，配合 TransitionGroup 做 FLIP */
const manageCategoryListSlots = computed((): ManageCategorySlot[] => {
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

/** 行间空隙 + 行顶/行底外侧窄带（像素）；行身中间区域不触发换位 */
const MANAGE_DROP_STRIP_PX = 14

/** 间隙「落在 visual row i 之下、row i+1 之上」时，插入下标 = visual 序中前 i+1 行里非拖拽项个数（与 manageDropIndex 语义一致） */
function manageDropKAfterGapFollowingVisualRow(i: number, labelsVis: string[], drag: string): number {
  let k = 0
  for (let j = 0; j <= i; j++) {
    if (labelsVis[j] !== drag) k++
  }
  return k
}

/**
 * 仅用指针 Y 与当前 DOM 几何判定：必须在「目标分支正上/正下」窄带或两行之间的空隙内才更新插入下标，
 * 避免此前用 rest 静态下标与预览重排后视觉顺序不一致导致的错位。
 */
function pickManageDropIndexFromPointerY(clientY: number, rects: DOMRect[], labelsVis: string[], drag: string, restLen: number): { k: number } | null {
  const n = rects.length
  if (n === 0 || labelsVis.length !== n) return null

  const strip = MANAGE_DROP_STRIP_PX

  // 行身中部：不换位置
  for (let i = 0; i < n; i++) {
    const r = rects[i]
    if (r.height <= strip * 2 + 10) continue
    const innerLo = r.top + strip
    const innerHi = r.bottom - strip
    if (clientY > innerLo && clientY < innerHi) return null
  }

  // 第一个分支「正上方」：列表顶部 + 第一行顶边的窄带 → 插在 rest 最前
  if (clientY <= rects[0].top + strip) {
    return { k: 0 }
  }

  // 相邻两行之间的空隙 + 上行底边/下行顶边外侧窄带（正上/正下合一为缝）
  for (let i = 0; i < n - 1; i++) {
    const lo = rects[i].bottom - strip
    const hi = rects[i + 1].top + strip
    if (clientY >= lo && clientY <= hi) {
      const k = manageDropKAfterGapFollowingVisualRow(i, labelsVis, drag)
      return { k }
    }
  }

  // 最后一个分支「正下方」：最后一行底边以下的窄带 → 插在 rest 最后
  if (clientY >= rects[n - 1].bottom - strip) {
    return { k: restLen }
  }

  return null
}

function updateManageDropIndexFromPointerY(clientY: number) {
  if (!isManageDragging.value || !manageDragLabel.value) return

  const drag = manageDragLabel.value
  const scrollEl = categoryManageScrollRef.value
  if (!scrollEl) return

  const wrap = scrollEl.querySelector('.category-list-wrap')
  if (!wrap) return

  const itemEls = wrap.querySelectorAll(':scope > .category-manage-flip-item')
  const rects: DOMRect[] = []
  const labelsVis: string[] = []

  itemEls.forEach(item => {
    const el = item as HTMLElement
    const lab = el.dataset.manageRowLabel
    const row = el.querySelector('.category-list-row')
    if (!lab || !row) return
    rects.push(row.getBoundingClientRect())
    labelsVis.push(lab)
  })

  const restLen = categoryManageDraftLabels.value.filter(l => l !== drag).length
  const picked = pickManageDropIndexFromPointerY(clientY, rects, labelsVis, drag, restLen)
  if (!picked) return

  manageDropIndex.value = picked.k
}

function openCategoryManageDialog() {
  categoryManageDraftLabels.value = [...categoryLabels.value]
  draftPresetCategoryLabel.value = presetCategoryLabel.value
  draftCategoryByRegistry.value = { ...categoryByRegistry.value }
  draftCategoryExpanded.value = { ...categoryExpanded.value }
  const inputs: Record<string, string> = {}
  for (const label of categoryManageDraftLabels.value) {
    inputs[label] = label
  }
  categoryRenameInputs.value = inputs
  editingCategoryLabel.value = null
  draggingCategoryLabel.value = null
  manageDragLabel.value = null
  manageDragStart.value = null
  isManageDragging.value = false
  manageDropIndex.value = 0
  contextMenu.value = null
  newCategoryLabel.value = ''
  showCategoryManageDialog.value = true
}

function applyCategoryManageDraftAndClose() {
  categoryLabels.value = [...categoryManageDraftLabels.value]
  presetCategoryLabel.value = draftPresetCategoryLabel.value
  categoryByRegistry.value = { ...draftCategoryByRegistry.value }
  categoryExpanded.value = { ...draftCategoryExpanded.value }
  ElMessage.success(t('categoryDialog.saved'))
  showCategoryManageDialog.value = false
}

/** 关闭分类管理弹窗且不保存（与标题栏 X 一致，由 @closed 清空草稿） */
function closeCategoryManageDialogWithoutSave() {
  showCategoryManageDialog.value = false
}

/** 关闭弹窗后清空草稿并重置未提交的编辑态（含顶部新分类输入、行内重命名草稿） */
function onCategoryManageDialogClosed() {
  newCategoryLabel.value = ''
  editingCategoryLabel.value = null
  const inputs: Record<string, string> = {}
  for (const label of categoryLabels.value) {
    inputs[label] = label
  }
  categoryRenameInputs.value = inputs
}

/** 弹窗打开动画结束后再聚焦，避免与 Element Plus 焦点管理冲突 */
function focusNewCategoryLabelInput() {
  nextTick(() => {
    newCategoryLabelInputRef.value?.focus()
  })
}

function startManageDrag(label: string, event: MouseEvent) {
  if (event.button !== 0) return
  window.getSelection()?.removeAllRanges()
  manageDragLabel.value = label
  manageDragStart.value = { x: event.clientX, y: event.clientY }
  isManageDragging.value = false
  manageDropIndex.value = categoryManageDraftLabels.value.indexOf(label)
  const rowEl = (event.currentTarget as HTMLElement).closest('.category-list-row') as HTMLElement | null
  const rect = rowEl?.getBoundingClientRect() ?? (event.currentTarget as HTMLElement).getBoundingClientRect()
  manageDragPointerOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
  manageGhostPosition.value = { x: rect.left, y: rect.top }
}

/** 正在拖拽时合并顺序并重置指针状态 */
function finishManageDrag() {
  if (!manageDragLabel.value) return

  const scrollEl = categoryManageScrollRef.value
  const prevScrollTop = scrollEl?.scrollTop ?? 0

  if (isManageDragging.value) {
    const drag = manageDragLabel.value
    const list = categoryManageDraftLabels.value
    const rest = list.filter(l => l !== drag)
    const k = Math.min(Math.max(manageDropIndex.value, 0), rest.length)
    categoryManageDraftLabels.value = [...rest.slice(0, k), drag, ...rest.slice(k)]
  }

  manageDragLabel.value = null
  manageDragStart.value = null
  isManageDragging.value = false

  nextTick(() => {
    requestAnimationFrame(() => {
      if (scrollEl) scrollEl.scrollTop = prevScrollTop
    })
  })
}

/** 左侧上下文「新建分类」等：立即写入持久化 */
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

/** 分类管理弹窗内：仅写入草稿 */
function addCategoryLabelToDraft(): boolean {
  const normalized = normalizeCategoryLabel(newCategoryLabel.value)
  if (!normalized) {
    ElMessage.error(t('categoryDialog.nameRequired'))
    return false
  }
  if (normalized === uncategorizedLabel.value || normalized === draftPresetCategoryLabel.value || categoryManageDraftLabels.value.includes(normalized)) {
    ElMessage.error(t('categoryDialog.nameExists'))
    return false
  }
  categoryManageDraftLabels.value = [...categoryManageDraftLabels.value, normalized]
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [normalized]: normalized,
  }
  newCategoryLabel.value = ''
  return true
}

async function startRenameCategory(label: string) {
  editingCategoryLabel.value = label
  await nextTick()
  categoryRenameInputRefs.get(label)?.focus()
}

function cancelRenameCategory(label: string) {
  categoryRenameInputs.value = {
    ...categoryRenameInputs.value,
    [label]: label,
  }
  editingCategoryLabel.value = null
}

/** 上下文菜单重命名等：立即写入持久化 */
function persistRenamedCategory(oldLabel: string) {
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

/** 分类管理弹窗内：仅更新草稿，底部「保存」再持久化 */
function confirmRenameInManageDraft(oldLabel: string) {
  if (editingCategoryLabel.value !== oldLabel) return
  const newLabel = normalizeCategoryLabel(categoryRenameInputs.value[oldLabel] || '')
  if (!newLabel) {
    ElMessage.error(t('categoryDialog.nameRequired'))
    return
  }
  if (newLabel === oldLabel) {
    editingCategoryLabel.value = null
    return
  }
  if (newLabel === uncategorizedLabel.value || newLabel === draftPresetCategoryLabel.value || categoryManageDraftLabels.value.some(l => l !== oldLabel && l === newLabel)) {
    ElMessage.error(t('categoryDialog.nameExists'))
    return
  }

  categoryManageDraftLabels.value = categoryManageDraftLabels.value.map(l => (l === oldLabel ? newLabel : l))

  if (oldLabel === draftPresetCategoryLabel.value) {
    draftPresetCategoryLabel.value = newLabel
  }

  const mapping = { ...draftCategoryByRegistry.value }
  for (const name of Object.keys(mapping)) {
    if (mapping[name] === oldLabel) mapping[name] = newLabel
  }
  draftCategoryByRegistry.value = mapping

  const expanded = { ...draftCategoryExpanded.value }
  if (expanded[oldLabel] !== undefined) {
    expanded[newLabel] = expanded[oldLabel]
    delete expanded[oldLabel]
  }
  draftCategoryExpanded.value = expanded

  editingCategoryLabel.value = null

  const renameInputs = { ...categoryRenameInputs.value }
  delete renameInputs[oldLabel]
  renameInputs[newLabel] = newLabel
  categoryRenameInputs.value = renameInputs
}

async function deleteCategoryLabel(label: string) {
  const categoryMappingForDelete = showCategoryManageDialog.value ? draftCategoryByRegistry.value : categoryByRegistry.value
  const categoryLabelsForDelete = showCategoryManageDialog.value ? categoryManageDraftLabels.value : categoryLabels.value
  const presetCategoryForDelete = showCategoryManageDialog.value ? draftPresetCategoryLabel.value : presetCategoryLabel.value
  const categoryRegistries = store.registries
    .filter(registry => {
      const assignedCategory = categoryMappingForDelete[registry.name]
      const category =
        assignedCategory ||
        (registry.is_custom
          ? uncategorizedLabel.value
          : categoryLabelsForDelete.includes(presetCategoryForDelete)
            ? presetCategoryForDelete
            : uncategorizedLabel.value)
      return category === label
    })
    .map(registry => registry.name)
  let shouldDeleteCategoryRegistries = false

  try {
    const hasRegistries = categoryRegistries.length > 0
    await ElMessageBox({
      title: t('categoryDialog.confirmDeleteTitle'),
      message: h('div', { class: 'category-delete-confirm-content' }, [
        h('p', { class: 'category-delete-confirm-content__text' }, t('categoryDialog.confirmDeleteContent', { label })),
        hasRegistries
          ? h('label', { class: 'category-delete-confirm-checkbox' }, [
              h('input', {
                class: 'category-delete-confirm-checkbox__input',
                type: 'checkbox',
                checked: shouldDeleteCategoryRegistries,
                onChange: (event: Event) => {
                  const target = event.target as HTMLInputElement | null
                  shouldDeleteCategoryRegistries = Boolean(target?.checked)
                },
              }),
              h('span', { class: 'category-delete-confirm-checkbox__label' }, t('categoryDialog.confirmDeleteWithSources', { count: categoryRegistries.length })),
            ])
          : null,
      ]),
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      showCancelButton: true,
      customClass: 'category-delete-confirm-messagebox',
      confirmButtonClass: 'category-delete-confirm-messagebox__btn-confirm',
      cancelButtonClass: 'category-delete-confirm-messagebox__btn-cancel',
      showClose: false,
      closeOnClickModal: false,
      distinguishCancelAndClose: true,
    })
  } catch {
    return
  }

  if (shouldDeleteCategoryRegistries && categoryRegistries.length > 0) {
    const deletingMsg = ElMessage({
      type: 'info',
      message: t('categoryDialog.deletingWithSourcesProgress', { label, count: categoryRegistries.length }),
      duration: 0,
      showClose: true,
    })
    try {
      await store.deleteRegistriesBulk(categoryRegistries, { silent: true })
      for (const registryName of categoryRegistries) {
        pruneRegistryOrder(registryName)
      }
    } finally {
      deletingMsg.close()
    }
  }

  if (showCategoryManageDialog.value) {
    categoryManageDraftLabels.value = categoryManageDraftLabels.value.filter(item => item !== label)
    {
      const ord = { ...registryOrderByCategory.value }
      delete ord[label]
      registryOrderByCategory.value = ord
    }
    const draftMapping: Record<string, string> = {}
    for (const [name, category] of Object.entries(draftCategoryByRegistry.value)) {
      if (category !== label) {
        draftMapping[name] = category
      }
    }
    draftCategoryByRegistry.value = draftMapping
    const draftExp = { ...draftCategoryExpanded.value }
    delete draftExp[label]
    draftCategoryExpanded.value = draftExp
    const renameInputs = { ...categoryRenameInputs.value }
    delete renameInputs[label]
    categoryRenameInputs.value = renameInputs
    if (editingCategoryLabel.value === label) {
      editingCategoryLabel.value = null
    }
    return
  }

  categoryLabels.value = categoryLabels.value.filter(item => item !== label)
  {
    const ord = { ...registryOrderByCategory.value }
    delete ord[label]
    registryOrderByCategory.value = ord
  }
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

  ElMessage.success(
    shouldDeleteCategoryRegistries && categoryRegistries.length > 0
      ? t('categoryDialog.deletedWithSources', { label, count: categoryRegistries.length })
      : t('categoryDialog.deleted', { label })
  )
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

type RegistrySlot = { registry: Registry; isDragPreview?: boolean }

/** 同分类拖拽排序：预览序列（半透明占位 + FLIP）；搜索激活时不重排 */
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

    <!-- Search + 分类全部展开/折叠 -->
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
              @click="toggleCategoryExpanded(group.label)"
              @contextmenu="onCategoryContextMenu($event, group.label)"
            >
              <span class="category-row-chevron text-gray-400" :class="{ 'is-expanded': isCategoryExpanded(group.label) }" aria-hidden="true">▸</span>
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
            <div class="reg-category-fold-shell" :class="{ 'reg-category-fold-shell--open': isCategoryExpanded(group.label) }">
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
        <div
          class="context-menu-item px-3 py-2 text-sm cursor-pointer"
          @click="openDetail(contextMenu.registry); contextMenu = null"
        >
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
      <el-input v-model="categoryContextPromptInput" :maxlength="categoryLabelMaxLength" show-word-limit clearable @keyup.enter="confirmCategoryContextPrompt" />
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
          <el-input ref="newCategoryLabelInputRef" v-model="newCategoryLabel" :placeholder="t('categoryDialog.newPlaceholder')" :maxlength="categoryLabelMaxLength" show-word-limit clearable @keyup.enter="addCategoryLabelToDraft" />
          <el-button class="category-create-btn category-create-btn--add" @click="addCategoryLabelToDraft">
            {{ t('categoryDialog.add') }}
          </el-button>
        </div>
        <div v-if="categoryManageDraftLabels.length === 0" class="category-empty-state">
          {{ t('categoryDialog.empty') }}
        </div>
        <div v-else ref="categoryManageScrollRef" class="category-list-scroll-host">
          <TransitionGroup :name="isManageDragging ? 'cat-manage-flip' : 'cat-manage-idle'" tag="div" class="category-list-wrap">
            <div v-for="slot in manageCategoryListSlots" :key="slot.label" class="category-manage-flip-item" :data-manage-row-label="slot.label">
              <div
                :class="[
                  'category-list-row',
                  {
                    'category-list-row--drag-preview': slot.isDragPreview,
                  },
                ]"
              >
                <div class="category-drag-handle" @mousedown.left.stop.prevent="startManageDrag(slot.label, $event)" :title="t('categoryDialog.dragSort')">
                  <el-icon><Rank /></el-icon>
                </div>
                <el-input :ref="getCategoryRenameRefCallback(slot.label)" v-model="categoryRenameInputs[slot.label]" class="category-input" :maxlength="categoryLabelMaxLength" show-word-limit :disabled="editingCategoryLabel !== slot.label" />
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

    <!-- 分类管理：跟随光标的拖拽分身（列表内另有半透明占位行） -->
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

/* 滚动层外提：松手时占位槽与真实行切换不会触发布局与 FLIP move 抢同一帧 */
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
  /* 不用 scrollbar-gutter: stable，否则右侧预留槽位会让列表比上方「新增分类」块视觉上更窄 */
  padding: 0.15rem 0 0.35rem;
  box-sizing: border-box;
}

.category-manage-flip-item {
  width: 100%;
  flex-shrink: 0;
}

/*
 * 弹窗初次展开时用 cat-manage-idle：关闭 FLIP move，避免列表项从 (0,0) 飞入。
 * 仅在拖拽排序（isManageDragging）时用 cat-manage-flip 做换位动画。
 */
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

/*
 * 源列表同分类拖拽：与分类弹窗相同的 idle / flip move 策略。
 */
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

/* 拖拽排序：插入位置上的半透明本体预览（行内仍可 mousemove，手柄/输入/按钮不抢交互） */
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

/* 与弹窗底部「关闭 / 保存」同一套：小一号胶囊 + 轻阴影；删除为描边红字避免粉块 */
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
