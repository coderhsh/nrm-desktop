import { CATEGORY_LABEL_MAX_LENGTH } from './constants'

/**
 * 防止 localStorage 损坏或非对象导致渲染期抛错
 * 将未知输入安全转换为 Record<string, string[]>
 */
export function normalizeRegistryOrderRecord(v: unknown): Record<string, string[]> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      out[k] = val.filter((x): x is string => typeof x === 'string')
    }
  }
  return out
}

/**
 * 标准化分类标签：去空格、截断到最大长度
 */
export function normalizeCategoryLabel(label: string | null | undefined): string {
  if (!label) return ''
  return label.trim().slice(0, CATEGORY_LABEL_MAX_LENGTH)
}

/**
 * 根据指针 Y 坐标和 DOM 矩形数组计算拖拽插入位置
 * 用于分类管理和源列表排序
 */
export function pickDropIndexFromPointerY(
  clientY: number,
  rects: DOMRect[],
  labelsVis: string[],
  drag: string,
  restLen: number,
  stripPx: number,
): { k: number } | null {
  const n = rects.length
  if (n === 0 || labelsVis.length !== n) return null

  // 行身中部：不换位置
  for (let i = 0; i < n; i++) {
    const r = rects[i]
    if (r.height <= stripPx * 2 + 10) continue
    const innerLo = r.top + stripPx
    const innerHi = r.bottom - stripPx
    if (clientY > innerLo && clientY < innerHi) return null
  }

  // 第一个分支「正上方」：列表顶部 + 第一行顶边的窄带 → 插在 rest 最前
  if (clientY <= rects[0].top + stripPx) {
    return { k: 0 }
  }

  // 相邻两行之间的空隙 + 上行底边/下行顶边外侧窄带
  for (let i = 0; i < n - 1; i++) {
    const lo = rects[i].bottom - stripPx
    const hi = rects[i + 1].top + stripPx
    if (clientY >= lo && clientY <= hi) {
      let k = 0
      for (let j = 0; j <= i; j++) {
        if (labelsVis[j] !== drag) k++
      }
      return { k }
    }
  }

  // 最后一个分支「正下方」：最后一行底边以下的窄带 → 插在 rest 最后
  if (clientY >= rects[n - 1].bottom - stripPx) {
    return { k: restLen }
  }

  return null
}
