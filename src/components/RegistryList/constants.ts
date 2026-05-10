import type { Registry } from '@/types'

/** 默认预设分类标签 */
export const DEFAULT_PRESET_LABEL = '预设源'

/** 分类标签最大长度 */
export const CATEGORY_LABEL_MAX_LENGTH = 20

/** 分类管理拖拽：行间空隙触发换位的像素阈值 */
export const MANAGE_DROP_STRIP_PX = 14

/** 分类管理弹窗中的行槽位 */
export type ManageCategorySlot = {
  kind: 'row'
  label: string
  isDragPreview?: boolean
}

/** 源列表拖拽排序的行槽位 */
export type RegistrySlot = {
  registry: Registry
  isDragPreview?: boolean
}

/** 分组后的源列表 */
export type GroupedRegistries = {
  label: string
  items: Registry[]
}
