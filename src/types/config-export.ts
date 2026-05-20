/** 导出文件中的单条源 */
export interface RegistryExportEntry {
  name: string
  url: string
}

/** 导出文件中的分类分组 */
export interface CategoryExportGroup {
  name: string
  registries: RegistryExportEntry[]
}

/** 应用配置导出文件 */
export interface NrmConfigExport {
  'nrm-desktop-version': string
  exported_at: string
  /** 已归类的源，按分类分组展示 */
  categories: CategoryExportGroup[]
  /** 未归入任何自定义分类的源 */
  uncategorized_registries: RegistryExportEntry[]
}

/** 从导出文件解析后用于写回 localStorage 的分类布局 */
export interface ConfigCategoryLayout {
  categoryLabels: string[]
  categoryByRegistry: Record<string, string>
  registryOrderByCategory: Record<string, string[]>
}

/** 解析导入文件后的完整结果 */
export interface ConfigImportResult {
  registries: { name: string; url: string }[]
  categories: ConfigCategoryLayout
}
