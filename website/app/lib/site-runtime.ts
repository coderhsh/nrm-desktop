import { siteConfig } from '../site.config'
import type { FooterColumn, Locale, PageKey } from '../types/site'

type ExternalFooterLink = Extract<FooterColumn['links'][number], { href: string }>

export const pagePaths: Record<PageKey, string> = {
  home: '',
  download: '/download',
  configuration: '/configuration',
  architecture: '/architecture',
}

export const latestReleaseUrl = `${siteConfig.releasesUrl}/latest`

export const primaryNav = siteConfig.nav

const resolveFooterHref = (href: string) => {
  if (href === 'repo') return siteConfig.repoUrl
  if (href === 'releases') return siteConfig.releasesUrl
  if (href.startsWith('repo:')) return `${siteConfig.repoUrl}${href.slice('repo:'.length)}`
  return href
}

const isExternalFooterLink = (link: FooterColumn['links'][number]): link is ExternalFooterLink => {
  return 'href' in link
}

export const footerColumns: FooterColumn[] = siteConfig.footerColumns.map((column) => ({
  ...column,
  links: column.links.map((link) => {
    if (isExternalFooterLink(link)) {
      return {
        ...link,
        href: resolveFooterHref(link.href),
      }
    }
    return link
  }),
}))

export const prerenderRoutes = siteConfig.locales.flatMap((locale) => {
  return Object.values(pagePaths).map((path) => `/${locale}${path}`)
})

export const isLocale = (value: unknown): value is Locale => {
  return typeof value === 'string' && siteConfig.locales.includes(value as Locale)
}

export const normalizeLocale = (value: unknown): Locale => {
  return isLocale(value) ? value : siteConfig.defaultLocale
}

export const htmlLang = (locale: Locale) => (locale === 'zh' ? 'zh-CN' : 'en')

export const localizedPath = (locale: Locale, page: PageKey) => `/${locale}${pagePaths[page]}`
