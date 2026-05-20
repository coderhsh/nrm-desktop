import type { AppLanguage } from '@/composables/useI18n'
import type { Registry } from '@/types'
import type {
  CategoryExportGroup,
  ConfigCategoryLayout,
  ConfigImportResult,
  NrmConfigExport,
  RegistryExportEntry,
} from '@/types/config-export'
import { normalizeCategoryLabel, normalizeRegistryOrderRecord } from '@/components/RegistryList/utils'

const LEGACY_PRESET_CATEGORY_LABELS = new Set(['预设源', 'Preset'])
const SYSTEM_CATEGORY_LABELS = new Set(['未分类', 'Uncategorized', ...LEGACY_PRESET_CATEGORY_LABELS])

export interface BuildConfigExportInput {
  appVersion: string
  language: AppLanguage
  registries: Registry[]
  categoryLabels: string[]
  categoryByRegistry: Record<string, string>
  registryOrderByCategory: Record<string, string[]>
  uncategorizedLabel: string
}

/** 按当前界面语言格式化导出时间 */
export function formatExportTimestamp(date: Date, language: AppLanguage): string {
  if (language === 'zh-CN') {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${y}年-${m}月-${d}日 ${h}:${min}:${s}`
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function isSystemCategoryLabel(label: string, uncategorizedLabel: string): boolean {
  return label === uncategorizedLabel || SYSTEM_CATEGORY_LABELS.has(label)
}

function orderRegistriesInCategory(
  categoryLabel: string,
  items: Registry[],
  registryOrderByCategory: Record<string, string[]>,
): RegistryExportEntry[] {
  const order = normalizeRegistryOrderRecord(registryOrderByCategory)[categoryLabel]
  if (!order?.length) {
    return [...items]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => ({ name: r.name, url: r.url }))
  }
  const byName = new Map(items.map(r => [r.name, r]))
  const ordered: RegistryExportEntry[] = []
  for (const name of order) {
    const r = byName.get(name)
    if (r) {
      ordered.push({ name: r.name, url: r.url })
      byName.delete(name)
    }
  }
  for (const r of byName.values()) {
    ordered.push({ name: r.name, url: r.url })
  }
  return ordered
}

/** 组装导出 JSON 对象（按分类分组，便于阅读） */
export function buildConfigExport(input: BuildConfigExportInput): NrmConfigExport {
  const customLabels = input.categoryLabels.filter(
    label => !isSystemCategoryLabel(label, input.uncategorizedLabel),
  )

  const categories: CategoryExportGroup[] = []
  for (const label of customLabels) {
    const inCategory = input.registries.filter(
      r => input.categoryByRegistry[r.name] === label,
    )
    if (inCategory.length === 0) continue
    categories.push({
      name: label,
      registries: orderRegistriesInCategory(label, inCategory, input.registryOrderByCategory),
    })
  }

  const uncategorizedItems = input.registries.filter(r => {
    const assigned = input.categoryByRegistry[r.name]
    return !assigned || assigned === input.uncategorizedLabel || isSystemCategoryLabel(assigned, input.uncategorizedLabel)
  })

  return {
    'nrm-desktop-version': input.appVersion,
    exported_at: formatExportTimestamp(new Date(), input.language),
    categories,
    uncategorized_registries: orderRegistriesInCategory(
      input.uncategorizedLabel,
      uncategorizedItems,
      input.registryOrderByCategory,
    ),
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseRegistryEntry(raw: unknown): RegistryExportEntry | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!name || !url) return null
  return { name, url }
}

function parseCategoryGroup(raw: unknown): CategoryExportGroup | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? normalizeCategoryLabel(raw.name) : ''
  if (!name || LEGACY_PRESET_CATEGORY_LABELS.has(name)) return null
  const registries: RegistryExportEntry[] = []
  if (Array.isArray(raw.registries)) {
    for (const item of raw.registries) {
      const entry = parseRegistryEntry(item)
      if (entry) registries.push(entry)
    }
  }
  if (registries.length === 0) return null
  return { name, registries }
}

function layoutFromGroupedExport(
  categories: CategoryExportGroup[],
  uncategorized: RegistryExportEntry[],
  uncategorizedStorageLabel: string,
): ConfigCategoryLayout {
  const categoryLabels = categories.map(c => c.name)
  const categoryByRegistry: Record<string, string> = {}
  const registryOrderByCategory: Record<string, string[]> = {}

  for (const group of categories) {
    const names = group.registries.map(r => r.name)
    registryOrderByCategory[group.name] = names
    for (const r of group.registries) {
      categoryByRegistry[r.name] = group.name
    }
  }

  if (uncategorized.length > 0) {
    registryOrderByCategory[uncategorizedStorageLabel] = uncategorized.map(r => r.name)
  }

  return { categoryLabels, categoryByRegistry, registryOrderByCategory }
}

/** 解析导入 JSON（仅支持当前分组结构） */
export function parseConfigImport(json: string, uncategorizedStorageLabel: string): ConfigImportResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('JSON 解析失败')
  }
  if (!isRecord(data)) {
    throw new Error('无效的配置文件格式')
  }

  if (!Array.isArray(data.categories) && !Array.isArray(data.uncategorized_registries)) {
    throw new Error('无效的配置文件格式')
  }

  const categories: CategoryExportGroup[] = []
  if (Array.isArray(data.categories)) {
    for (const item of data.categories) {
      const group = parseCategoryGroup(item)
      if (group) categories.push(group)
    }
  }

  const uncategorized: RegistryExportEntry[] = []
  if (Array.isArray(data.uncategorized_registries)) {
    for (const item of data.uncategorized_registries) {
      const entry = parseRegistryEntry(item)
      if (entry) uncategorized.push(entry)
    }
  }

  const seen = new Set<string>()
  const registries: { name: string; url: string }[] = []
  const pushUnique = (entry: RegistryExportEntry) => {
    if (seen.has(entry.name)) return
    seen.add(entry.name)
    registries.push({ name: entry.name, url: entry.url })
  }
  for (const group of categories) {
    for (const r of group.registries) pushUnique(r)
  }
  for (const r of uncategorized) pushUnique(r)

  if (registries.length === 0) {
    throw new Error('配置文件中没有有效的源')
  }

  return {
    registries,
    categories: layoutFromGroupedExport(categories, uncategorized, uncategorizedStorageLabel),
  }
}
