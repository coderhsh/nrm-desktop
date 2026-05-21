import { describe, expect, it } from 'vitest'
import { buildConfigExport, formatExportTimestamp, parseConfigImport } from './config-export'
import type { Registry } from '@/types'

const registries: Registry[] = [
  { name: 'npm', url: 'https://registry.npmjs.org/' },
  { name: 'yarn', url: 'https://registry.yarnpkg.com/' },
  { name: 'corp', url: 'https://npm.corp/' },
]

describe('formatExportTimestamp', () => {
  it('formats zh-CN with year-month-day segments', () => {
    const text = formatExportTimestamp(new Date(2026, 4, 20, 17, 5, 9), 'zh-CN')
    expect(text).toBe('2026年-05月-20日 17:05:09')
  })

  it('formats en with locale string', () => {
    const text = formatExportTimestamp(new Date(2026, 4, 20, 17, 5, 9), 'en')
    expect(text).toContain('2026')
    expect(text).toContain('May')
  })
})

describe('buildConfigExport', () => {
  it('groups registries by category and omits empty/system buckets', () => {
    const payload = buildConfigExport({
      appVersion: '1.0.0',
      language: 'zh-CN',
      registries,
      categoryLabels: ['工作', '未分类', '预设源'],
      categoryByRegistry: { npm: '工作', corp: '工作' },
      registryOrderByCategory: {
        工作: ['corp', 'npm'],
        未分类: [],
        预设源: ['yarn'],
      },
      uncategorizedLabel: '未分类',
    })

    expect(payload['nrm-desktop-version']).toBe('1.0.0')
    expect(payload.exported_at).toMatch(/^\d{4}年-\d{2}月-\d{2}日 \d{2}:\d{2}:\d{2}$/)
    expect(payload.categories).toEqual([
      {
        name: '工作',
        registries: [
          { name: 'corp', url: 'https://npm.corp/' },
          { name: 'npm', url: 'https://registry.npmjs.org/' },
        ],
      },
    ])
    expect(payload.uncategorized_registries).toEqual([
      { name: 'yarn', url: 'https://registry.yarnpkg.com/' },
    ])
  })
})

describe('parseConfigImport', () => {
  it('parses grouped export and restores category layout', () => {
    const json = JSON.stringify({
      'nrm-desktop-version': '1.0.0',
      exported_at: '2026年-05月-20日 12:00:00',
      categories: [
        {
          name: '工作',
          registries: [{ name: 'npm', url: 'https://registry.npmjs.org/' }],
        },
      ],
      uncategorized_registries: [{ name: 'yarn', url: 'https://registry.yarnpkg.com/' }],
    })

    const result = parseConfigImport(json, '未分类')
    expect(result.registries).toHaveLength(2)
    expect(result.categories.categoryLabels).toEqual(['工作'])
    expect(result.categories.categoryByRegistry).toEqual({ npm: '工作' })
    expect(result.categories.registryOrderByCategory).toEqual({
      工作: ['npm'],
      未分类: ['yarn'],
    })
  })

  it('rejects legacy flat export format', () => {
    const json = JSON.stringify({
      version: '2.0',
      registries: [{ name: 'npm', url: 'https://registry.npmjs.org/', category: null }],
    })
    expect(() => parseConfigImport(json, '未分类')).toThrow('无效的配置文件格式')
  })
})
