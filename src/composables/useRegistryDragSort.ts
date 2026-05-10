import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRegistryStore } from '@/stores/registry'
import { storeToRefs } from 'pinia'
import { MANAGE_DROP_STRIP_PX } from '@/components/RegistryList/constants'
import { pickDropIndexFromPointerY } from '@/components/RegistryList/utils'
import type { Registry } from '@/types'

interface CategoryManageContext {
  categoryExpanded: ReturnType<typeof import('@vueuse/core').useLocalStorage<Record<string, boolean>>>
  isCategoryExpanded: (label: string, holdCollapsed: boolean) => boolean
  getOrderedRegistryNamesInCategory: (categoryLabel: string) => string[]
  getRegistryCategory: (registry: Registry) => string
  moveRegistryToCategory: (registryName: string, label: string) => void
  reorderStorageAfterCrossCategoryMove: (registryName: string, fromCat: string, toCat: string) => void
  commitRegistryOrderWithinCategory: (categoryLabel: string, dragName: string, dropK: number) => void
  applyCategoryManageOrder: (newOrder: string[]) => void
}

export function useRegistryDragSort(ctx: CategoryManageContext) {
  const store = useRegistryStore()
  const { searchQuery } = storeToRefs(store)

  // ==================== 源拖拽状态 ====================
  const pointerDragRegistryName = ref<string | null>(null)
  const pointerDragSourceCategory = ref<string | null>(null)
  const registrySortDropIndex = ref(0)
  const registrySortActive = ref(false)
  const isPointerDragging = ref(false)
  const pointerStart = ref<{ x: number; y: number } | null>(null)
  const pointerPosition = ref({ x: 0, y: 0 })
  const dragSourceRect = ref<{ x: number; y: number } | null>(null)
  const dragPointerOffset = ref({ x: 0, y: 0 })
  const ghostPosition = ref({ x: 0, y: 0 })
  const ghostTransition = ref('none')
  const suppressNextClick = ref(false)
  const dragOverCategoryLabel = ref<string | null>(null)

  // ==================== 分类拖拽状态 ====================
  const manageDragLabel = ref<string | null>(null)
  const manageDragStart = ref<{ x: number; y: number } | null>(null)
  const isManageDragging = ref(false)
  const manageDropIndex = ref(0)
  const categoryManageScrollRef = ref<HTMLElement | null>(null)
  const manageGhostPosition = ref({ x: 0, y: 0 })
  const manageDragPointerOffset = ref({ x: 0, y: 0 })
  const manageDraftLabelsRef = ref<string[]>([])
  const categoryManageWrapRef = ref<HTMLElement | null>(null)

  // ==================== 计算属性 ====================
  const draggingRegistry = computed(() =>
    pointerDragRegistryName.value
      ? store.registries.find(item => item.name === pointerDragRegistryName.value) || null
      : null
  )

  // ==================== Body 类名管理 ====================
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

  // ==================== 源拖拽函数 ====================
  function onRegistryMouseDown(registry: Registry, event: MouseEvent) {
    if (event.button !== 0) return
    suppressNextClick.value = false
    pointerDragRegistryName.value = registry.name
    pointerDragSourceCategory.value = ctx.getRegistryCategory(registry)
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
    if (label === pointerDragSourceCategory.value) return
    if (!ctx.isCategoryExpanded(label, false)) {
      ctx.categoryExpanded.value = {
        ...ctx.categoryExpanded.value,
        [label]: true,
      }
    }
    dragOverCategoryLabel.value = label
    document.documentElement.style.setProperty('cursor', 'copy', 'important')
    document.body.style.setProperty('cursor', 'copy', 'important')
  }

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
    const restLen = ctx.getOrderedRegistryNamesInCategory(srcCat).filter(n => n !== dragName).length
    const picked = pickDropIndexFromPointerY(clientY, rects, labelsVis, dragName, restLen, MANAGE_DROP_STRIP_PX)
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

  // ==================== 分类拖拽函数 ====================
  function startManageDrag(label: string, event: MouseEvent, draftLabels?: string[]) {
    if (event.button !== 0) return
    window.getSelection()?.removeAllRanges()
    manageDragLabel.value = label
    manageDragStart.value = { x: event.clientX, y: event.clientY }
    isManageDragging.value = false
    manageDropIndex.value = 0 // Will be set by parent
    if (draftLabels) {
      manageDraftLabelsRef.value = draftLabels
    }

    // 获取滚动容器的 DOM 元素
    // el-scrollbar 组件实例可能没有直接暴露 DOM，但可以通过 $el 访问
    const scrollComponent = categoryManageScrollRef.value as any
    if (scrollComponent) {
      // 如果是组件实例，尝试获取 $el
      const scrollEl = scrollComponent.$el || scrollComponent
      categoryManageWrapRef.value = scrollEl as HTMLElement | null
    }

    const target = event.currentTarget as HTMLElement
    const rowEl = target.closest('.category-list-row') as HTMLElement | null
    const rect = rowEl?.getBoundingClientRect() ?? target.getBoundingClientRect()
    manageDragPointerOffset.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    manageGhostPosition.value = { x: rect.left, y: rect.top }
  }

  function finishManageDrag(draftLabels: string[]) {
    if (!manageDragLabel.value) return null

    let newOrder: string[] | null = null

    if (isManageDragging.value) {
      const drag = manageDragLabel.value
      const rest = draftLabels.filter(l => l !== drag)
      const k = Math.min(Math.max(manageDropIndex.value, 0), rest.length)
      newOrder = [...rest.slice(0, k), drag, ...rest.slice(k)]
    }

    // 清理拖拽状态
    manageDragLabel.value = null
    manageDragStart.value = null
    isManageDragging.value = false
    manageDropIndex.value = 0
    manageDraftLabelsRef.value = []
    categoryManageWrapRef.value = null

    return newOrder
  }

  function updateManageDropIndexFromPointerY(clientY: number, draftLabels: string[]) {
    if (!isManageDragging.value || !manageDragLabel.value) return

    const drag = manageDragLabel.value

    // 使用在 startManageDrag 时捕获的滚动容器
    const scrollEl = categoryManageWrapRef.value
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

    const restLen = draftLabels.filter(l => l !== drag).length
    const picked = pickDropIndexFromPointerY(clientY, rects, labelsVis, drag, restLen, MANAGE_DROP_STRIP_PX)
    if (!picked) return

    manageDropIndex.value = picked.k
  }

  // ==================== 窗口事件处理 ====================
  function onWindowMouseMove(event: MouseEvent) {
    // 分类管理拖拽
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
        updateManageDropIndexFromPointerY(event.clientY, manageDraftLabelsRef.value)
      }
      return
    }

    // 源拖拽
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
          if (!ctx.isCategoryExpanded(underCat, false)) {
            ctx.categoryExpanded.value = {
              ...ctx.categoryExpanded.value,
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
        const names = ctx.getOrderedRegistryNamesInCategory(src)
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

  function onWindowMouseUp(draftLabels?: string[]) {
    // 分类管理拖拽完成
    if (manageDragLabel.value) {
      const labels = draftLabels ?? manageDraftLabelsRef.value
      const newOrder = finishManageDrag(labels)
      document.documentElement.style.removeProperty('cursor')
      document.body.style.removeProperty('cursor')
      return newOrder
    }

    // 源拖拽完成
    if (!pointerDragRegistryName.value) return
    const dragName = pointerDragRegistryName.value
    const srcCat = pointerDragSourceCategory.value

    if (isPointerDragging.value && dragOverCategoryLabel.value && srcCat && dragOverCategoryLabel.value !== srcCat) {
      ctx.moveRegistryToCategory(dragName, dragOverCategoryLabel.value)
      ctx.reorderStorageAfterCrossCategoryMove(dragName, srcCat, dragOverCategoryLabel.value)
      suppressNextClick.value = true
    } else if (isPointerDragging.value && registrySortActive.value && srcCat && !searchQuery.value.trim()) {
      ctx.commitRegistryOrderWithinCategory(srcCat, dragName, registrySortDropIndex.value)
      suppressNextClick.value = true
    }
    clearPointerDragState()
    return null
  }

  // ==================== 生命周期 ====================
  function handleMouseUp() {
    const newOrder = onWindowMouseUp()
    if (newOrder) {
      ctx.applyCategoryManageOrder(newOrder)
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    document.documentElement.style.removeProperty('cursor')
    document.body.style.removeProperty('cursor')
    document.body.classList.remove('category-manage-sort-dragging')
    document.body.classList.remove('registry-list-sort-dragging')
  })

  return {
    // 源拖拽状态
    pointerDragRegistryName,
    pointerDragSourceCategory,
    registrySortDropIndex,
    registrySortActive,
    isPointerDragging,
    pointerStart,
    pointerPosition,
    dragSourceRect,
    dragPointerOffset,
    ghostPosition,
    ghostTransition,
    suppressNextClick,
    dragOverCategoryLabel,
    draggingRegistry,

    // 分类拖拽状态
    manageDragLabel,
    manageDragStart,
    isManageDragging,
    manageDropIndex,
    categoryManageScrollRef,
    manageGhostPosition,
    manageDragPointerOffset,

    // 函数
    onRegistryMouseDown,
    onCategoryMouseEnter,
    clearPointerDragState,
    startManageDrag,
    finishManageDrag,
    updateManageDropIndexFromPointerY,
    onWindowMouseMove,
    onWindowMouseUp,
  }
}
