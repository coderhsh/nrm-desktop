import { ref, computed, watch, nextTick, h } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n, CATEGORY_BY_REGISTRY_STORAGE_KEY, REGISTRY_ORDER_BY_CATEGORY_STORAGE_KEY } from '@/composables/useI18n'
import { useRegistryStore } from '@/stores/registry'
import { storeToRefs } from 'pinia'
import { DEFAULT_PRESET_LABEL } from '@/components/RegistryList/constants'
import { normalizeRegistryOrderRecord, normalizeCategoryLabel } from '@/components/RegistryList/utils'
import type { InputInstance } from 'element-plus'
import type { Registry } from '@/types'

export function useCategoryManage() {
  const { t, language } = useI18n()
  const store = useRegistryStore()
  const { filteredRegistries } = storeToRefs(store)

  // ==================== localStorage 持久化 ====================
  const categoryByRegistry = useLocalStorage<Record<string, string>>(CATEGORY_BY_REGISTRY_STORAGE_KEY, {})
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
  const presetCategoryLabel = useLocalStorage<string>('nrm-desktop-preset-category-label', DEFAULT_PRESET_LABEL)

  // 初始化：确保预设分类标签存在于列表中
  if (!categoryLabels.value.includes(presetCategoryLabel.value)) {
    categoryLabels.value = [presetCategoryLabel.value, ...categoryLabels.value]
  }

  // ==================== 计算属性 ====================
  const uncategorizedLabel = computed(() => t('registryList.uncategorized'))

  // ==================== 分类存储迁移 ====================
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

  // ==================== 分类规范化 ====================
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

  // ==================== 分类查询函数 ====================
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
    const byName = new Map(items.map(i => [i.name, i]))
    const ordered: Registry[] = []
    for (const name of order) {
      const r = byName.get(name)
      if (r) {
        ordered.push(r)
        byName.delete(name)
      }
    }
    for (const r of byName.values()) {
      ordered.push(r)
    }
    return ordered
  }

  function getOrderedRegistryNamesInCategory(categoryLabel: string): string[] {
    return applyStoredOrderForCategory(categoryLabel, registriesInCategory(categoryLabel)).map(r => r.name)
  }

  function getRegistryCategory(registry: Registry): string {
    const ucat = uncategorizedLabel.value
    const assignedCategory = categoryByRegistry.value[registry.name]
    if (assignedCategory) return assignedCategory
    if (registry.is_custom) return ucat
    return categoryLabels.value.includes(presetCategoryLabel.value) ? presetCategoryLabel.value : ucat
  }

  // ==================== 分类排序操作 ====================
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

  // ==================== 分类展开/折叠 ====================
  function isCategoryExpanded(label: string, holdCollapsed: boolean): boolean {
    if (holdCollapsed) return false
    if (categoryExpanded.value[label] === undefined) return true
    return categoryExpanded.value[label]
  }

  function toggleCategoryExpanded(label: string, holdCollapsed: boolean) {
    if (holdCollapsed) return
    categoryExpanded.value = {
      ...categoryExpanded.value,
      [label]: !isCategoryExpanded(label, holdCollapsed),
    }
  }

  function expandAllCategories(grouped: { label: string }[]) {
    if (grouped.length === 0) return
    const next = { ...categoryExpanded.value }
    for (const g of grouped) {
      next[g.label] = true
    }
    categoryExpanded.value = next
  }

  function collapseAllCategories(grouped: { label: string }[]) {
    if (grouped.length === 0) return
    const next = { ...categoryExpanded.value }
    for (const g of grouped) {
      next[g.label] = false
    }
    categoryExpanded.value = next
  }

  // ==================== 分类标签操作 ====================
  function ensureCategoryLabel(label: string) {
    const ucat = uncategorizedLabel.value
    if (!label || label === ucat) return
    if (!categoryLabels.value.includes(label)) {
      categoryLabels.value = [...categoryLabels.value, label]
    }
  }

  function isUncategorizedCategory(label: string): boolean {
    return label === uncategorizedLabel.value
  }

  // ==================== 源移动到分类 ====================
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

  // ==================== 分类管理弹窗 ====================
  const showCategoryManageDialog = ref(false)
  const categoryManageDraftLabels = ref<string[]>([])
  const draftPresetCategoryLabel = ref('')
  const draftCategoryByRegistry = ref<Record<string, string>>({})
  const draftCategoryExpanded = ref<Record<string, boolean>>({})
  const newCategoryLabel = ref('')
  const newCategoryLabelInputRef = ref<InputInstance>()
  const editingCategoryLabel = ref<string | null>(null)
  const categoryRenameInputs = ref<Record<string, string>>({})
  const categoryRenameInputRefs = new Map<string, InputInstance>()
  const categoryRenameRefCallbacks = new Map<string, (el: unknown) => void>()

  function setCategoryRenameInputRef(label: string, el: unknown) {
    if (el == null) {
      categoryRenameInputRefs.delete(label)
      return
    }
    categoryRenameInputRefs.set(label, el as InputInstance)
  }

  function getCategoryRenameRefCallback(label: string) {
    let cb = categoryRenameRefCallbacks.get(label)
    if (!cb) {
      cb = (el: unknown) => setCategoryRenameInputRef(label, el)
      categoryRenameRefCallbacks.set(label, cb)
    }
    return cb
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

  function closeCategoryManageDialogWithoutSave() {
    showCategoryManageDialog.value = false
  }

  function onCategoryManageDialogClosed() {
    newCategoryLabel.value = ''
    editingCategoryLabel.value = null
    const inputs: Record<string, string> = {}
    for (const label of categoryLabels.value) {
      inputs[label] = label
    }
    categoryRenameInputs.value = inputs
  }

  function focusNewCategoryLabelInput() {
    nextTick(() => {
      newCategoryLabelInputRef.value?.focus()
    })
  }

  // ==================== 分类增删改 ====================
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

  function persistRenamedCategory(oldLabel: string) {
    if (editingCategoryLabel.value !== oldLabel) return
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

  function saveCategoryFromDialog(payload: { oldName: string; newName: string; category: string | null }) {
    const normalized = normalizeCategoryLabel(payload.category)
    const nextMapping = { ...categoryByRegistry.value }
    delete nextMapping[payload.oldName]
    if (normalized) {
      ensureCategoryLabel(normalized)
      nextMapping[payload.newName] = normalized
    }
    categoryByRegistry.value = nextMapping
  }

  function applyCategoryManageOrder(newOrder: string[]) {
    categoryManageDraftLabels.value = newOrder
  }

  return {
    // 持久化状态
    categoryByRegistry,
    registryOrderByCategory,
    categoryLabels,
    categoryExpanded,
    presetCategoryLabel,
    uncategorizedLabel,

    // 查询函数
    registriesInCategory,
    applyStoredOrderForCategory,
    getOrderedRegistryNamesInCategory,
    getRegistryCategory,

    // 排序操作
    pruneRegistryOrder,
    reorderStorageAfterCrossCategoryMove,
    commitRegistryOrderWithinCategory,

    // 展开/折叠
    isCategoryExpanded,
    toggleCategoryExpanded,
    expandAllCategories,
    collapseAllCategories,

    // 标签操作
    ensureCategoryLabel,
    isUncategorizedCategory,
    moveRegistryToCategory,
    saveCategoryFromDialog,

    // 分类管理弹窗
    showCategoryManageDialog,
    categoryManageDraftLabels,
    draftPresetCategoryLabel,
    draftCategoryByRegistry,
    draftCategoryExpanded,
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
  }
}
