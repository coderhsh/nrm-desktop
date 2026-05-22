import { describe, expect, it } from 'vitest'
import { formatUpdatePublishDate } from './formatLocaleDate'

describe('formatUpdatePublishDate', () => {
  it('formats zh-CN publish date', () => {
    const text = formatUpdatePublishDate('2026-05-22T00:00:00.000Z', 'zh-CN')
    expect(text).toContain('2026')
    expect(text).toContain('22')
  })

  it('formats en publish date', () => {
    const text = formatUpdatePublishDate('2026-05-22T00:00:00.000Z', 'en')
    expect(text).toContain('2026')
    expect(text).toContain('May')
    expect(text).toContain('22')
  })

  it('returns fallback for missing or invalid values', () => {
    expect(formatUpdatePublishDate(undefined, 'en')).toBe('-')
    expect(formatUpdatePublishDate('invalid-date', 'en')).toBe('invalid-date')
  })
})
