import type { AppLanguage } from '@/composables/useI18n'

export function formatUpdatePublishDate(
  value: string | null | undefined,
  language: AppLanguage,
): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}
